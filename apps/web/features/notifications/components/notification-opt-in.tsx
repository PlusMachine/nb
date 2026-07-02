"use client";

// =============================================================================
//  features/notifications/components/notification-opt-in.tsx
//  Карточка «Включить уведомления» (Phase 6): подписка на web-push о промптах
//  (засыпь/промывка) и авариях — работают, даже когда вкладка свёрнута / телефон
//  вне дома (их шлёт always-on мост). Скрывается, когда предлагать нечего
//  (браузер не поддерживает / сервер без VAPID).
// =============================================================================
import { useCallback, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";

import { Button } from "@nb/ui";

import { usePushSubscription } from "@/features/notifications/use-push-subscription";

export function NotificationOptIn() {
  const { state, busy, error, enable, disable } = usePushSubscription();
  const [testMsg, setTestMsg] = useState<string | null>(null);

  // Тест-пуш себе — проверка пайплайна без MQTT-стека (шлёт мост в проде).
  const sendTest = useCallback(async () => {
    setTestMsg(null);
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      const body = (await res.json()) as { sent?: number };
      setTestMsg(res.ok ? `Отправлено на ${body.sent ?? 0} устр.` : "Не удалось отправить");
    } catch {
      setTestMsg("Не удалось отправить");
    }
  }, []);

  // Нечего предлагать: браузер без поддержки или сервер без ключей — не мозолим глаз.
  if (state === "unsupported" || state === "unconfigured") return null;

  if (state === "subscribed") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="inline-flex items-center gap-2 text-sm text-emerald-900">
          <BellRing className="h-4 w-4" aria-hidden />
          Уведомления включены — пуш придёт на засыпь, промывку и аварии.
        </p>
        <div className="flex items-center gap-2">
          {testMsg ? <span className="text-xs text-emerald-800">{testMsg}</span> : null}
          <Button variant="outline" onClick={() => void sendTest()} disabled={busy}>
            Проверить
          </Button>
          <Button variant="outline" onClick={() => void disable()} disabled={busy}>
            {busy ? "…" : "Выключить"}
          </Button>
        </div>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
        <BellOff className="h-4 w-4 text-zinc-400" aria-hidden />
        Уведомления заблокированы в браузере. Разрешите их в настройках сайта, чтобы получать пуш о варке.
      </div>
    );
  }

  // state === "default"
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Bell className="h-4 w-4 text-zinc-500" aria-hidden />
          Уведомления о варке
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Пуш на телефон о засыпи, промывке и авариях — даже когда вкладка свёрнута.
        </p>
        {error ? <p role="alert" className="mt-1 text-xs text-red-600">{error}</p> : null}
      </div>
      <Button onClick={() => void enable()} disabled={busy}>
        {busy ? "Включаем…" : "Включить уведомления"}
      </Button>
    </div>
  );
}
