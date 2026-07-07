"use client";

// =============================================================================
//  features/devices/components/device-header.tsx
//  Единый sticky-хедер пульта устройства L2 (редизайн L2 §5–6): back → L1, имя,
//  ОДИН индикатор статуса (StatusPill — живой, из общей подписки), канал, аренда
//  управления, шестерёнка → Настройки. Заменяет двойной заголовок и два словаря
//  статуса. Живой статус/аренду получает пропсами от владельца подписки.
// =============================================================================
import Link from "next/link";
import { ChevronLeft, ExternalLink, Maximize2, Settings } from "lucide-react";

import type { DeviceChannel } from "@/features/brew-controller/telemetry-source";
import type { TelemetryStream } from "@/features/brew-controller/use-telemetry-stream";
import type { useDeviceCommand } from "@/features/brew-controller/use-device-command";
import { StatusPill } from "@/features/brew-controller/components/status-pill";
import { ChannelBadge } from "@/features/brew-controller/components/channel-badge";
import { ControlLeaseBadge } from "@/features/brew-controller/components/control-lease-badge";
import { APP_MODE_LABELS, deriveAppMode } from "@/features/brew-controller/device-mode";

type Props = {
  deviceName: string;
  isDemo: boolean;
  channel?: DeviceChannel | null;
  backHref: string;
  settingsHref: string;
  /** Живая подписка (для единого StatusPill). */
  stream: TelemetryStream;
  /** Аренда управления (для ControlLeaseBadge). */
  command: ReturnType<typeof useDeviceCommand>;
  /** Клик по ⛶ → войти в киоск (§9). Не передан — кнопки нет. */
  onKioskEnter?: () => void;
  /** Ссылка на встроенный веб-UI прошивки (`/ui`), PWA P5. Не передана — кнопки нет. */
  localConsoleHref?: string | null;
};

export function DeviceHeader({
  deviceName,
  isDemo,
  channel,
  backHref,
  settingsHref,
  stream,
  command,
  onKioskEnter,
  localConsoleHref
}: Props) {
  // Бейдж режима (§5): нет телеметрии → appMode null → бейджа нет, пульт не
  // притворяется, что знает, что варит/гонит/бродит прибор.
  const appMode = deriveAppMode(stream.telemetry);

  return (
    // Липнет под шапкой оболочки: офсет берём из --chrome-top (задаётся AppShell),
    // а не захардкоженного top-14/lg:top-0, чтобы не уезжать под хедер.
    <header className="sticky top-[var(--chrome-top)] z-20 border-b border-border bg-card/90 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">BrewForge</span>
        </Link>
        <h1
          className="text-lg font-semibold text-foreground sm:text-xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {deviceName}
        </h1>
        {isDemo ? (
          <span className="inline-flex items-center rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
            Демо
          </span>
        ) : null}
        {appMode ? (
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {APP_MODE_LABELS[appMode]}
          </span>
        ) : null}
        <StatusPill hasDevice conn={stream.conn} isStale={stream.isStale} />
        <ChannelBadge channel={channel} />
        <div className="ml-auto flex items-center gap-2">
          <ControlLeaseBadge
            lease={command.lease}
            hasDevice
            onRequestTakeover={() => void command.requestTakeover()}
            onRelease={() => void command.release()}
            pending={command.pending}
          />
          {onKioskEnter ? (
            <button
              type="button"
              onClick={onKioskEnter}
              aria-label="Киоск"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <Maximize2 className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          {localConsoleHref ? (
            <a
              href={localConsoleHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Локальный пульт"
              title="Локальный пульт"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          ) : null}
          <Link
            href={settingsHref}
            aria-label="Настройки"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Settings className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
