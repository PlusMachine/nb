"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { resolveSafeNextPath } from "@/lib/auth-links";

const postJson = async (url: string, body: Record<string, string>) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  return response.json();
};

export default function LoginPage() {
  const [method, setMethod] = useState<"phone" | "email">("phone");

  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [emailFlow, setEmailFlow] = useState<"otp" | "magic" | "password">("otp");

  const [message, setMessage] = useState<string>("");

  const phoneDigits = useMemo(() => phone.replace(/\D/g, ""), [phone]);
  const canSendSms = phoneDigits.length >= 10;
  const canContinueEmail = useMemo(() => email.includes("@"), [email]);

  // ?next= читаем в момент клика (не useSearchParams — чтобы не тянуть Suspense
  // и не делать страницу динамической). После входа возвращаем туда, откуда пришли.
  const redirectAfterAuth = () => {
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = resolveSafeNextPath(next);
  };

  return (
    <section className="mx-auto mt-14 max-w-md space-y-4 rounded-xl border p-6">
      <h1 className="text-2xl font-semibold">Вход и регистрация</h1>
      <p className="text-sm text-zinc-600">Новый аккаунт создастся автоматически при первом успешном входе.</p>

      <div className="flex gap-2 text-sm">
        <button
          className={`rounded border px-3 py-1 ${method === "phone" ? "bg-black text-white" : ""}`}
          onClick={() => setMethod("phone")}
        >
          По телефону
        </button>
        <button
          className={`rounded border px-3 py-1 ${method === "email" ? "bg-black text-white" : ""}`}
          onClick={() => setMethod("email")}
        >
          По e-mail
        </button>
      </div>

      {method === "phone" && (
        <div className="space-y-2">
          <input
            className="w-full rounded border p-2"
            placeholder="+7 999 123-45-67"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <button
            disabled={!canSendSms}
            className="w-full rounded bg-black p-2 text-white disabled:opacity-40"
            onClick={async () => {
              const result = await postJson("/api/auth/phone", { action: "request", phone });
              setMessage(result.ok ? "Код отправлен по SMS (в dev — см. логи сервера)" : result.error ?? "Ошибка отправки кода");
            }}
          >
            Получить код
          </button>
          <div className="flex gap-2">
            <input
              className="w-full rounded border p-2"
              placeholder="Код из SMS"
              inputMode="numeric"
              value={smsCode}
              onChange={(event) => setSmsCode(event.target.value)}
            />
            <button
              className="rounded bg-black px-4 text-white"
              onClick={async () => {
                const result = await postJson("/api/auth/phone", { action: "verify", phone, code: smsCode });
                if (result.ok) {
                  redirectAfterAuth();
                } else {
                  setMessage(result.error ?? "Неверный код");
                }
              }}
            >
              Войти
            </button>
          </div>
        </div>
      )}

      {method === "email" && (
        <div className="space-y-3">
          <input className="w-full rounded border p-2" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />

          <div className="flex gap-2 text-sm">
            <button className="rounded border px-3 py-1" onClick={() => setEmailFlow("otp")}>OTP</button>
            <button className="rounded border px-3 py-1" onClick={() => setEmailFlow("magic")}>Magic link</button>
            <button className="rounded border px-3 py-1" onClick={() => setEmailFlow("password")}>Пароль</button>
          </div>

          {emailFlow === "otp" && (
            <div className="space-y-2">
              <button
                disabled={!canContinueEmail}
                className="w-full rounded bg-black p-2 text-white disabled:opacity-40"
                onClick={async () => setMessage((await postJson("/api/auth/otp", { action: "request", email })).ok ? "OTP отправлен (см. server logs)" : "Ошибка отправки OTP")}
              >
                Продолжить
              </button>
              <div className="flex gap-2">
                <input className="w-full rounded border p-2" placeholder="Код из email" value={code} onChange={(event) => setCode(event.target.value)} />
                <button className="rounded bg-black px-4 text-white" onClick={async () => {
                  const result = await postJson("/api/auth/otp", { action: "verify", email, code });
                  if (result.ok) {
                    redirectAfterAuth();
                  } else {
                    setMessage(result.error ?? "Неверный код");
                  }
                }}>Войти</button>
              </div>
            </div>
          )}

          {emailFlow === "magic" && (
            <button disabled={!canContinueEmail} className="w-full rounded bg-black p-2 text-white disabled:opacity-40" onClick={async () => {
              const result = await postJson("/api/auth/magic", { email });
              setMessage(result.ok ? "Ссылка отправлена (см. server logs)" : result.error ?? "Ошибка");
            }}>Продолжить</button>
          )}

          {emailFlow === "password" && (
            <div className="space-y-2">
              <input className="w-full rounded border p-2" placeholder="Пароль" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <button className="rounded border p-2" onClick={async () => {
                  const result = await postJson("/api/auth/password", { action: "login", email, password });
                  if (result.ok) {
                    redirectAfterAuth();
                    return;
                  }
                  setMessage(result.error ?? "Ошибка входа");
                }}>Войти</button>
                <button className="rounded border p-2" onClick={async () => {
                  const result = await postJson("/api/auth/password", { action: "signup", email, password });
                  if (result.ok) {
                    redirectAfterAuth();
                    return;
                  }
                  setMessage(result.error ?? "Ошибка регистрации");
                }}>Создать пароль</button>
              </div>
              <div className="space-y-2 border-t pt-2">
                <button className="rounded border px-3 py-1 text-sm" onClick={async () => {
                  const result = await postJson("/api/auth/password", { action: "request-reset", email });
                  setMessage(result.ok ? "Reset token отправлен (см. server logs)" : result.error ?? "Ошибка reset");
                }}>Сбросить пароль</button>
                <input className="w-full rounded border p-2" placeholder="Reset token" value={token} onChange={(event) => setToken(event.target.value)} />
                <button className="rounded border p-2" onClick={async () => {
                  const result = await postJson("/api/auth/password", { action: "reset", email, token, password });
                  if (result.ok) {
                    redirectAfterAuth();
                    return;
                  }
                  setMessage(result.error ?? "Ошибка reset");
                }}>Подтвердить reset</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 border-t pt-4">
        <Link className="rounded border p-2 text-center text-sm" href="/api/auth/oauth/vk">VK ID</Link>
        <Link className="rounded border p-2 text-center text-sm" href="/api/auth/oauth/yandex">Яндекс ID</Link>
      </div>

      {message && <p className="text-sm text-zinc-600">{message}</p>}
    </section>
  );
}
