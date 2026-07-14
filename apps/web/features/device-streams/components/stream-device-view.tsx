// =============================================================================
//  features/device-streams/components/stream-device-view.tsx
//  Серверная сборка страницы стрим-устройства (§5 F1/F8, M1 — без графика брожения,
//  он в M2): читает ingestUrl/статус приёма/счётчики данных параллельно и передаёт
//  их клиентскому оркестратору (stream-device-console.tsx). Вызывается ИЗ
//  app/(app)/app/devices/[id]/page.tsx веткой providerId===STREAM_PROVIDER_ID —
//  BrewForge-путь (DeviceConsole) эта ветка не трогает.
// =============================================================================
import type { PreferredGravityUnit } from "@nb/auth";

import { getStreamDeviceDataCounts, getStreamDeviceStatus, getStreamIngestUrl } from "@/features/device-streams/service";

import { StreamDeviceConsole, type StreamDeviceStatusView } from "./stream-device-console";

export type StreamDeviceViewDevice = {
  id: string;
  name: string;
  hardwareKind: string | null;
};

export async function StreamDeviceView({
  userId,
  device,
  preferredGravityUnit
}: {
  userId: string;
  device: StreamDeviceViewDevice;
  preferredGravityUnit: PreferredGravityUnit;
}) {
  const [ingestUrl, status, dataCounts] = await Promise.all([
    getStreamIngestUrl(userId, device.id),
    getStreamDeviceStatus(userId, device.id),
    getStreamDeviceDataCounts(userId, device.id)
  ]);

  const initialStatus: StreamDeviceStatusView = {
    lastSeenAt: status.lastSeenAt ? status.lastSeenAt.toISOString() : null,
    latestReading: status.latestReading
      ? {
          ts: status.latestReading.ts.toISOString(),
          gravitySg: status.latestReading.gravitySg,
          tempC: status.latestReading.tempC,
          batteryV: status.latestReading.batteryV,
          batteryPct: status.latestReading.batteryPct,
          rssi: status.latestReading.rssi
        }
      : null,
    readingsCount: status.readingsCount,
    isStale: status.isStale
  };

  return (
    <StreamDeviceConsole
      device={{ id: device.id, name: device.name, hardwareKind: device.hardwareKind }}
      initialIngestUrl={ingestUrl}
      initialStatus={initialStatus}
      initialDataCounts={dataCounts}
      preferredGravityUnit={preferredGravityUnit}
    />
  );
}
