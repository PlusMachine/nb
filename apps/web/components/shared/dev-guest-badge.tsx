"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";

/**
 * Dev-only индикатор гостевого просмотра. Появляется, когда разработчик «вышел»
 * при активном автологине (DEV_AUTH_EMAIL) и видит приложение как аноним.
 * Кнопки возвращают в dev-аккаунт; если аккаунтов несколько — можно выбрать, в какой.
 * В production не рендерится (active=false).
 */
export function DevGuestBadge({
  active,
  accounts,
  activeEmail
}: {
  active: boolean;
  accounts: string[];
  activeEmail?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  if (!active || accounts.length === 0) {
    return null;
  }

  const returnTo = async (email?: string) => {
    setPending(email ?? "__default__");
    try {
      await fetch("/api/auth/dev-login", {
        method: "POST",
        ...(email
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }
          : {})
      });
    } finally {
      router.refresh();
    }
  };

  const label = (email: string) => email.split("@")[0] || email;
  const multiple = accounts.length > 1;

  return (
    <div className="fixed bottom-[calc(1rem+var(--nb-cookie-banner-h,0px)+var(--nb-bottom-nav-h,0px))] left-1/2 z-[100] -translate-x-1/2">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl border border-warning/30 bg-warning-subtle px-4 py-2 text-sm text-warning-subtle-foreground shadow-lg">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Eye className="h-4 w-4" />
          Гостевой просмотр (dev)
        </span>
        {multiple ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="text-xs opacity-70">Вернуться в:</span>
            {accounts.map((email) => (
              <button
                key={email}
                type="button"
                disabled={pending !== null}
                onClick={() => returnTo(email)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${
                  email === activeEmail
                    ? "bg-amber-900 text-amber-50 hover:bg-amber-800"
                    : "border border-amber-900/40 bg-amber-900/10 text-amber-900 hover:bg-amber-900/20 dark:text-amber-100"
                }`}
              >
                {pending === email ? "Входим…" : label(email)}
              </button>
            ))}
          </span>
        ) : (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => returnTo()}
            className="rounded-full bg-amber-900 px-3 py-1 text-xs font-semibold text-amber-50 transition-colors hover:bg-amber-800 disabled:opacity-60"
          >
            {pending ? "Возвращаемся…" : "Вернуться в dev-аккаунт"}
          </button>
        )}
      </div>
    </div>
  );
}
