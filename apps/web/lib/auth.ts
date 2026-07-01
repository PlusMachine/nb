import { getServerEnv } from "./env";
import { assertRussianEmailDomain } from "./email-policy";
import { sendSms } from "./sms";

import {
  assertRateLimit,
  completeEmailSignIn,
  completePhoneSignIn,
  consumePhoneVerification,
  consumeVerification,
  createSession,
  getUserBySessionToken,
  issuePhoneVerification,
  issueVerification,
  linkOAuthAccount,
  normalizePhone,
  revokeSession,
  setPassword,
  signInWithPassword,
  updateProfile,
  type OAuthProviderId,
  type SupportedCurrency,
  type UserRole
} from "@nb/auth";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";


const SESSION_COOKIE = "nb_session";

export const roleWeights: Record<UserRole, number> = { user: 1, editor: 2, moderator: 3, admin: 4 };

export const hasRequiredRole = (current: UserRole, required: UserRole) => roleWeights[current] >= roleWeights[required];

/**
 * Удобство для разработки: если вне production задана переменная DEV_AUTH_EMAIL,
 * любой запрос без валидной сессии трактуется как этот пользователь — чтобы не
 * логиниться постоянно при работе над мастером рецептов и т.п.
 *
 * Пользователь берётся (или создаётся) в БД по email, поэтому user.id ссылается
 * на реальную запись и рецепты сохраняются как обычно. Жёстко отключено в
 * production: даже если переменная случайно окажется задана на проде, обхода нет.
 */
const devAuthEmail =
  process.env.NODE_ENV === "production" ? undefined : process.env.DEV_AUTH_EMAIL?.trim() || undefined;

/**
 * Логирование секретов аутентификации (OTP-код, magic-link, ссылка сброса пароля)
 * допустимо ТОЛЬКО вне production: в dev это единственный канал доставки (реальная
 * отправка письма для этих flow не подключена). В production сырой токен в логах —
 * это риск захвата аккаунта, поэтому здесь no-op.
 */
const logAuthSecret = (label: string, payload: unknown) => {
  if (process.env.NODE_ENV !== "production") {
    console.info(label, payload);
  }
};

export const getSessionUser = async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    const user = await getUserBySessionToken(token);
    if (user) {
      return user;
    }
  }
  if (devAuthEmail) {
    return completeEmailSignIn({ email: devAuthEmail });
  }
  return null;
};

export const requireUser = async () => {
  const user = await getSessionUser();
  if (!user) {
    // Возвращаем пользователя туда, куда он шёл: путь берём из заголовка,
    // который проставляет middleware (safe-проверка на login-стороне).
    const pathname = (await headers()).get("x-pathname");
    const next = pathname && pathname.startsWith("/") && !pathname.startsWith("//")
      ? `?next=${encodeURIComponent(pathname)}`
      : "";
    redirect(`/login${next}`);
  }
  return user;
};

export const requireRole = async (role: UserRole) => {
  const user = await requireUser();
  if (!hasRequiredRole(user.role, role)) {
    redirect("/app");
  }
  return user;
};

export const startEmailOtp = async (email: string) => {
  assertRussianEmailDomain(email);
  await assertRateLimit(email.toLowerCase(), "otp", 5, 10 * 60);
  const verification = await issueVerification({ email, type: "otp" });
  logAuthSecret("[auth] OTP token", verification);
};

export const startPhoneOtp = async (phone: string) => {
  const normalized = normalizePhone(phone);
  await assertRateLimit(normalized, "sms_otp", 5, 10 * 60);
  const verification = await issuePhoneVerification({ phone: normalized });
  await sendSms({ to: verification.phone, text: `Код для входа: ${verification.rawToken}` });
};

export const verifyPhoneOtp = async (phone: string, code: string) => {
  await consumePhoneVerification({ phone, code });
  const user = await completePhoneSignIn({ phone });
  await establishSession(user.id);
};

export const verifyEmailOtp = async (email: string, code: string) => {
  await consumeVerification({ email, token: code, type: "otp" });
  const user = await completeEmailSignIn({ email });
  await establishSession(user.id);
};

export const startMagicLink = async (email: string) => {
  assertRussianEmailDomain(email);
  await assertRateLimit(email.toLowerCase(), "magic_link", 5, 10 * 60);
  const env = getServerEnv();
  const verification = await issueVerification({ email, type: "magic_link" });
  const link = `${env.APP_URL}/api/auth/magic/consume?email=${encodeURIComponent(verification.email)}&token=${verification.rawToken}`;
  logAuthSecret("[auth] Magic link", { ...verification, link });
};

export const consumeMagicLink = async (email: string, token: string) => {
  await consumeVerification({ email, token, type: "magic_link" });
  const user = await completeEmailSignIn({ email });
  await establishSession(user.id);
};

export const establishSession = async (userId: string) => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const { rawToken, expiresAt } = await createSession({
    userId,
    ipAddress: headerStore.get("x-forwarded-for") ?? "local",
    userAgent: headerStore.get("user-agent")
  });

  cookieStore.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
};

export const logout = async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await revokeSession(token);
  }
  cookieStore.delete(SESSION_COOKIE);
};

export const passwordLogin = async (email: string, password: string) => {
  const user = await signInWithPassword({ email, password });
  await establishSession(user.id);
};

export const passwordSignup = async (email: string, password: string) => {
  assertRussianEmailDomain(email);
  await setPassword({ email, password });
  await passwordLogin(email, password);
};

export const requestPasswordReset = async (email: string) => {
  await assertRateLimit(email.toLowerCase(), "password_reset", 3, 10 * 60);
  const env = getServerEnv();
  const verification = await issueVerification({ email, type: "password_reset" });
  const link = `${env.APP_URL}/login?email=${encodeURIComponent(verification.email)}&flow=reset&token=${verification.rawToken}`;
  logAuthSecret("[auth] Password reset", { ...verification, link });
};

export const resetPassword = async (email: string, token: string, password: string) => {
  await consumeVerification({ email, token, type: "password_reset" });
  await setPassword({ email, password });
  await passwordLogin(email, password);
};

export const updateCurrentProfile = async ({
  displayName,
  preferredCurrency
}: {
  displayName: string;
  preferredCurrency: SupportedCurrency;
}) => {
  const user = await requireUser();
  return updateProfile({ userId: user.id, displayName, preferredCurrency });
};

export const oauthFinalize = async (payload: {
  provider: OAuthProviderId;
  providerAccountId: string;
  email: string;
  displayName?: string;
  image?: string;
  accessToken?: string;
  refreshToken?: string;
}) => {
  const user = await linkOAuthAccount(payload);
  await establishSession(user.id);
  return user;
};
