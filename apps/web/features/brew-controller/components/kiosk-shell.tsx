"use client";

// =============================================================================
//  features/brew-controller/components/kiosk-shell.tsx
//  Киоск — «веб как экран прибора» (веб-HMI §9): планшет ставится у пивоварни,
//  пульт → ⛶ → киоск: без хрома сайта, температура читается с 2–3 м, экран не
//  гаснет, E-STOP всегда доступен. Состояние — в URL (?kiosk=1, владелец —
//  device-console.tsx); эта обёртка только меняет ОТОБРАЖЕНИЕ того же пульта.
//
//  НЕ модалка: это режим отображения страницы пульта (постоянный полноэкранный
//  HMI, а не окно поверх контента), поэтому фокус-трап/скролл-лок Dialog здесь
//  не нужны и не нарушают конвенцию «модалки только через Dialog/Sheet» — той
//  конвенции просто не подпадает под этот случай. fixed inset-0 z-50 перекрывает
//  хром оболочки сайта (sticky-хедер/нижняя навигация — z-40, см. app-shell.tsx).
// =============================================================================
import { useEffect, useState, type ReactNode } from "react";
import { Minimize2 } from "lucide-react";

import { useToast } from "@nb/ui";
import type { Telemetry } from "@nb/brewforge-protocol";

import type { LeaseStatus } from "@/features/brew-controller/control-lease";
import { APP_MODE_LABELS, deriveAppMode } from "@/features/brew-controller/device-mode";
import { kioskOfflineBanner, wakeLockHintMessage } from "@/features/brew-controller/kiosk-status";
import { useWakeLock } from "@/features/brew-controller/use-wake-lock";
import { StatusPill, type ConnState } from "@/features/brew-controller/components/status-pill";
import { ControlLeaseBadge } from "@/features/brew-controller/components/control-lease-badge";

// Одноразовая подсказка про Wake Lock — один раз на устройство/браузер, не на сессию.
const WAKE_HINT_KEY = "nb_kiosk_wake_hint";

type Props = {
  deviceName: string;
  telemetry: Telemetry | null;
  conn: ConnState;
  isStale: boolean;
  lastFrameAt: number | null;
  lease: LeaseStatus | null;
  onRequestTakeover: () => void;
  onRelease: () => void;
  pending: boolean;
  /** Esc / кнопка — выход из киоска (снимает fullscreen и ?kiosk=1, владелец — device-console.tsx). */
  onExit: () => void;
  /** Тело пульта в киоск-раскладке (LiveDashboardView variant="kiosk"). */
  children: ReactNode;
};

export function KioskShell({
  deviceName,
  telemetry,
  conn,
  isStale,
  lastFrameAt,
  lease,
  onRequestTakeover,
  onRelease,
  pending,
  onExit,
  children,
}: Props) {
  // Не гаснуть, пока открыт киоск (§9); честная подсказка ниже — по факту, держим ли лок.
  const { engaged } = useWakeLock(true);
  const { show } = useToast();

  // Локальный тикер раз в секунду — только для «последний кадр N назад» в баннере.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Esc — выход из киоска (кнопка ниже даёт то же самое для тач-экрана).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onExit]);

  // Одноразовая подсказка (§12.4): при первом входе в киоск на этом устройстве —
  // engaged → «не будет гаснуть», иначе честно про настройки (LAN/no-support).
  // `engaged` захватывается АСИНХРОННО (navigator.wakeLock.request — промис), на
  // самом первом рендере оно всегда false, поэтому ждём короткого «расчёта
  // пыли» (settle) после каждого изменения engaged и показываем подсказку по
  // финальному значению — иначе тост почти всегда врал бы «не гасить нельзя»
  // даже когда лок реально захвачен.
  useEffect(() => {
    let alreadyShown = false;
    try {
      alreadyShown = window.localStorage.getItem(WAKE_HINT_KEY) !== null;
    } catch {
      return; // приватный режим/квота — тост не критичен, просто не показываем
    }
    if (alreadyShown) return;

    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(WAKE_HINT_KEY, "1");
      } catch {
        return;
      }
      show({ title: wakeLockHintMessage(engaged) });
      // 1.5 с, не 300 мс: на медленном планшете wakeLock.request() может резолвиться
      // позже — рано показанный тост соврал бы «включите не гасить экран» и через
      // localStorage-флаг похоронил бы правильную подсказку навсегда.
    }, 1500);
    return () => window.clearTimeout(id);
  }, [engaged, show]);

  const appMode = deriveAppMode(telemetry);
  const banner = kioskOfflineBanner({ conn, isStale, lastFrameAtMs: lastFrameAt, nowMs: now });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <h1
          className="text-lg font-semibold text-foreground sm:text-xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {deviceName}
        </h1>
        {appMode ? (
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {APP_MODE_LABELS[appMode]}
          </span>
        ) : null}
        <StatusPill hasDevice conn={conn} isStale={isStale} />
        <div className="ml-auto flex items-center gap-2">
          <ControlLeaseBadge
            lease={lease}
            hasDevice
            onRequestTakeover={onRequestTakeover}
            onRelease={onRelease}
            pending={pending}
          />
          <button
            type="button"
            onClick={onExit}
            aria-label="Выйти из киоска"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Minimize2 className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      {/* Офлайн-честность (§9/§12.1): экран у плиты не должен молча врать —
          крупный баннер, а не только маленькая пилюля StatusPill в шапке. */}
      {banner ? (
        <p
          role="alert"
          className={`px-4 py-3 text-center text-base font-semibold sm:text-lg ${
            banner.tone === "red" ? "bg-destructive text-destructive-foreground" : "bg-amber-400 text-amber-950"
          }`}
        >
          {banner.title}
          {banner.detail ? <span className="ml-2 font-normal opacity-90">{banner.detail}</span> : null}
        </p>
      ) : null}

      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}
