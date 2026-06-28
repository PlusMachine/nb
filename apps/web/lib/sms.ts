import type { ServerEnv } from "@nb/shared";

import { getServerEnv } from "./env";

type SmsMessage = { to: string; text: string };

const isProduction = process.env.NODE_ENV === "production";

// SMSC.ru — один из распространённых российских SMS-шлюзов. Точные параметры аккаунта
// (login/psw либо apikey, sender) задаются через env; здесь — минимальный JSON-режим.
const sendViaSmsc = async (env: ServerEnv, { to, text }: SmsMessage): Promise<void> => {
  const params = new URLSearchParams({
    psw: env.SMS_API_KEY ?? "",
    phones: to,
    mes: text,
    fmt: "3"
  });
  if (env.SMS_LOGIN) params.set("login", env.SMS_LOGIN);
  if (env.SMS_SENDER) params.set("sender", env.SMS_SENDER);

  const response = await fetch("https://smsc.ru/sys/send.php", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params
  });
  if (!response.ok) {
    throw new Error("SMS_SEND_FAILED");
  }
  const payload = await response.json().catch(() => null);
  if (payload?.error) {
    throw new Error("SMS_SEND_FAILED");
  }
};

// SMS.ru — альтернативный шлюз (api_id).
const sendViaSmsRu = async (env: ServerEnv, { to, text }: SmsMessage): Promise<void> => {
  const params = new URLSearchParams({
    api_id: env.SMS_API_KEY ?? "",
    to,
    msg: text,
    json: "1"
  });
  if (env.SMS_SENDER) params.set("from", env.SMS_SENDER);

  const response = await fetch("https://sms.ru/sms/send", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params
  });
  if (!response.ok) {
    throw new Error("SMS_SEND_FAILED");
  }
  const payload = await response.json().catch(() => null);
  if (payload && payload.status !== "OK") {
    throw new Error("SMS_SEND_FAILED");
  }
};

/**
 * Отправка SMS с кодом входа. Вне production (или при SMS_PROVIDER=log) реальный шлюз
 * не вызывается — код пишется в логи сервера, как и e-mail OTP/magic-link. Это позволяет
 * разрабатывать и тестировать вход по телефону без подключения SMS-провайдера.
 */
export const sendSms = async ({ to, text }: SmsMessage): Promise<void> => {
  const env = getServerEnv();

  if (env.SMS_PROVIDER === "log" || !isProduction) {
    console.info("[auth] SMS", { to, text });
    return;
  }

  if (!env.SMS_API_KEY) {
    throw new Error("SMS_NOT_CONFIGURED");
  }

  if (env.SMS_PROVIDER === "smsc") {
    await sendViaSmsc(env, { to, text });
    return;
  }

  if (env.SMS_PROVIDER === "smsru") {
    await sendViaSmsRu(env, { to, text });
    return;
  }

  throw new Error("SMS_NOT_CONFIGURED");
};
