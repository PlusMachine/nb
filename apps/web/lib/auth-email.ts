import nodemailer from "nodemailer";

import { getServerEnv } from "./env";

export type AuthEmailDelivery = "smtp" | "log";
export type AuthEmailAvailability = AuthEmailDelivery | "disabled";

type AuthEmailMessage = { to: string; expiresInMinutes: number } & (
  | { type: "otp"; code: string }
  | { type: "magic_link" | "password_reset"; url: string }
);

export const getAuthEmailAvailability = (): AuthEmailAvailability => {
  const env = getServerEnv();
  if (env.EMAIL_PROVIDER === "log") {
    return env.NODE_ENV === "production" ? "disabled" : "log";
  }
  // Анонимный внутренний SMTP relay допустим; половина пары user/password — ошибка настройки.
  const credentialsComplete = Boolean(env.SMTP_USER) === Boolean(env.SMTP_PASSWORD);
  return env.SMTP_HOST && credentialsComplete ? "smtp" : "disabled";
};

export const assertAuthEmailAvailable = () => {
  if (getAuthEmailAvailability() === "disabled") {
    throw new Error("EMAIL_NOT_CONFIGURED");
  }
};

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]!);

const buildMessage = (message: AuthEmailMessage) => {
  const name = getServerEnv().SITE_NAME;
  const subject = message.type === "otp" ? `Код для входа в ${name}`
    : message.type === "magic_link" ? `Вход в ${name}` : `Сброс пароля в ${name}`;
  const action = message.type === "otp" ? `Код для входа: ${message.code}`
    : message.type === "magic_link" ? "Войти в аккаунт" : "Установить новый пароль";
  const expiration = `Срок действия — ${message.expiresInMinutes} мин.`;
  const footer = "Если вы не запрашивали это письмо, просто проигнорируйте его.";
  const text = [action, message.type === "otp" ? "" : message.url, expiration, footer].filter(Boolean).join("\n\n");
  const content = message.type === "otp"
    ? `<p style="font-size:28px;font-weight:700;letter-spacing:4px">${escapeHtml(message.code)}</p>`
    : `<p><a href="${escapeHtml(message.url)}">${escapeHtml(action)}</a></p>`;
  return { subject, text, html: `<div lang="ru" style="font-family:Arial,sans-serif;line-height:1.6"><h1>${escapeHtml(subject)}</h1>${content}<p>${expiration}</p><p>${footer}</p></div>` };
};

export const sendAuthEmail = async (message: AuthEmailMessage): Promise<AuthEmailDelivery> => {
  assertAuthEmailAvailable();
  const delivery = getAuthEmailAvailability();
  const env = getServerEnv();
  const content = buildMessage(message);
  if (delivery === "log") {
    console.info("[auth] dev email (письмо не отправлено)", { to: message.to, ...content });
    return "log";
  }

  const port = env.SMTP_PORT ?? (env.SMTP_SECURE ? 465 : 587);
  const secure = env.SMTP_SECURE || port === 465;
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure,
    requireTLS: env.NODE_ENV === "production" && !secure,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD! } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    disableFileAccess: true,
    disableUrlAccess: true
  });

  try {
    const info = await transporter.sendMail({
      from: { name: env.SITE_NAME, address: env.AUTH_FROM_EMAIL },
      to: { address: message.to, name: "" },
      ...content
    });
    if (!info.accepted.some((recipient: unknown) => {
      const address = typeof recipient === "string" ? recipient
        : recipient && typeof recipient === "object" && "address" in recipient && typeof recipient.address === "string"
          ? recipient.address : "";
      return address.toLowerCase() === message.to.toLowerCase();
    })) {
      throw new Error("EMAIL_SEND_FAILED");
    }
    return "smtp";
  } catch {
    // SMTP-ответы могут содержать адреса и детали учётной записи. В API возвращается только код.
    throw new Error("EMAIL_SEND_FAILED");
  } finally {
    transporter.close();
  }
};
