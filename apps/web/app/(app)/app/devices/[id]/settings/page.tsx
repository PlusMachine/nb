import Link from "next/link";
import { notFound } from "next/navigation";

import { Card } from "@nb/ui";

import { STAGE_NUM } from "@nb/brewforge-protocol";

import { requireUser } from "@/lib/auth";
import { getDeviceById, getLatestTelemetryBrief } from "@/features/devices/service";
import { summarizeDeviceConnection } from "@/features/devices/connection";
import { listDeviceProfiles } from "@/features/devices/profiles";
import { findUpdateFor } from "@/features/firmware/service";
import { DeviceConfigForm } from "@/features/devices/components/device-config-form";
import { DeviceFirmwareCard } from "@/features/devices/components/device-firmware-card";
import { DeviceLogSyncCard } from "@/features/devices/components/device-log-sync-card";
import type { DeviceProfileView } from "@/features/devices/actions";

// Страница настроек/деталей устройства BrewForge (ownership-checked).
// Показывает идентификацию устройства, форму настраиваемого конфига §6.3 (читается
// клиентом по GET /api/devices/:id/config) и бэкап/восстановление профилей.
// Управление (привязка/отзыв) живёт на /app/devices. tokenHash никогда не отображается.
export default async function DeviceSettingsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const device = await getDeviceById(user.id, id);
  if (!device) {
    notFound();
  }

  // Профили (бэкап настроек) пользователя — даты сериализуем в ISO для клиента.
  const initialProfiles: DeviceProfileView[] = (await listDeviceProfiles(user.id)).map((p) => ({
    id: p.id,
    deviceId: p.deviceId,
    name: p.name,
    config: p.config,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString()
  }));

  // «Связь» считаем из того же источника, что и список плиток (heartbeat +
  // свежесть телеметрии), одной формулировкой — не показываем сырой «online» и
  // не противоречим списку/пульту (UX-находка #14).
  const lastTelemetry = await getLatestTelemetryBrief(device.id);
  const connection = summarizeDeviceConnection(
    {
      status: device.status,
      lastSeenAtMs: device.lastSeenAt ? device.lastSeenAt.getTime() : null,
      lastTelemetryAtMs: lastTelemetry?.tsMs ?? null
    },
    Date.now()
  );

  // Блок «Прошивка» (F3): доступное обновление из реестра релизов; кнопка
  // «Обновить» доступна только «в сети + IDLE» (last-known стадия) — настоящий
  // гейт (IDLE-only, подпись, rollback) всё равно на устройстве. Реестр скоуплен
  // providerId устройства: демо-приборам (brewforge-demo) релизы не предлагаются.
  const firmwareUpdate = await findUpdateFor(device.fw, { providerId: device.providerId });
  const deviceOnline = connection.tone === "online";
  const deviceIdle = lastTelemetry?.stage === STAGE_NUM.IDLE;
  const firmwareDisabledHint = !deviceOnline
    ? "Устройство не в сети."
    : !deviceIdle
      ? "Обновление доступно только в режиме ожидания (IDLE)."
      : null;

  const essentials: { label: string; value: string }[] = [
    { label: "Имя", value: device.name },
    { label: "Связь", value: connection.label },
    { label: "Последняя связь", value: connection.lastContactLabel ?? "—" }
  ];
  // Пламбинг (§9) — свёрнут в «Тех. детали», чтобы не мозолить в основном виде.
  const techDetails: { label: string; value: string }[] = [
    { label: "Hardware ID", value: device.hardwareId },
    { label: "Провайдер", value: device.providerId },
    { label: "Локальный адрес", value: device.localUrl ?? "—" },
    { label: "MQTT-префикс", value: device.mqttPrefix ?? "—" },
    {
      label: "Возможности",
      value: device.capabilities.length > 0 ? device.capabilities.join(", ") : "—"
    },
    {
      label: "Последний heartbeat",
      value: device.lastSeenAt ? device.lastSeenAt.toLocaleString("ru-RU") : "—"
    },
    { label: "Привязано", value: device.createdAt.toLocaleString("ru-RU") }
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/app/devices" className="text-sm text-muted-foreground hover:text-foreground">
          ← К устройствам
        </Link>
        <h1
          className="text-2xl font-semibold text-foreground sm:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {device.name}
        </h1>
      </header>

      <Card className="p-5">
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {essentials.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-medium text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
        <details className="mt-4 border-t border-border pt-4">
          <summary className="cursor-pointer select-none text-sm font-medium text-foreground hover:text-foreground">
            Тех. детали
          </summary>
          <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {techDetails.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-medium text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      </Card>

      <DeviceFirmwareCard
        deviceId={device.id}
        currentFw={device.fw}
        update={firmwareUpdate ? { version: firmwareUpdate.version, notes: firmwareUpdate.notes } : null}
        canStart={deviceOnline && deviceIdle}
        disabledHint={firmwareDisabledHint}
      />

      <DeviceConfigForm
        deviceId={device.id}
        deviceName={device.name}
        initialProfiles={initialProfiles}
      />

      <DeviceLogSyncCard deviceId={device.id} />
    </div>
  );
}
