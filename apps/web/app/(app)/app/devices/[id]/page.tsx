import { Suspense } from "react";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { FERMENT_HISTORY_LIMIT, FERMENT_HISTORY_WINDOW_DAYS, TELEMETRY_HISTORY_LIMIT } from "@/features/brew-batches/contracts";
import { deviceChannel } from "@/features/brew-controller";
import { RAPT_PROVIDER_ID } from "@/features/brew-controller/rapt-cloud-provider";
import { mapFermentationPlanToDeviceSteps } from "@/features/brew-controller/ferment-profile";
import { getDeviceById, getDeviceHistory, getLastKnownDeviceMode, isDemoDevice } from "@/features/devices/service";
import { isFermenterModeRow } from "@/features/devices/fermenter-binding-core";
import { findBatchForFermenter } from "@/features/devices/fermenter-binding";
import { listPushableRecipes } from "@/features/devices/onboard-recipes";
import { DeviceConsole, type DeviceConsoleView } from "@/features/devices/components/device-console";
import { isStreamLikeProviderId } from "@/features/device-streams/contracts";
import { StreamDeviceView } from "@/features/device-streams/components/stream-device-view";
import type { FermenterBatchLink } from "@/features/brew-controller/components/ferment-dashboard-view";

// Пульт устройства L2 (зона B): живой нагрев устройства БЕЗ привязки к партии +
// базовое управление (опасное гейтится на сервере). Серверно: requireUser →
// устройство (ownership) → начальная история телеметрии для графика и бродящая
// партия, привязанная к прибору-ферментеру (§8.4), с маппингом её плана в
// ступени прибора (§13) — заранее, для «Из плана рецепта» на пульте ферментации.
//
// ferment{} конфиг (H3, §8) НА СЕРВЕРЕ больше не читается (F3): голый fetch
// офлайн-устройства к /config висит на ОС-таймаут (~17с) и держал всю страницу
// в Promise.all. Конфиг грузит клиентски сам FermentDashboardView (best-effort,
// с коротким таймаутом) — сюда передаём initialFermentConfig=null и
// fermentConfigUnavailable=false («ещё не знаем», не «недоступен»): пульт
// покажет нейтральное состояние загрузки, а не ложный «конфиг недоступен».
export default async function DeviceConsolePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const device = await getDeviceById(user.id, id);
  if (!device) {
    notFound();
  }

  // Стрим-устройства (цифровые ареометры/датчики, docs/specs/third-party-
  // fermentation-devices.md) — свой лэйаут, без BrewForge-пульта: только приём
  // телеметрии, управлять нечем. Ранняя ветка — весь код ниже (история/lease/
  // рецепты) специфичен BrewForge и стрим-устройству не нужен. RAPT-устройства
  // (providerId='rapt-cloud', M4) — та же ветка: тот же StreamDeviceConsole,
  // только без блока «URL для вставки» (приём через вебхук RAPT-подключения,
  // не через собственный токен устройства — см. isRaptDevice в stream-device-view.tsx).
  if (isStreamLikeProviderId(device.providerId)) {
    return (
      <StreamDeviceView
        userId={user.id}
        device={{ id: device.id, name: device.name, hardwareKind: device.hardwareKind }}
        preferredGravityUnit={user.preferredGravityUnit}
        isRaptDevice={device.providerId === RAPT_PROVIDER_ID}
      />
    );
  }

  const initialFermentConfig = null;
  const fermentConfigUnavailable = false;

  const [lastKnownMode, fermenterBatch, pushableRecipes] = await Promise.all([
    getLastKnownDeviceMode(user.id, device.id),
    findBatchForFermenter(user.id, device.id),
    listPushableRecipes(user.id),
  ]);

  // §14: last-known режим (без живой SSE-подписки на сервере) решает, каким
  // окном грузить историю — ferment живёт неделями и не укладывается в варочный
  // лимит точек (см. banner getDeviceHistory).
  const likelyFermenting = lastKnownMode ? isFermenterModeRow(lastKnownMode.appMode, lastKnownMode.stage) : false;
  const initialHistory = await getDeviceHistory(
    user.id,
    device.id,
    likelyFermenting ? FERMENT_HISTORY_LIMIT : TELEMETRY_HISTORY_LIMIT,
    likelyFermenting ? FERMENT_HISTORY_WINDOW_DAYS : undefined,
  );

  const planMapping = fermenterBatch
    ? mapFermentationPlanToDeviceSteps(fermenterBatch.brewPlanSnapshot.fermentationPlan)
    : null;
  const fermenterBatchLink: FermenterBatchLink | null = fermenterBatch
    ? { id: fermenterBatch.id, name: fermenterBatch.name, href: `/app/brew-batches/${fermenterBatch.id}` }
    : null;

  const view: DeviceConsoleView = {
    id: device.id,
    name: device.name,
    hardwareId: device.hardwareId,
    providerId: device.providerId,
    status: device.status,
    fw: device.fw,
    localUrl: device.localUrl,
    mqttPrefix: device.mqttPrefix,
    capabilities: device.capabilities,
    lastSeenAt: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
    createdAt: device.createdAt.toISOString(),
    isDemo: isDemoDevice(device),
    channel: deviceChannel(device),
  };

  return (
    // DeviceConsole читает ?kiosk=1 (useSearchParams требует Suspense-границу).
    <Suspense fallback={null}>
      <DeviceConsole
        device={view}
        initialHistory={initialHistory}
        pushableRecipes={pushableRecipes}
        initialFermentConfig={initialFermentConfig}
        fermentConfigUnavailable={fermentConfigUnavailable}
        fermenterBatch={fermenterBatchLink}
        planMapping={planMapping}
      />
    </Suspense>
  );
}
