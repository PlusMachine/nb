import Link from "next/link";
import { notFound } from "next/navigation";

import { Card } from "@nb/ui";

import { requireUser } from "@/lib/auth";
import { getDeviceById, getLatestTelemetryAtMs } from "@/features/devices/service";
import { summarizeDeviceConnection } from "@/features/devices/connection";
import { listDeviceProfiles } from "@/features/devices/profiles";
import { DeviceConfigForm } from "@/features/devices/components/device-config-form";
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
  const lastTelemetryAtMs = await getLatestTelemetryAtMs(device.id);
  const connection = summarizeDeviceConnection(
    {
      status: device.status,
      lastSeenAtMs: device.lastSeenAt ? device.lastSeenAt.getTime() : null,
      lastTelemetryAtMs
    },
    Date.now()
  );

  const essentials: { label: string; value: string }[] = [
    { label: "Имя", value: device.name },
    { label: "Связь", value: connection.label },
    { label: "Прошивка", value: device.fw ?? "—" },
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
        <Link href="/app/devices" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← К устройствам
        </Link>
        <h1
          className="text-2xl font-semibold text-zinc-950 sm:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {device.name}
        </h1>
      </header>

      <Card className="p-5">
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {essentials.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt className="text-zinc-500">{row.label}</dt>
              <dd className="font-medium text-zinc-900">{row.value}</dd>
            </div>
          ))}
        </dl>
        <details className="mt-4 border-t border-zinc-100 pt-4">
          <summary className="cursor-pointer select-none text-sm font-medium text-zinc-700 hover:text-zinc-900">
            Тех. детали
          </summary>
          <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {techDetails.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <dt className="text-zinc-500">{row.label}</dt>
                <dd className="font-medium text-zinc-900">{row.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      </Card>

      <DeviceConfigForm
        deviceId={device.id}
        deviceName={device.name}
        initialProfiles={initialProfiles}
      />

      <DeviceLogSyncCard deviceId={device.id} />
    </div>
  );
}
