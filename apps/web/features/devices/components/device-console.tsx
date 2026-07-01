"use client";

// =============================================================================
//  features/devices/components/device-console.tsx
//  Пульт устройства L2 (зона B) — вкладки «Обзор» и «Живой». Подключился к
//  пивоварне, видишь живой нагрев БЕЗ привязки к партии, базово рулишь. Живой
//  дашборд/график — те же transport-агностичные компоненты, что и в зоне A, но
//  с источником { kind:'device', deviceId } (см. telemetry-source.ts).
//
//  Опасные команды гейтятся на сервере (freshness-гейт в /api/devices/[id]/command);
//  кнопки портала совещательные — авторитет у интерлоков устройства.
// =============================================================================
import Link from "next/link";
import { useState } from "react";

import type { TelemetryHistoryPoint } from "@/features/brew-batches/contracts";
import { LiveDashboard } from "@/features/brew-batches/components/live-dashboard";
import { TelemetryChart } from "@/features/brew-batches/components/telemetry-chart";
import { OnboardRecipesPanel } from "@/features/brew-controller/components/onboard-recipes-panel";
import type { DeviceChannel } from "@/features/brew-controller/telemetry-source";
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

type Tab = "overview" | "live" | "recipes";

const STATUS_LABEL: Record<DeviceConsoleView["status"], string> = {
  online: "в сети",
  offline: "офлайн",
  unknown: "неизвестно",
};

const STATUS_DOT: Record<DeviceConsoleView["status"], string> = {
  online: "bg-emerald-500",
  offline: "bg-zinc-400",
  unknown: "bg-amber-400",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ru-RU");
}

type Props = {
  device: DeviceConsoleView;
  initialHistory: TelemetryHistoryPoint[];
  /** Рецепты пользователя для пикера «записать на плату» (вкладка «Рецепты»). */
  pushableRecipes: PushableRecipeDto[];
};

export function DeviceConsole({ device, initialHistory, pushableRecipes }: Props) {
  const [tab, setTab] = useState<Tab>("live");

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Обзор" },
    { id: "live", label: "Живой" },
    { id: "recipes", label: "Рецепты" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1
              className="text-2xl font-semibold text-zinc-950 sm:text-3xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {device.name}
            </h1>
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[device.status]}`} />
              {STATUS_LABEL[device.status]}
            </span>
            {device.isDemo ? (
              <span className="inline-flex items-center rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                Демо
              </span>
            ) : null}
          </div>
          <p className="text-sm text-zinc-500">
            <span className="font-mono">{device.hardwareId}</span>
            {device.fw ? ` · ${device.fw}` : ""}
          </p>
        </div>
        <Link
          href={`/app/devices/${device.id}/settings`}
          className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Настройки
        </Link>
      </header>

      {/* Вкладки пульта. */}
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

      {tab === "overview" ? (
        <OverviewPanel device={device} />
      ) : tab === "recipes" ? (
        <OnboardRecipesPanel deviceId={device.id} pushableRecipes={pushableRecipes} />
      ) : (
        <div className="space-y-6">
          <LiveDashboard
            source={{ kind: "device", deviceId: device.id }}
            title={device.name}
            subtitle={`${device.hardwareId}${device.fw ? ` · ${device.fw}` : ""}`}
            hasDevice
            channel={device.channel}
          />
          <TelemetryChart
            source={{ kind: "device", deviceId: device.id }}
            hasDevice
            initial={initialHistory}
          />
        </div>
      )}
    </div>
  );
}

function OverviewPanel({ device }: { device: DeviceConsoleView }) {
  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Hardware ID", value: device.hardwareId, mono: true },
    { label: "Провайдер", value: device.providerId },
    { label: "Статус", value: STATUS_LABEL[device.status] },
    { label: "Прошивка", value: device.fw ?? "—" },
    { label: "Локальный адрес", value: device.localUrl ?? "—", mono: true },
    { label: "MQTT-префикс", value: device.mqttPrefix ?? "—", mono: true },
    {
      label: "Возможности",
      value: device.capabilities.length > 0 ? device.capabilities.join(", ") : "—",
    },
    { label: "Последняя связь", value: fmtDateTime(device.lastSeenAt) },
    { label: "Привязано", value: fmtDateTime(device.createdAt) },
  ];

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-zinc-900">Устройство</p>
      <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <dt className="text-zinc-500">{row.label}</dt>
            <dd className={`font-medium text-zinc-900 ${row.mono ? "font-mono text-xs" : ""}`}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
