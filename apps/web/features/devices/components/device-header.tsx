"use client";

// =============================================================================
//  features/devices/components/device-header.tsx
//  Единый sticky-хедер пульта устройства L2 (редизайн L2 §5–6): back → L1, имя,
//  ОДИН индикатор статуса (StatusPill — живой, из общей подписки), канал, аренда
//  управления, шестерёнка → Настройки. Заменяет двойной заголовок и два словаря
//  статуса. Живой статус/аренду получает пропсами от владельца подписки.
// =============================================================================
import Link from "next/link";
import { ChevronLeft, Settings } from "lucide-react";

import type { DeviceChannel } from "@/features/brew-controller/telemetry-source";
import type { TelemetryStream } from "@/features/brew-controller/use-telemetry-stream";
import type { useDeviceCommand } from "@/features/brew-controller/use-device-command";
import { StatusPill } from "@/features/brew-controller/components/status-pill";
import { ChannelBadge } from "@/features/brew-controller/components/channel-badge";
import { ControlLeaseBadge } from "@/features/brew-controller/components/control-lease-badge";

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
};

export function DeviceHeader({
  deviceName,
  isDemo,
  channel,
  backHref,
  settingsHref,
  stream,
  command
}: Props) {
  return (
    // Липнет под мобильной шапкой оболочки (h-14, sticky top-0 z-40); на десктопе
    // верхней панели нет — контент скроллится под окном, поэтому top-0.
    <header className="sticky top-14 z-20 border-b border-zinc-200 bg-white/90 py-3 backdrop-blur lg:top-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 transition hover:text-zinc-800"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Устройства</span>
        </Link>
        <h1
          className="text-lg font-semibold text-zinc-950 sm:text-xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {deviceName}
        </h1>
        {isDemo ? (
          <span className="inline-flex items-center rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
            Демо
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
          <Link
            href={settingsHref}
            aria-label="Настройки"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
          >
            <Settings className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
