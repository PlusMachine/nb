"use client";

// =============================================================================
//  features/devices/components/device-console.tsx
//  Пульт устройства L2 (зона B) — единый sticky-хедер + тело живого дашборда.
//  Владеет ЕДИНОЙ подпиской на телеметрию (useTelemetryStream) и арендой
//  (useDeviceCommand): и хедер (живой StatusPill), и тело (LiveDashboardView) и
//  график кормятся из одного источника — без второго EventSource (редизайн L2 §5–6).
//
//  Опасные команды гейтятся на сервере; кнопки портала совещательные — авторитет
//  у интерлоков устройства. Живой дашборд/график — те же transport-агностичные
//  компоненты, что и в зоне A, с источником { kind:'device', deviceId }.
// =============================================================================
import { useState } from "react";

import type { TelemetryHistoryPoint } from "@/features/brew-batches/contracts";
import { OnboardRecipesPanel } from "@/features/brew-controller/components/onboard-recipes-panel";
import { telemetryEndpoints, type DeviceChannel } from "@/features/brew-controller/telemetry-source";
import { useDeviceCommand } from "@/features/brew-controller/use-device-command";
import { useTelemetryStream } from "@/features/brew-controller/use-telemetry-stream";
import { LiveDashboardView } from "@/features/brew-controller/components/live-dashboard-view";
import { DeviceHeader } from "@/features/devices/components/device-header";
import type { PushableRecipeDto } from "@/features/devices/onboard-recipes-contracts";

export type DeviceConsoleView = {
  id: string;
  name: string;
  hardwareId: string;
  providerId: string;
  status: "online" | "offline" | "unknown";
  fw: string | null;
  localUrl: string | null;
  mqttPrefix: string | null;
  capabilities: string[];
  lastSeenAt: string | null; // ISO
  createdAt: string; // ISO
  /** Демо-пивоварня (без железа): dev-loopback sim или prod-стаб (Phase 4.5). */
  isDemo: boolean;
  /** Канал связи (LAN/облако/демо) для честной индикации (Phase 6c). */
  channel: DeviceChannel;
};

type Tab = "live" | "recipes";

type Props = {
  device: DeviceConsoleView;
  initialHistory: TelemetryHistoryPoint[];
  /** Рецепты пользователя для пикера «записать на плату» (вкладка «Рецепты»). */
  pushableRecipes: PushableRecipeDto[];
};

export function DeviceConsole({ device, initialHistory, pushableRecipes }: Props) {
  const [tab, setTab] = useState<Tab>("live");

  // Пульт L2 владеет ЕДИНОЙ подпиской и арендой: и sticky-хедер (живой статус), и
  // тело дашборда/график кормятся из одного источника — без второго EventSource.
  const source = { kind: "device" as const, deviceId: device.id };
  const endpoints = telemetryEndpoints(source);
  const command = useDeviceCommand({
    commandUrl: endpoints.command,
    leaseUrl: endpoints.lease,
    enabled: true,
  });
  const stream = useTelemetryStream(source, true);

  const tabs: { id: Tab; label: string }[] = [
    { id: "live", label: "Пульт" },
    { id: "recipes", label: "Рецепты" },
  ];

  return (
    <div className="space-y-6">
      <DeviceHeader
        deviceName={device.name}
        isDemo={device.isDemo}
        channel={device.channel}
        backHref="/app/devices"
        settingsHref={`/app/devices/${device.id}/settings`}
        stream={stream}
        command={command}
      />

      {/* Вкладки пульта (рецепты пивоварни — вторичны, §8; рефактор — W4). */}
      <div className="flex gap-1 border-b border-zinc-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "recipes" ? (
        <OnboardRecipesPanel deviceId={device.id} pushableRecipes={pushableRecipes} />
      ) : (
        <LiveDashboardView
          stream={stream}
          command={command}
          source={source}
          initialHistory={initialHistory}
          hasDevice
          channel={device.channel}
          showInlineHeader={false}
          stickyDock
        />
      )}
    </div>
  );
}
