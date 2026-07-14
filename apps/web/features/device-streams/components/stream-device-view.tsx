// =============================================================================
//  features/device-streams/components/stream-device-view.tsx
//  Серверная сборка страницы стрим-устройства (§5 F1/F8, M1 — без графика брожения,
//  он в M2): читает ingestUrl/статус приёма/счётчики данных параллельно и передаёт
//  их клиентскому оркестратору (stream-device-console.tsx). Вызывается ИЗ
//  app/(app)/app/devices/[id]/page.tsx веткой isStreamLikeProviderId(providerId) —
//  BrewForge-путь (DeviceConsole) эта ветка не трогает.
//
//  isRaptDevice (M4-B, §5 F8 «для RAPT-подключения дополнительно»): RAPT-устройство
//  не имеет собственного ingest-токена (приём только через вебхук интеграции,
//  см. ingest-rapt.ts) — getStreamIngestUrl для него и так вернёт null (tokenEncrypted
//  пуст), но stream-device-console.tsx нужен явный флаг, чтобы вместо блока
//  «URL для вставки»/«Перевыпустить URL» показать строку про подключение RAPT Cloud.
// =============================================================================
import type { PreferredGravityUnit } from "@nb/auth";

import { getStreamDeviceDataCounts, getStreamDeviceStatus, getStreamIngestUrl } from "@/features/device-streams/service";
import { listSessionsForDevice } from "@/features/device-streams/sessions";
import { readDeviceFermentSeries } from "@/features/device-streams/series";
import { getBrewBatchById } from "@/features/brew-batches/service";

import type { DeviceSessionHistoryItem } from "./device-ferment-panel";
import type { FermentChartSession } from "./ferment-chart";
import { StreamDeviceConsole, type StreamDeviceStatusView } from "./stream-device-console";

export type StreamDeviceViewDevice = {
  id: string;
  name: string;
  hardwareKind: string | null;
};

export async function StreamDeviceView({
  userId,
  device,
  preferredGravityUnit,
  isRaptDevice = false
}: {
  userId: string;
  device: StreamDeviceViewDevice;
  preferredGravityUnit: PreferredGravityUnit;
  isRaptDevice?: boolean;
}) {
  const [ingestUrl, status, dataCounts, sessions, seriesResult] = await Promise.all([
    getStreamIngestUrl(userId, device.id),
    getStreamDeviceStatus(userId, device.id),
    getStreamDeviceDataCounts(userId, device.id),
    listSessionsForDevice(userId, device.id),
    readDeviceFermentSeries(userId, device.id)
  ]);

  // Имена партий для истории сеансов (§5 F3 «партия → период → точек») — сеансы
  // несут только brewBatchId, имя достаём отдельным чтением features/brew-batches
  // (не владеем), дедуплицируя запросы по уникальным партиям (сеансов у одного
  // устройства обычно единицы, N+1 здесь не проблема объёма).
  const batchIds = [...new Set(sessions.map((session) => session.brewBatchId))];
  const batches = await Promise.all(batchIds.map((batchId) => getBrewBatchById(userId, batchId)));
  const batchNameById = new Map(batches.filter((batch) => batch !== null).map((batch) => [batch.id, batch.name]));

  const history: DeviceSessionHistoryItem[] = sessions.map((session) => ({
    id: session.id,
    brewBatchId: session.brewBatchId,
    brewBatchName: batchNameById.get(session.brewBatchId) ?? "Партия удалена",
    startedAt: session.startedAt.getTime(),
    endedAt: session.endedAt ? session.endedAt.getTime() : null,
    readingsCount: session.readingsCount
  }));

  const chartSessions: FermentChartSession[] = seriesResult.sessions.map((session) => ({
    id: session.session.id,
    deviceName: session.session.deviceName,
    startedAt: session.session.startedAt.getTime(),
    endedAt: session.session.endedAt ? session.session.endedAt.getTime() : null,
    points: session.points,
    intervalSeconds: session.intervalSeconds
  }));

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
      chartSessions={chartSessions}
      sessionHistory={history}
      isRaptDevice={isRaptDevice}
    />
  );
}
