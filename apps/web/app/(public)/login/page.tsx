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
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [flow, setFlow] = useState<"otp" | "magic" | "password">("otp");
  const [message, setMessage] = useState<string>("");

  const canContinue = useMemo(() => email.includes("@"), [email]);

  // ?next= читаем в момент клика (не useSearchParams — чтобы не тянуть Suspense
  // и не делать страницу динамической). После входа возвращаем туда, откуда пришли.
  const redirectAfterAuth = () => {
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = resolveSafeNextPath(next);
  };

  return (
    <section className="mx-auto mt-14 max-w-md space-y-4 rounded-xl border p-6">
      <h1 className="text-2xl font-semibold">Вход и регистрация</h1>
      <p className="text-sm text-zinc-600">Один сценарий входа: новый аккаунт создастся автоматически при первом успешном входе.</p>

      <input className="w-full rounded border p-2" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />

      <div className="flex gap-2 text-sm">
        <button className="rounded border px-3 py-1" onClick={() => setFlow("otp")}>OTP</button>
        <button className="rounded border px-3 py-1" onClick={() => setFlow("magic")}>Magic link</button>
        <button className="rounded border px-3 py-1" onClick={() => setFlow("password")}>Password (fallback)</button>
      </div>

      {flow === "otp" && (
        <div className="space-y-2">
          <button
            disabled={!canContinue}
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

      {flow === "magic" && (
        <button disabled={!canContinue} className="w-full rounded bg-black p-2 text-white disabled:opacity-40" onClick={async () => {
          const result = await postJson("/api/auth/magic", { email });
          setMessage(result.ok ? "Ссылка отправлена (см. server logs)" : result.error ?? "Ошибка");
        }}>Продолжить</button>
      )}

      {flow === "password" && (
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

      <div className="grid grid-cols-3 gap-2">
        <Link className="rounded border p-2 text-center text-sm" href="/api/auth/oauth/vk">VK</Link>
        <Link className="rounded border p-2 text-center text-sm" href="/api/auth/oauth/yandex">Yandex</Link>
        <Link className="rounded border p-2 text-center text-sm" href="/api/auth/oauth/google">Google</Link>
      </div>

      {message && <p className="text-sm text-zinc-600">{message}</p>}
    </section>
  );
}
