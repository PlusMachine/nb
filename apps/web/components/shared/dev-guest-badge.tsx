"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";

/**
 * Dev-only индикатор гостевого просмотра. Появляется, когда разработчик «вышел»
 * при активном автологине (DEV_AUTH_EMAIL) и видит приложение как аноним.
 * Кнопка возвращает в dev-аккаунт. В production не рендерится (active=false).
 */
export function DevGuestBadge({ active }: { active: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (!active) {
    return null;
  }

  const handleReturn = async () => {
    setPending(true);
    try {
      await fetch("/api/auth/dev-login", { method: "POST" });
    } finally {
      router.refresh();
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-warning/30 bg-warning-subtle px-4 py-2 text-sm text-warning-subtle-foreground shadow-lg">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Eye className="h-4 w-4" />
          Гостевой просмотр (dev)
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={handleReturn}
          className="rounded-full bg-amber-900 px-3 py-1 text-xs font-semibold text-amber-50 transition-colors hover:bg-amber-800 disabled:opacity-60"
        >
          {pending ? "Возвращаемся…" : "Вернуться в dev-аккаунт"}
        </button>
      </div>
    </div>
  );
}
