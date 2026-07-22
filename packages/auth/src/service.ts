import { accounts, authRateLimits, db, pushSubscriptions, sessions, users, verifications } from "@nb/db";
import { and, eq, gt, or, sql } from "@nb/db";

import { createOtpCode, createRandomToken, hashPassword, hashToken, verifyPassword } from "./crypto";
import type { AuthUser, OAuthProviderId, PreferredGravityUnit, SupportedCurrency, UserRole } from "./types";

type VerificationType = "otp" | "magic_link" | "password_reset";

const SESSION_TTL_DAYS = 30;
const OTP_TTL_MINUTES = 10;
const MAGIC_TTL_MINUTES = 20;
const RESET_TTL_MINUTES = 20;
const SMS_OTP_TTL_MINUTES = 5;

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const defaultDisplayName = (email: string): string => email.split("@")[0] ?? "Brewer";

const defaultDisplayNameFromPhone = (phone: string): string => `Brewer ${phone.slice(-4)}`;

// Фиксация согласия на обработку ПДн (152-ФЗ): момент и версия правовых документов.
// Проставляется ТОЛЬКО при создании нового пользователя (регистрации).
export type ConsentInput = { version: string; acceptedAt?: Date };

const consentColumns = (consent?: ConsentInput) =>
  consent ? { consentAcceptedAt: consent.acceptedAt ?? new Date(), consentVersion: consent.version } : {};

/**
 * Приводит российский номер к E.164 (`+7XXXXXXXXXX`). Принимает форматы с пробелами,
 * дефисами и скобками, ведущей `8` или `7`, либо 10 цифр без кода страны.
 * Бросает INVALID_PHONE для всего, что не похоже на российский мобильный.
 */
export const normalizePhone = (raw: string): string => {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`;
  } else if (digits.length === 10) {
    digits = `7${digits}`;
  }
  if (digits.length !== 11 || !digits.startsWith("7")) {
    throw new Error("INVALID_PHONE");
  }
  return `+${digits}`;
};

const mapUser = (user: typeof users.$inferSelect): AuthUser => ({
  id: user.id,
  email: user.email,
  emailVerified: user.emailVerified,
  phone: user.phone,
  phoneVerified: user.phoneVerified,
  displayName: user.displayName,
  preferredCurrency: (user.preferredCurrency ?? "RUB") as SupportedCurrency,
  preferredGravityUnit: (user.preferredGravityUnit ?? "plato") as PreferredGravityUnit,
  image: user.image,
  role: user.role,
  blockedAt: user.blockedAt,
  blockedReason: user.blockedReason,
  anonymizedAt: user.anonymizedAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

/** Имя обезличенного аккаунта: строка живёт дальше, но человека за ней больше нет. */
export const ANONYMIZED_DISPLAY_NAME = "Удалённый пользователь";

/** Код ошибки для всех путей входа: аккаунт заблокирован или обезличен. */
export const ACCOUNT_BLOCKED_ERROR = "ACCOUNT_BLOCKED";

/** Код ошибки регистрации: аккаунт с таким e-mail уже существует. */
export const EMAIL_TAKEN_ERROR = "EMAIL_TAKEN";

/**
 * Заблокированный или обезличенный аккаунт не входит НИКАКИМ путём (пароль, OTP,
 * OAuth, установка пароля) и не «перерегистрируется» по тому же e-mail/телефону:
 * строка users сохранена именно для этого, поэтому проверка стоит на КАЖДОМ
 * входе в аккаунт, а не только на форме пароля.
 */
const isBlocked = (user: typeof users.$inferSelect): boolean =>
  user.blockedAt !== null || user.anonymizedAt !== null;

const assertNotBlocked = (user: typeof users.$inferSelect): typeof users.$inferSelect => {
  if (isBlocked(user)) {
    throw new Error(ACCOUNT_BLOCKED_ERROR);
  }
  return user;
};

export const assertRateLimit = async (
  key: string,
  action: string,
  limit: number,
  windowSeconds: number,
  increment = 1
): Promise<void> => {
  // Атомарный fixed-window счётчик одним запросом. Раньше это был SELECT, затем
  // отдельный UPDATE count+1 — между ними нет блокировки, и N параллельных
  // запросов все читали одно значение и все проходили проверку (TOCTOU): лимит
  // держал только последовательный флуд, а `Promise.all` на сотню запросов шёл
  // мимо. Здесь инкремент и сброс окна живут в INSERT ... ON CONFLICT, время
  // берётся серверное (now()), а лимит проверяется по возвращённому счётчику.
  // Отклонённые попытки тоже инкрементируют счётчик — это осознанно: флуд
  // продлевает собственную блокировку в пределах окна.
  // increment позволяет списывать лимит пачкой (напр. массовый перенос N
  // позиций одним действием) вместо N последовательных вызовов по 1.
  const result = await db.execute(sql`
    INSERT INTO auth_rate_limits (key, action, count, reset_at, updated_at)
    VALUES (${key}, ${action}, ${increment}, now() + ${windowSeconds} * interval '1 second', now())
    ON CONFLICT (key, action) DO UPDATE SET
      count = CASE WHEN auth_rate_limits.reset_at <= now() THEN ${increment} ELSE auth_rate_limits.count + ${increment} END,
      reset_at = CASE WHEN auth_rate_limits.reset_at <= now()
        THEN now() + ${windowSeconds} * interval '1 second'
        ELSE auth_rate_limits.reset_at END,
      updated_at = now()
    RETURNING count
  `);
  const count = (result as unknown as { rows: { count: number }[] }).rows?.[0]?.count ?? increment;

  if (count > limit) {
    throw new Error("RATE_LIMITED");
  }
};

export const getOrCreateUserByEmail = async (
  email: string,
  consent?: ConsentInput
): Promise<typeof users.$inferSelect> => {
  const normalized = normalizeEmail(email);
  const [found] = await db.select().from(users).where(eq(users.email, normalized));
  if (found) {
    return assertNotBlocked(found);
  }

  const [created] = await db.insert(users).values({
    email: normalized,
    displayName: defaultDisplayName(normalized),
    emailVerified: false,
    role: "user",
    ...consentColumns(consent)
  }).returning();

  return created;
};

export const issueVerification = async ({ email, type }: { email: string; type: VerificationType }) => {
  const normalized = normalizeEmail(email);
  const raw = type === "otp" ? createOtpCode() : createRandomToken(24);
  const ttlMinutes = type === "otp" ? OTP_TTL_MINUTES : type === "magic_link" ? MAGIC_TTL_MINUTES : RESET_TTL_MINUTES;
  const tokenHash = hashToken(raw);

  await db.insert(verifications).values({
    email: normalized,
    type,
    codeHash: tokenHash,
    expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000)
  });

  return { rawToken: raw, email: normalized, expiresInMinutes: ttlMinutes };
};

export const consumeVerification = async ({ email, token, type }: { email: string; token: string; type: VerificationType }) => {
  const normalized = normalizeEmail(email);
  const tokenHash = hashToken(token);

  const [found] = await db.select().from(verifications).where(and(
    eq(verifications.email, normalized),
    eq(verifications.type, type),
    eq(verifications.codeHash, tokenHash)
  ));

  if (!found) {
    throw new Error("INVALID_TOKEN");
  }

  if (found.usedAt) {
    throw new Error("TOKEN_USED");
  }

  if (found.expiresAt <= new Date()) {
    throw new Error("TOKEN_EXPIRED");
  }

  await db.update(verifications).set({ usedAt: new Date(), attempts: found.attempts + 1 }).where(eq(verifications.id, found.id));
};

export const createSession = async ({ userId, userAgent, ipAddress }: { userId: string; userAgent?: string | null; ipAddress?: string | null }) => {
  const rawToken = createRandomToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({ userId, tokenHash, expiresAt, userAgent: userAgent ?? null, ipAddress: ipAddress ?? null });

  return { rawToken, expiresAt };
};

export const getUserBySessionToken = async (rawToken: string): Promise<AuthUser | null> => {
  const tokenHash = hashToken(rawToken);
  const [row] = await db.select({ user: users, sessionId: sessions.id }).from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())));

  if (!row) {
    return null;
  }

  // Роль и флаги читаются из users на КАЖДОМ запросе (innerJoin выше), поэтому
  // блокировка действует мгновенно: живая кука забаненного больше не авторизует.
  if (isBlocked(row.user)) {
    return null;
  }

  return mapUser(row.user);
};

export const revokeSession = async (rawToken: string): Promise<void> => {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(rawToken)));
};

const isEmailUniqueConstraintError = (error: unknown) => error instanceof Error
  && (error.message.includes("users_email_uidx") || (error as { code?: string }).code === "23505");

/**
 * Регистрация по паролю — единственный путь, создающий аккаунт с паролем.
 * Намеренно НЕ get-or-create: если строка с таким e-mail уже есть, пароль ей не
 * ставится и не перезаписывается — иначе кто угодно, зная чужой адрес, забирал бы
 * аккаунт обычной «регистрацией». Занятым считается ЛЮБОЙ существующий e-mail, в
 * том числе у аккаунта без пароля (заведён через OAuth или телефон): ему пароль
 * тоже не проставляем, вход туда — через свой провайдер или восстановление пароля.
 */
export const registerWithPassword = async ({
  email,
  password,
  consent
}: {
  email: string;
  password: string;
  consent?: ConsentInput;
}): Promise<AuthUser> => {
  const normalized = normalizeEmail(email);
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) {
    throw new Error(EMAIL_TAKEN_ERROR);
  }

  const passwordHash = await hashPassword(password);

  try {
    const [created] = await db.insert(users).values({
      email: normalized,
      displayName: defaultDisplayName(normalized),
      emailVerified: false,
      role: "user",
      passwordHash,
      ...consentColumns(consent)
    }).returning();

    return mapUser(created);
  } catch (error) {
    // Гонка двух параллельных регистраций: вторую отсекает users_email_uidx.
    if (isEmailUniqueConstraintError(error)) {
      throw new Error(EMAIL_TAKEN_ERROR);
    }
    throw error;
  }
};

/**
 * Перезаписывает пароль существующего (или заводит новый) аккаунт по e-mail.
 * Инвариант: звать ТОЛЬКО после подтверждения владения адресом — то есть после
 * consumeVerification по токену из письма (сброс пароля). Для регистрации есть
 * registerWithPassword: без гейта по токену эта функция = захват чужой учётки.
 */
export const setPassword = async ({
  email,
  password,
  consent
}: {
  email: string;
  password: string;
  consent?: ConsentInput;
}) => {
  const user = await getOrCreateUserByEmail(email, consent);
  await db.update(users).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(users.id, user.id));
  return mapUser(user);
};

export const signInWithPassword = async ({ email, password }: { email: string; password: string }): Promise<AuthUser> => {
  const normalized = normalizeEmail(email);
  const [user] = await db.select().from(users).where(eq(users.email, normalized));
  if (!user?.passwordHash) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw new Error("INVALID_CREDENTIALS");
  }

  // Проверка ПОСЛЕ сверки пароля: иначе факт блокировки конкретного аккаунта
  // раскрывался бы любому, кто просто перебирает адреса.
  return mapUser(assertNotBlocked(user));
};

export const completeEmailSignIn = async ({
  email,
  consent
}: {
  email: string;
  consent?: ConsentInput;
}): Promise<AuthUser> => {
  const user = await getOrCreateUserByEmail(email, consent);
  const [updated] = await db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, user.id)).returning();
  return mapUser(updated ?? user);
};

export const getOrCreateUserByPhone = async (
  phone: string,
  consent?: ConsentInput
): Promise<typeof users.$inferSelect> => {
  const normalized = normalizePhone(phone);
  const [found] = await db.select().from(users).where(eq(users.phone, normalized));
  if (found) {
    return assertNotBlocked(found);
  }

  const [created] = await db.insert(users).values({
    phone: normalized,
    displayName: defaultDisplayNameFromPhone(normalized),
    phoneVerified: false,
    role: "user",
    ...consentColumns(consent)
  }).returning();

  return created;
};

export const issuePhoneVerification = async ({ phone }: { phone: string }) => {
  const normalized = normalizePhone(phone);
  const raw = createOtpCode();
  const codeHash = hashToken(raw);

  await db.insert(verifications).values({
    phone: normalized,
    type: "sms_otp",
    codeHash,
    expiresAt: new Date(Date.now() + SMS_OTP_TTL_MINUTES * 60 * 1000)
  });

  return { rawToken: raw, phone: normalized, expiresInMinutes: SMS_OTP_TTL_MINUTES };
};

export const consumePhoneVerification = async ({ phone, code }: { phone: string; code: string }) => {
  const normalized = normalizePhone(phone);
  const codeHash = hashToken(code);

  const [found] = await db.select().from(verifications).where(and(
    eq(verifications.phone, normalized),
    eq(verifications.type, "sms_otp"),
    eq(verifications.codeHash, codeHash)
  ));

  if (!found) {
    throw new Error("INVALID_TOKEN");
  }

  if (found.usedAt) {
    throw new Error("TOKEN_USED");
  }

  if (found.expiresAt <= new Date()) {
    throw new Error("TOKEN_EXPIRED");
  }

  await db.update(verifications).set({ usedAt: new Date(), attempts: found.attempts + 1 }).where(eq(verifications.id, found.id));
};

export const completePhoneSignIn = async ({
  phone,
  consent
}: {
  phone: string;
  consent?: ConsentInput;
}): Promise<AuthUser> => {
  const user = await getOrCreateUserByPhone(phone, consent);
  const [updated] = await db.update(users).set({ phoneVerified: true, updatedAt: new Date() }).where(eq(users.id, user.id)).returning();
  return mapUser(updated ?? user);
};

export const updateProfile = async ({
  userId,
  displayName,
  preferredCurrency,
  preferredGravityUnit
}: {
  userId: string;
  displayName: string;
  preferredCurrency: SupportedCurrency;
  preferredGravityUnit: PreferredGravityUnit;
}): Promise<AuthUser> => {
  const [updated] = await db.update(users).set({
    displayName,
    preferredCurrency,
    preferredGravityUnit,
    updatedAt: new Date()
  }).where(eq(users.id, userId)).returning();
  if (!updated) {
    throw new Error("USER_NOT_FOUND");
  }
  return mapUser(updated);
};

/**
 * `db` либо транзакция вызывающего: снятие роли/блокировка/обезличивание админа
 * должны коммититься в одной транзакции с проверкой «остался ли живой админ»
 * (см. features/admin-users/service.ts) — иначе проверка и запись разъезжаются.
 */
export type AuthWriteExecutor = Pick<typeof db, "select" | "update" | "delete">;

export const setRole = async (
  { userId, role }: { userId: string; role: UserRole },
  executor: AuthWriteExecutor = db
) => {
  await executor.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
};

/** Погасить все сессии пользователя (принудительный выход со всех устройств). */
export const revokeAllUserSessions = async (
  userId: string,
  executor: AuthWriteExecutor = db
): Promise<void> => {
  await executor.delete(sessions).where(eq(sessions.userId, userId));
};

export const blockUser = async ({
  userId,
  reason,
  byUserId
}: {
  userId: string;
  reason: string;
  byUserId?: string | null;
}, executor: AuthWriteExecutor = db): Promise<AuthUser> => {
  const [updated] = await executor.update(users).set({
    blockedAt: new Date(),
    blockedReason: reason.trim(),
    blockedByUserId: byUserId ?? null,
    updatedAt: new Date()
  }).where(eq(users.id, userId)).returning();

  if (!updated) {
    throw new Error("USER_NOT_FOUND");
  }

  // Без гашения сессий блокировка «доедет» только на следующем запросе с новой
  // кукой — а живая кука продолжила бы работать до истечения TTL.
  await revokeAllUserSessions(userId, executor);
  // Пуш-подписка живёт в браузере отдельно от сессии: не сняв её, мы бы продолжали
  // слать уведомления аккаунту, которому уже закрыли вход. Снятие блокировки
  // подписку НЕ возвращает — уведомления включаются заново из настроек.
  await executor.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));

  return mapUser(updated);
};

export const unblockUser = async ({ userId }: { userId: string }): Promise<AuthUser> => {
  const [updated] = await db.update(users).set({
    blockedAt: null,
    blockedReason: null,
    blockedByUserId: null,
    updatedAt: new Date()
  }).where(eq(users.id, userId)).returning();

  if (!updated) {
    throw new Error("USER_NOT_FOUND");
  }

  return mapUser(updated);
};

/**
 * Обезличивание вместо удаления: ПДн затираются, строка users остаётся живой —
 * иначе рвутся ссылки (авторство рецептов, аудит). blockedAt ставится вместе с
 * anonymizedAt: пустой аккаунт без пароля и почты не должен считаться «активным».
 *
 * Отличие от блокировки: e-mail и телефон обнуляются, поэтому адрес освобождается и
 * тот же человек может завести НОВЫЙ (чистый, без истории) аккаунт на него. Так и
 * задумано — хранить адрес, чтобы им же и не пускать, значило бы хранить те самые
 * ПДн, ради стирания которых обезличивание и делается. Держать нарушителя закрытым
 * должна блокировка: она строку e-mail сохраняет.
 *
 * Хвосты без FK: verifications и auth_rate_limits ключуются СТРОКОЙ e-mail/телефона
 * и каскадом не чистятся — их сносим руками, иначе на затёртый адрес всё ещё
 * можно запросить OTP.
 *
 * Push-подписки сносим явно, хотя FK у них cascade: каскад привязан к УДАЛЕНИЮ строки
 * users, а она тут остаётся живой. Иначе endpoint (уникальный на установку браузера)
 * и user_agent пережили бы обезличивание — и в БД, и в /admin/push.
 */
export const anonymizeUser = async ({
  userId,
  byUserId
}: {
  userId: string;
  byUserId?: string | null;
}, executor: AuthWriteExecutor = db): Promise<AuthUser> => {
  const [existing] = await executor.select().from(users).where(eq(users.id, userId));
  if (!existing) {
    throw new Error("USER_NOT_FOUND");
  }

  const now = new Date();
  const [updated] = await executor.update(users).set({
    email: null,
    phone: null,
    passwordHash: null,
    image: null,
    displayName: ANONYMIZED_DISPLAY_NAME,
    emailVerified: false,
    phoneVerified: false,
    anonymizedAt: now,
    blockedAt: existing.blockedAt ?? now,
    blockedByUserId: existing.blockedByUserId ?? byUserId ?? null,
    updatedAt: now
  }).where(eq(users.id, userId)).returning();

  if (!updated) {
    throw new Error("USER_NOT_FOUND");
  }

  await revokeAllUserSessions(userId, executor);
  // OAuth-привязки: без них обезличенный войдёт через VK/Яндекс и заново «оживёт».
  await executor.delete(accounts).where(eq(accounts.userId, userId));
  await executor.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));

  const identifiers = [
    existing.email ? eq(verifications.email, existing.email) : null,
    existing.phone ? eq(verifications.phone, existing.phone) : null
  ].filter((clause): clause is ReturnType<typeof eq> => clause !== null);

  if (identifiers.length > 0) {
    await executor.delete(verifications).where(identifiers.length === 1 ? identifiers[0] : or(...identifiers));
  }

  const rateLimitKeys = [
    existing.email ? eq(authRateLimits.key, existing.email) : null,
    existing.phone ? eq(authRateLimits.key, existing.phone) : null
  ].filter((clause): clause is ReturnType<typeof eq> => clause !== null);

  if (rateLimitKeys.length > 0) {
    await executor.delete(authRateLimits).where(rateLimitKeys.length === 1 ? rateLimitKeys[0] : or(...rateLimitKeys));
  }

  return mapUser(updated);
};

export const linkOAuthAccount = async ({ provider, providerAccountId, email, displayName, image, accessToken, refreshToken, consent }: {
  provider: OAuthProviderId;
  providerAccountId: string;
  email: string;
  displayName?: string;
  image?: string;
  accessToken?: string;
  refreshToken?: string;
  consent?: ConsentInput;
}) => {
  const normalized = normalizeEmail(email);

  const [existingAccount] = await db.select().from(accounts).where(and(eq(accounts.provider, provider), eq(accounts.providerAccountId, providerAccountId)));

  if (existingAccount) {
    const [existingUser] = await db.select().from(users).where(eq(users.id, existingAccount.userId));
    if (!existingUser) {
      throw new Error("USER_NOT_FOUND");
    }
    return mapUser(assertNotBlocked(existingUser));
  }

  let [user] = await db.select().from(users).where(eq(users.email, normalized));
  if (user) {
    assertNotBlocked(user);
  } else {
    [user] = await db.insert(users).values({
      email: normalized,
      emailVerified: true,
      displayName: displayName?.trim() || defaultDisplayName(normalized),
      image: image ?? null,
      role: "user",
      ...consentColumns(consent)
    }).returning();
  }

  await db.insert(accounts).values({
    userId: user.id,
    provider,
    providerAccountId,
    accessToken,
    refreshToken
  }).onConflictDoUpdate({
    target: [accounts.provider, accounts.providerAccountId],
    set: { accessToken, refreshToken, updatedAt: new Date() }
  });

  return mapUser(user);
};

export const cleanupExpiredVerifications = async (): Promise<void> => {
  await db.delete(verifications).where(and(sql`${verifications.expiresAt} <= now()`, sql`${verifications.usedAt} is not null`));
};
