import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@nb/ui";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DeviceRevokeButton } from "@/components/admin/devices/device-revoke-button";
import {
  DEVICE_TELEMETRY_PREVIEW_LIMIT,
  getAdminDevice,
  type AdminDeviceEvent,
  type AdminDeviceLogFile,
  type AdminDeviceTelemetrySample
} from "@/features/devices/admin";
import { devicePresenceLabels } from "@/features/devices/contracts";
import { formatFirmwareSize } from "@/features/firmware/contracts";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const formatDateTime = (value: Date | null) =>
  value ? new Date(value).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" }) : "—";

const formatTime = (value: Date) =>
  new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "medium" });

const formatTemp = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)} °C`);

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function TelemetryTable({ samples, total }: { samples: AdminDeviceTelemetrySample[]; total: number }) {
  if (samples.length === 0) {
    return <EmptyNote>Телеметрии нет.</EmptyNote>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="pb-2 pr-3 font-medium">
                Время
              </th>
              <th scope="col" className="pb-2 pr-3 font-medium">
                Стадия
              </th>
              <th scope="col" className="pb-2 pr-3 font-medium">
                Температура
              </th>
              <th scope="col" className="pb-2 pr-3 font-medium">
                Уставка
              </th>
              <th scope="col" className="pb-2 font-medium">
                Нагрев
              </th>
            </tr>
          </thead>
          <tbody>
            {samples.map((sample) => (
              <tr key={sample.id} className="border-b border-border/50 last:border-0">
                <td className="py-2 pr-3 tabular-nums text-muted-foreground">{formatTime(sample.ts)}</td>
                <td className="py-2 pr-3 tabular-nums">{sample.stage ?? "—"}</td>
                <td className="py-2 pr-3 tabular-nums">{formatTemp(sample.primaryC)}</td>
                <td className="py-2 pr-3 tabular-nums">{formatTemp(sample.setpointC)}</td>
                <td className="py-2 tabular-nums">
                  {sample.heatDutyPct === null ? "—" : `${sample.heatDutyPct} %`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Последние {Math.min(samples.length, DEVICE_TELEMETRY_PREVIEW_LIMIT)} из {total.toLocaleString("ru-RU")} записей.
      </p>
    </div>
  );
}

function EventsList({ events }: { events: AdminDeviceEvent[] }) {
  if (events.length === 0) {
    return <EmptyNote>Событий нет.</EmptyNote>;
  }

  return (
    <ul className="space-y-2">
      {events.map((event) => (
        <li key={event.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/50 pb-2 last:border-0">
          <span className="tabular-nums text-xs text-muted-foreground">{formatTime(event.ts)}</span>
          <span className="font-mono text-xs text-foreground">{event.type}</span>
          {Object.keys(event.payload).length > 0 ? (
            <span className="font-mono text-xs text-muted-foreground/80">{JSON.stringify(event.payload)}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function LogFilesList({ files }: { files: AdminDeviceLogFile[] }) {
  if (files.length === 0) {
    return <EmptyNote>Журналов варки с устройства не догружено.</EmptyNote>;
  }

  return (
    <ul className="space-y-2">
      {files.map((file) => (
        <li key={file.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-2 last:border-0">
          <span className="font-mono text-sm text-foreground">{file.name}</span>
          <span className="text-xs text-muted-foreground">
            {formatFirmwareSize(file.sizeBytes)} · {file.samplesImported} точек · {file.eventsImported} событий
            {file.malformedLines > 0 ? ` · ${file.malformedLines} битых строк` : ""} · {formatDateTime(file.importedAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminDeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");

  const { id } = await params;
  const detail = await getAdminDevice(id);
  if (!detail) {
    notFound();
  }

  const { device, telemetry, events, logFiles, telemetryTotal } = detail;

  return (
    <section className="space-y-4">
      <AdminPageHeader
        title={device.name}
        backHref="/admin/devices"
        backLabel="К устройствам"
        actions={<DeviceRevokeButton deviceId={device.id} deviceName={device.name} />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Свойства">
          <dl className="divide-y divide-border">
            <PropertyRow label="Связь">
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={device.presence === "online" ? "success" : "neutral"} size="sm">
                  {devicePresenceLabels[device.presence]}
                </Badge>
                <span className="text-muted-foreground">{device.lastContactLabel ?? "Связи не было"}</span>
              </span>
            </PropertyRow>
            <PropertyRow label="Владелец">
              <Link href={`/admin/users/${device.ownerId}`} className="text-primary hover:underline">
                {device.ownerName}
              </Link>
              {device.ownerBlocked ? (
                <Badge tone="danger" size="sm" className="ml-2">
                  Заблокирован
                </Badge>
              ) : null}
            </PropertyRow>
            <PropertyRow label="Заводской номер">
              <span className="font-mono">{device.hardwareId}</span>
            </PropertyRow>
            <PropertyRow label="Прошивка">{device.fw ? `v${device.fw}` : "—"}</PropertyRow>
            <PropertyRow label="Последняя связь">{formatDateTime(device.lastSeenAt)}</PropertyRow>
            <PropertyRow label="Привязано">{formatDateTime(device.createdAt)}</PropertyRow>
            <PropertyRow label="Токен">
              {device.revoked ? (
                <Badge tone="warning" size="sm">
                  Отозван
                </Badge>
              ) : (
                <Badge tone="success" size="sm">
                  Действует
                </Badge>
              )}
            </PropertyRow>
            {device.localUrl ? (
              <PropertyRow label="Локальный адрес">
                <span className="font-mono text-xs">{device.localUrl}</span>
              </PropertyRow>
            ) : null}
            {device.mqttPrefix ? (
              <PropertyRow label="Префикс MQTT">
                <span className="font-mono text-xs">{device.mqttPrefix}</span>
              </PropertyRow>
            ) : null}
            {device.capabilities.length > 0 ? (
              <PropertyRow label="Возможности">
                <span className="flex flex-wrap justify-end gap-1">
                  {device.capabilities.map((capability) => (
                    <Badge key={capability} size="sm">
                      {capability}
                    </Badge>
                  ))}
                </span>
              </PropertyRow>
            ) : null}
          </dl>
        </Section>

        <Section title="Телеметрия">
          <TelemetryTable samples={telemetry} total={telemetryTotal} />
        </Section>

        <Section title="Журнал событий">
          <EventsList events={events} />
        </Section>

        <Section title="Журналы варки">
          <LogFilesList files={logFiles} />
        </Section>
      </div>
    </section>
  );
}
