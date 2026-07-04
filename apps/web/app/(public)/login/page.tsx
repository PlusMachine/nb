"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentProps, type MouseEvent } from "react";
import { Button, Card, Input } from "@nb/ui";

import { resolveSafeNextPath } from "@/lib/auth-links";
import { LEGAL_DOC_VERSION } from "@/lib/legal-meta";
import { SIGNUP_CONSENT_COOKIE, SIGNUP_CONSENT_MAX_AGE_SECONDS } from "@/lib/oauth-consent";

const isDev = process.env.NODE_ENV !== "production";

const postJson = async (url: string, body: Record<string, unknown>) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  return response.json();
};

// Машинные коды ошибок auth-эндпоинтов (см. throw new Error(...) в
// packages/auth/src/service.ts и apps/web/lib/*) → понятный пользователю текст.
// Неизвестный/отсутствующий код — общий фолбэк, а не сырой код на экране.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  captcha_required: "Не пройдена проверка на робота. Обновите страницу и попробуйте ещё раз.",
  invalid_action: "Действие не поддерживается. Обновите страницу.",
  RATE_LIMITED: "Слишком много попыток. Попробуйте позже.",
  INVALID_PHONE: "Проверьте номер телефона.",
  INVALID_TOKEN: "Код или ссылка недействительны.",
  TOKEN_USED: "Код или ссылка уже использованы — запросите новые.",
  TOKEN_EXPIRED: "Код или ссылка устарели — запросите новые.",
  INVALID_CREDENTIALS: "Неверный e-mail или пароль.",
  consent_required: "Отметьте согласие с условиями и обработкой персональных данных.",
  EMAIL_DOMAIN_NOT_ALLOWED: "Этот почтовый домен не поддерживается — нужен российский e-mail.",
  USER_NOT_FOUND: "Пользователь не найден.",
  SMS_SEND_FAILED: "Не получилось отправить SMS. Попробуйте ещё раз.",
  SMS_NOT_CONFIGURED: "Отправка SMS сейчас недоступна."
};

const FALLBACK_ERROR_MESSAGE = "Не получилось. Попробуйте ещё раз.";

const humanizeAuthError = (code?: string | null): string =>
  (code && AUTH_ERROR_MESSAGES[code]) || FALLBACK_ERROR_MESSAGE;

type StatusMessage = { kind: "success" | "error"; text: string; devHint?: boolean };

// label + Input в едином стиле формы входа.
// hideLabel — для строк «поле + кнопка», где видимый label ломает компоновку:
// подпись остаётся доступной для скринридеров (sr-only), а сам label растягивается
// как flex-item (flex-1) вместо прежнего Input, который был там раньше.
const Field = ({
  label,
  hideLabel,
  ...props
}: { label: string; hideLabel?: boolean } & ComponentProps<typeof Input>) => (
  <label className={hideLabel ? "block flex-1" : "block space-y-1.5 text-sm"}>
    <span className={hideLabel ? "sr-only" : "font-medium text-zinc-700"}>{label}</span>
    <Input {...props} />
  </label>
);

const StatusLine = ({ status }: { status: StatusMessage | null }) => {
  if (!status) {
    return null;
  }
  return (
    <div className="space-y-1">
      <p className={`text-sm ${status.kind === "error" ? "text-red-600" : "text-zinc-600"}`}>{status.text}</p>
      {status.devHint && isDev ? (
        <p className="text-xs text-zinc-400">В dev-режиме код и ссылки выводятся в логи сервера.</p>
      ) : null}
    </div>
  );
};

export default function LoginPage() {
  const [method, setMethod] = useState<"phone" | "email">("phone");

  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [emailFlow, setEmailFlow] = useState<"otp" | "magic" | "password">("otp");
  const [resetToken, setResetToken] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [pending, setPending] = useState(false);
  // Согласие на обработку ПДн + подтверждение 18+ (152-ФЗ). Единый чекбокс гейтит
  // все точки входа, создающие аккаунт (включая OAuth). Регистрация = первый вход.
  const [consent, setConsent] = useState(false);

  // OAuth — GET-редирект без тела: флаг согласия передаём короткоживущей cookie,
  // которую читает callback. Без отметки — навигацию не пускаем.
  const beginOAuth = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!consent) {
      event.preventDefault();
      setStatus({ kind: "error", text: humanizeAuthError("consent_required") });
      return;
    }
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${SIGNUP_CONSENT_COOKIE}=${LEGAL_DOC_VERSION}; Path=/; Max-Age=${SIGNUP_CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  };

  const phoneDigits = useMemo(() => phone.replace(/\D/g, ""), [phone]);
  const canSendSms = phoneDigits.length >= 10;
  const canContinueEmail = useMemo(() => email.includes("@"), [email]);

  // ?next= читаем в момент клика (не useSearchParams — чтобы не тянуть Suspense
  // и не делать страницу динамической). После входа возвращаем туда, откуда пришли.
  const redirectAfterAuth = () => {
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = resolveSafeNextPath(next);
  };

  // Ссылка сброса пароля из письма (requestPasswordReset в lib/auth.ts) ведёт на
  // /login?email=…&flow=reset&token=…. По той же причине, что и next выше, читаем
  // адрес на маунте через location.search, а не useSearchParams.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flow = params.get("flow");
    const emailParam = params.get("email");
    const tokenParam = params.get("token");

    if (flow === "reset" && emailParam && tokenParam) {
      setMethod("email");
      setEmailFlow("password");
      setEmail(emailParam);
      setResetToken(tokenParam);
    } else if (params.get("error") === "magic_link") {
      setStatus({ kind: "error", text: "Ссылка недействительна или устарела. Запросите новую." });
    }
  }, []);

  const runAction = async (action: () => Promise<void>) => {
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  };

  const requestSmsCode = () =>
    runAction(async () => {
      const result = await postJson("/api/auth/phone", { action: "request", phone, consent });
      setStatus(
        result.ok
          ? { kind: "success", text: "Код отправлен по SMS", devHint: true }
          : { kind: "error", text: humanizeAuthError(result.error) }
      );
    });

  const verifySmsCode = () =>
    runAction(async () => {
      const result = await postJson("/api/auth/phone", { action: "verify", phone, code: smsCode, consent });
      if (result.ok) {
        redirectAfterAuth();
        return;
      }
      setStatus({ kind: "error", text: humanizeAuthError(result.error) });
    });

  const requestEmailOtp = () =>
    runAction(async () => {
      const result = await postJson("/api/auth/otp", { action: "request", email, consent });
      setStatus(
        result.ok
          ? { kind: "success", text: "Код отправлен на почту", devHint: true }
          : { kind: "error", text: humanizeAuthError(result.error) }
      );
    });

  const verifyEmailOtp = () =>
    runAction(async () => {
      const result = await postJson("/api/auth/otp", { action: "verify", email, code, consent });
      if (result.ok) {
        redirectAfterAuth();
        return;
      }
      setStatus({ kind: "error", text: humanizeAuthError(result.error) });
    });

  const requestMagicLink = () =>
    runAction(async () => {
      const result = await postJson("/api/auth/magic", { email, consent });
      setStatus(
        result.ok
          ? { kind: "success", text: "Ссылка для входа отправлена на почту", devHint: true }
          : { kind: "error", text: humanizeAuthError(result.error) }
      );
    });

  const passwordLogin = () =>
    runAction(async () => {
      const result = await postJson("/api/auth/password", { action: "login", email, password });
      if (result.ok) {
        redirectAfterAuth();
        return;
      }
      setStatus({ kind: "error", text: humanizeAuthError(result.error) });
    });

  const passwordSignup = () =>
    runAction(async () => {
      const result = await postJson("/api/auth/password", { action: "signup", email, password, consent });
      if (result.ok) {
        redirectAfterAuth();
        return;
      }
      setStatus({ kind: "error", text: humanizeAuthError(result.error) });
    });

  const requestPasswordReset = () =>
    runAction(async () => {
      const result = await postJson("/api/auth/password", { action: "request-reset", email });
      setStatus(
        result.ok
          ? { kind: "success", text: "Ссылка для сброса пароля отправлена на почту", devHint: true }
          : { kind: "error", text: humanizeAuthError(result.error) }
      );
    });

  const confirmPasswordReset = () =>
    runAction(async () => {
      if (!resetToken) {
        return;
      }
      const result = await postJson("/api/auth/password", {
        action: "reset",
        email,
        token: resetToken,
        password: newPassword
      });
      if (result.ok) {
        redirectAfterAuth();
        return;
      }
      setStatus({ kind: "error", text: humanizeAuthError(result.error) });
    });

  // Выход из тупика протухшей/использованной ссылки сброса — без него пользователь
  // застревал на форме «Новый пароль» без возможности запросить новую ссылку.
  const returnToLogin = () => {
    setResetToken(null);
    setNewPassword("");
    setStatus(null);
  };

  return (
    <Card className="mx-auto mt-14 max-w-md space-y-5 rounded-2xl p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-zinc-950" style={{ fontFamily: "var(--font-display)" }}>
          Вход и регистрация
        </h1>
        <p className="text-sm text-zinc-600">Новый аккаунт создастся автоматически при первом успешном входе.</p>
      </div>

      <label className="flex items-start gap-2.5 rounded-lg bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
        />
        <span>
          Мне есть 18 лет, я принимаю{" "}
          <Link href="/legal/terms" target="_blank" className="text-sky-700 underline underline-offset-2">
            Пользовательское соглашение
          </Link>{" "}
          и даю{" "}
          <Link href="/legal/consent" target="_blank" className="text-sky-700 underline underline-offset-2">
            согласие на обработку персональных данных
          </Link>{" "}
          согласно{" "}
          <Link href="/legal/privacy" target="_blank" className="text-sky-700 underline underline-offset-2">
            Политике
          </Link>
          .
        </span>
      </label>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={method === "phone" ? "default" : "outline"}
          className="flex-1"
          onClick={() => setMethod("phone")}
        >
          По телефону
        </Button>
        <Button
          type="button"
          size="sm"
          variant={method === "email" ? "default" : "outline"}
          className="flex-1"
          onClick={() => setMethod("email")}
        >
          По e-mail
        </Button>
      </div>

      {method === "phone" && (
        <div className="space-y-3">
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSendSms && !pending && consent) {
                requestSmsCode();
              }
            }}
          >
            <Field
              label="Телефон"
              placeholder="+7 999 123-45-67"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <Button type="submit" disabled={!canSendSms || pending || !consent} className="w-full">
              Получить код
            </Button>
          </form>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (smsCode && !pending && consent) {
                verifySmsCode();
              }
            }}
          >
            <Field
              label="Код из SMS"
              hideLabel
              placeholder="Код из SMS"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={smsCode}
              onChange={(event) => setSmsCode(event.target.value)}
            />
            <Button type="submit" disabled={!smsCode || pending || !consent}>
              Войти
            </Button>
          </form>
        </div>
      )}

      {method === "email" && (
        <div className="space-y-3">
          {emailFlow === "password" && resetToken ? (
            <div className="space-y-2">
              <p className="text-sm text-zinc-500">
                Сброс пароля для <span className="font-medium text-zinc-700">{email}</span>
              </p>
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (newPassword && !pending) {
                    confirmPasswordReset();
                  }
                }}
              >
                <Field
                  label="Новый пароль"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <Button type="submit" disabled={!newPassword || pending} className="w-full">
                  Установить пароль
                </Button>
              </form>
              <div className="flex gap-4">
                <button
                  type="button"
                  className="text-sm text-zinc-500 underline decoration-dotted underline-offset-4 hover:text-zinc-700 disabled:opacity-40"
                  disabled={pending}
                  onClick={requestPasswordReset}
                >
                  Запросить новую ссылку
                </button>
                <button
                  type="button"
                  className="text-sm text-zinc-500 underline decoration-dotted underline-offset-4 hover:text-zinc-700"
                  onClick={returnToLogin}
                >
                  Вернуться ко входу
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={emailFlow === "otp" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setEmailFlow("otp")}
                >
                  Код на почту
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={emailFlow === "magic" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setEmailFlow("magic")}
                >
                  Ссылка на почту
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={emailFlow === "password" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setEmailFlow("password")}
                >
                  Пароль
                </Button>
              </div>

              {emailFlow === "otp" && (
                <div className="space-y-2">
                  <form
                    className="space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (canContinueEmail && !pending && consent) {
                        requestEmailOtp();
                      }
                    }}
                  >
                    <Field
                      label="E-mail"
                      type="email"
                      placeholder="you@example.ru"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                    <Button type="submit" disabled={!canContinueEmail || pending || !consent} className="w-full">
                      Получить код
                    </Button>
                  </form>
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (code && !pending && consent) {
                        verifyEmailOtp();
                      }
                    }}
                  >
                    <Field
                      label="Код из письма"
                      hideLabel
                      placeholder="Код из письма"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                    />
                    <Button type="submit" disabled={!code || pending || !consent}>
                      Войти
                    </Button>
                  </form>
                </div>
              )}

              {emailFlow === "magic" && (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (canContinueEmail && !pending && consent) {
                      requestMagicLink();
                    }
                  }}
                >
                  <Field
                    label="E-mail"
                    type="email"
                    placeholder="you@example.ru"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  <Button type="submit" disabled={!canContinueEmail || pending || !consent} className="w-full">
                    Отправить ссылку
                  </Button>
                </form>
              )}

              {emailFlow === "password" && (
                <div className="space-y-2">
                  <form
                    className="space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (canContinueEmail && password && !pending) {
                        passwordLogin();
                      }
                    }}
                  >
                    <Field
                      label="E-mail"
                      type="email"
                      placeholder="you@example.ru"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                    <Field
                      label="Пароль"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="submit" disabled={!canContinueEmail || !password || pending}>
                        Войти
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!canContinueEmail || !password || pending || !consent}
                        onClick={passwordSignup}
                      >
                        Создать пароль
                      </Button>
                    </div>
                  </form>
                  <button
                    type="button"
                    className="text-sm text-zinc-500 underline decoration-dotted underline-offset-4 hover:text-zinc-700 disabled:opacity-40"
                    disabled={!canContinueEmail || pending}
                    onClick={requestPasswordReset}
                  >
                    Забыли пароль?
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 border-t border-zinc-200 pt-4">
        <Link
          href="/api/auth/oauth/vk"
          onClick={beginOAuth}
          aria-disabled={!consent}
          className={`rounded-md border border-zinc-200 p-2 text-center text-sm text-zinc-700 transition-colors hover:bg-zinc-50 ${
            consent ? "" : "pointer-events-none opacity-50"
          }`}
        >
          VK ID
        </Link>
        <Link
          href="/api/auth/oauth/yandex"
          onClick={beginOAuth}
          aria-disabled={!consent}
          className={`rounded-md border border-zinc-200 p-2 text-center text-sm text-zinc-700 transition-colors hover:bg-zinc-50 ${
            consent ? "" : "pointer-events-none opacity-50"
          }`}
        >
          Яндекс ID
        </Link>
      </div>

      <StatusLine status={status} />
    </Card>
  );
}
