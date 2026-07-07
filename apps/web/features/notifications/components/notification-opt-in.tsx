"use client";

// =============================================================================
//  features/notifications/components/notification-opt-in.tsx
//  Карточка «Включить уведомления» (Phase 6): подписка на web-push о промптах
//  (засыпь/промывка) и авариях — работают, даже когда вкладка свёрнута / телефон
//  вне дома (их шлёт always-on мост). Скрывается, когда предлагать нечего
//  (сервер без VAPID); на iOS-Safari вне standalone (PushManager недоступен
//  в принципе) вместо тишины — подсказка «поставьте на экран Домой» (P4 PWA).
// =============================================================================
import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";

import { Button } from "@nb/ui";

import { isIosBrowser, isStandaloneDisplay } from "@/features/notifications/ios-install-hint";
import { usePushSubscription } from "@/features/notifications/use-push-subscription";

export function NotificationOptIn() {
  const { state, busy, error, enable, disable } = usePushSubscription();
  const [testMsg, setTestMsg] = useState<string | null>(null);

  // Определяем на клиенте после монтирования (не в рендере!) — иначе сервер
  // (null) и первый клиентский рендер (уже настоящий UA) разойдутся и Реакт
  // словит hydration mismatch на самой карточке.
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);
  useEffect(() => {
    setShowIosInstallHint(isIosBrowser() && !isStandaloneDisplay());
  }, []);

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

  // Сервер без VAPID-ключей — предлагать нечего, не мозолим глаз.
  if (state === "unconfigured") return null;

  // Браузер без PushManager: на iOS-Safari вне standalone это не тупик, а
  // «сначала установите приложение» — остальные unsupported-браузеры тихие.
  if (state === "unsupported") {
    if (!showIosInstallHint) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-muted p-4 text-sm text-muted-foreground">
        <Bell className="h-4 w-4 text-muted-foreground" aria-hidden />
        Пуши на iPhone приходят только в установленное приложение: в Safari — «Поделиться» → «На экран „Домой“».
      </div>
    );
  }

  if (state === "subscribed") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-success/30 bg-success-subtle p-4">
        <p className="inline-flex items-center gap-2 text-sm text-success-subtle-foreground">
          <BellRing className="h-4 w-4" aria-hidden />
          Уведомления включены — пуш придёт на засыпь, промывку и аварии.
        </p>
        <div className="flex items-center gap-2">
          {testMsg ? <span className="text-xs text-success-subtle-foreground">{testMsg}</span> : null}
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
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-muted p-4 text-sm text-muted-foreground">
        <BellOff className="h-4 w-4 text-muted-foreground" aria-hidden />
        Уведомления заблокированы в браузере. Разрешите их в настройках сайта, чтобы получать пуш о варке.
      </div>
    );
  }

  // state === "default"
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="min-w-0">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <Bell className="h-4 w-4 text-muted-foreground" aria-hidden />
          Уведомления о варке
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Пуш на телефон о засыпи, промывке и авариях — даже когда вкладка свёрнута.
        </p>
        {error ? <p role="alert" className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>
      <Button onClick={() => void enable()} disabled={busy}>
        {busy ? "Включаем…" : "Включить уведомления"}
      </Button>
    </div>
  );
}
