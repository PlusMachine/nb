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
//
//  Киоск (§9): состояние в URL (?kiosk=1) — владелец подписки/аренды остаётся
//  здесь (никакого второго EventSource), киоск лишь меняет отображение того же
//  пульта (KioskShell + LiveDashboardView variant="kiosk").
// =============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { FermentConfig } from "@nb/brewforge-protocol";
import { useToast } from "@nb/ui";

import type { TelemetryHistoryPoint } from "@/features/brew-batches/contracts";
import { KioskShell } from "@/features/brew-controller/components/kiosk-shell";
import { OnboardRecipesPanel } from "@/features/brew-controller/components/onboard-recipes-panel";
import { telemetryEndpoints, type DeviceChannel } from "@/features/brew-controller/telemetry-source";
import { useDeviceCommand } from "@/features/brew-controller/use-device-command";
import { useTelemetryStream } from "@/features/brew-controller/use-telemetry-stream";
import { LiveDashboardView } from "@/features/brew-controller/components/live-dashboard-view";
import {
  FermentDashboardView,
  type FermenterBatchLink,
} from "@/features/brew-controller/components/ferment-dashboard-view";
import { DistillDashboardView } from "@/features/brew-controller/components/distill-dashboard-view";
import { isDistillRunning } from "@/features/brew-controller/distill-console";
import { APP_MODE_LABELS, deriveAppMode } from "@/features/brew-controller/device-mode";
import type { FermentPlanMappingResult } from "@/features/brew-controller/ferment-profile";
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
  /** Секция ferment{} конфига (best-effort, серверно) — null: недоступна/не прислана. */
  initialFermentConfig: FermentConfig | null;
  /** true — конфиг НЕ удалось прочитать (офлайн/провайдер недоступен), §12.1. */
  fermentConfigUnavailable: boolean;
  /** Бродящая партия, привязанная к прибору-ферментеру (§8.4). */
  fermenterBatch: FermenterBatchLink | null;
  /** Маппинг плана этой партии → ступени прибора (§13) — null, если партии/плана нет. */
  planMapping: FermentPlanMappingResult | null;
};

export function DeviceConsole({
  device,
  initialHistory,
  pushableRecipes,
  initialFermentConfig,
  fermentConfigUnavailable,
  fermenterBatch,
  planMapping,
}: Props) {
  const [tab, setTab] = useState<Tab>("live");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isKiosk = searchParams.get("kiosk") === "1";
  const { show } = useToast();

  // Пульт L2 владеет ЕДИНОЙ подпиской и арендой: и sticky-хедер (живой статус), и
  // тело дашборда/график (в т.ч. в киоске) кормятся из одного источника — без
  // второго EventSource.
  const source = { kind: "device" as const, deviceId: device.id };
  const endpoints = telemetryEndpoints(source);
  const command = useDeviceCommand({
    commandUrl: endpoints.command,
    leaseUrl: endpoints.lease,
    enabled: true,
  });
  const stream = useTelemetryStream(source, true);

  // Режим прибора (§5): read-only зеркало телеметрии — переключение только на
  // устройстве. "ferment" рисует свой пульт (третье «лицо»), "distill" — своё
  // ЧЕТВЁРТОЕ, но ТОЛЬКО пока перегон реально идёт (isDistillRunning, §12.1) —
  // идле-дистиллятор («режим — дистилляция, но прибор свободен») остаётся на
  // LiveDashboardView: там уже есть карточка простоя «Прибор свободен. Старт —
  // на устройстве» (H0), решение оркестратора — меньше дублирования.
  const appMode = deriveAppMode(stream.telemetry);
  const distillRunning = appMode === "distill" && isDistillRunning(stream.telemetry);

  // Смена режима «на лету» (§5): один тост на переход, без reload — тело пульта
  // само перестраивается по appMode на каждый кадр телеметрии. Первый кадр (prev
  // === null) не тостуем — это не смена, а первичное определение режима.
  const prevAppModeRef = useRef(appMode);
  useEffect(() => {
    const prev = prevAppModeRef.current;
    if (prev !== null && appMode !== null && appMode !== prev) {
      show({ title: `Прибор переключён в режим «${APP_MODE_LABELS[appMode]}»` });
    }
    prevAppModeRef.current = appMode;
  }, [appMode, show]);

  // Вход в киоск — user gesture: requestFullscreen ДО навигации (синхронно, иначе
  // браузер откажет — Fullscreen API требует прямого жеста). Открытие по прямой
  // ссылке с ?kiosk=1 работает и без браузерного fullscreen — его нельзя
  // запросить без жеста, это нормально.
  const enterKiosk = useCallback(() => {
    if (typeof document !== "undefined" && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    router.replace(`${pathname}?kiosk=1`, { scroll: false });
  }, [pathname, router]);

  // Выход — Esc/кнопка (KioskShell). Выходим из fullscreen, только если реально в нём.
  const exitKiosk = useCallback(() => {
    if (typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  if (isKiosk) {
    return (
      <KioskShell
        deviceName={device.name}
        telemetry={stream.telemetry}
        conn={stream.conn}
        isStale={stream.isStale}
        lastFrameAt={stream.lastFrameAt}
        lease={command.lease}
        onRequestTakeover={() => void command.requestTakeover()}
        onRelease={() => void command.release()}
        pending={command.pending}
        onExit={exitKiosk}
      >
        {appMode === "ferment" ? (
          <FermentDashboardView
            stream={stream}
            command={command}
            source={source}
            initialHistory={initialHistory}
            hasDevice
            deviceId={device.id}
            initialFermentConfig={initialFermentConfig}
            configUnavailable={fermentConfigUnavailable}
            fermenterBatch={fermenterBatch}
            planMapping={planMapping}
            variant="kiosk"
          />
        ) : distillRunning ? (
          <DistillDashboardView
            stream={stream}
            command={command}
            source={source}
            initialHistory={initialHistory}
            hasDevice
            deviceId={device.id}
            variant="kiosk"
          />
        ) : (
          <LiveDashboardView
            stream={stream}
            command={command}
            source={source}
            initialHistory={initialHistory}
            hasDevice
            channel={device.channel}
            showInlineHeader={false}
            deviceName={device.name}
            pushableRecipes={pushableRecipes}
            variant="kiosk"
          />
        )}
      </KioskShell>
    );
  }

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
        onKioskEnter={enterKiosk}
      />

      {/* Вкладки пульта (рецепты пивоварни — вторичны, §8; рефактор — W4). */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "recipes" ? (
        <OnboardRecipesPanel deviceId={device.id} pushableRecipes={pushableRecipes} />
      ) : appMode === "ferment" ? (
        <FermentDashboardView
          stream={stream}
          command={command}
          source={source}
          initialHistory={initialHistory}
          hasDevice
          deviceId={device.id}
          initialFermentConfig={initialFermentConfig}
          configUnavailable={fermentConfigUnavailable}
          fermenterBatch={fermenterBatch}
          planMapping={planMapping}
        />
      ) : distillRunning ? (
        <DistillDashboardView
          stream={stream}
          command={command}
          source={source}
          initialHistory={initialHistory}
          hasDevice
          deviceId={device.id}
        />
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
          deviceName={device.name}
          pushableRecipes={pushableRecipes}
        />
      )}
    </div>
  );
}
