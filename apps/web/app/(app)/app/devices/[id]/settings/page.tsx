import Link from "next/link";
import { notFound } from "next/navigation";

import { Card } from "@nb/ui";

import { requireUser } from "@/lib/auth";
import { getDeviceById } from "@/features/devices/service";
import { listDeviceProfiles } from "@/features/devices/profiles";
import { DeviceConfigForm } from "@/features/devices/components/device-config-form";
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

  const rows: { label: string; value: string }[] = [
    { label: "Имя", value: device.name },
    { label: "Hardware ID", value: device.hardwareId },
    { label: "Провайдер", value: device.providerId },
    { label: "Статус", value: device.status },
    { label: "Прошивка", value: device.fw ?? "—" },
    { label: "Локальный адрес", value: device.localUrl ?? "—" },
    { label: "MQTT-префикс", value: device.mqttPrefix ?? "—" },
    {
      label: "Возможности",
      value: device.capabilities.length > 0 ? device.capabilities.join(", ") : "—"
    },
    {
      label: "Последняя связь",
      value: device.lastSeenAt ? device.lastSeenAt.toLocaleString() : "—"
    },
    { label: "Привязано", value: device.createdAt.toLocaleString() }
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
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt className="text-zinc-500">{row.label}</dt>
              <dd className="font-medium text-zinc-900">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <DeviceConfigForm
        deviceId={device.id}
        deviceName={device.name}
        initialProfiles={initialProfiles}
      />
    </div>
  );
}
