"use client";

// =============================================================================
//  features/brew-batches/components/live-dashboard.tsx
//  Тонкая обёртка: поднимает ЕДИНУЮ SSE-подписку (useTelemetryStream) и аренду/
//  команды (useDeviceCommand) и отдаёт презентационному LiveDashboardView. Зоны A
//  (варка партии) и B (пульт устройства) различаются лишь источником телеметрии
//  (batchId vs deviceId — см. telemetry-source.ts); тело — общее.
//
//  Зона B (пульт L2) может вместо этой обёртки поднимать хуки сама и рендерить
//  единый sticky-хедер + LiveDashboardView(showInlineHeader=false) из ОДНОЙ
//  подписки (редизайн L2 §5–6).
// =============================================================================
import {
  telemetryEndpoints,
  type TelemetrySource,
  type DeviceChannel
} from "@/features/brew-controller/telemetry-source";
import type { TelemetryHistoryPoint } from "@/features/brew-batches/contracts";
import { useDeviceCommand } from "@/features/brew-controller/use-device-command";
import { useTelemetryStream } from "@/features/brew-controller/use-telemetry-stream";
import { LiveDashboardView } from "@/features/brew-controller/components/live-dashboard-view";

type Props = {
  /** Источник телеметрии: партия (зона A) или устройство напрямую (зона B). */
  source: TelemetrySource;
  /** Заголовок дашборда (опционален — страница/пульт может владеть заголовком). */
  title?: string | null;
  /** Подзаголовок (рецепт·устройство или имя контроллера). */
  subtitle?: string | null;
  /** Есть ли за источником устройство (для партии — привязан ли контроллер). */
  hasDevice: boolean;
  /** Канал связи с устройством (честная индикация LAN/облако, Phase 6c). */
  channel?: DeviceChannel | null;
  /** Серверно-загруженная начальная история телеметрии для графика в герое. */
  initialHistory: TelemetryHistoryPoint[];
};

export function LiveDashboard({ source, title, subtitle, hasDevice, channel, initialHistory }: Props) {
  // Эндпоинты команд/аренды из источника — контракт роутов в одном месте.
  const endpoints = telemetryEndpoints(source);

  // Аренда (single-writer) + отправка команд. Аренда — на устройство.
  const command = useDeviceCommand({
    commandUrl: endpoints.command,
    leaseUrl: endpoints.lease,
    enabled: hasDevice
  });

  // Единая SSE-подписка на телеметрию + производные (свежесть/«в эфире»/отсчёт).
  const stream = useTelemetryStream(source, hasDevice);

  return (
    <LiveDashboardView
      stream={stream}
      command={command}
      source={source}
      initialHistory={initialHistory}
      hasDevice={hasDevice}
      channel={channel}
      title={title}
      subtitle={subtitle}
    />
  );
}
