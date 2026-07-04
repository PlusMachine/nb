"use client";

// =============================================================================
//  features/brew-controller/components/distill-dashboard-view.tsx
//  Пульт дистилляции (веб-HMI §7) — четвёртое «лицо» единого пульта устройства
//  (наряду с LiveDashboardView для варки и FermentDashboardView для брожения).
//  Та же оркестрация run/confirm и те же пропсы stream/command/source, что у
//  FermentDashboardView — владелец подписки/аренды остаётся device-console.tsx,
//  здесь только тело. Рендерится ТОЛЬКО когда перегон реально идёт
//  (isDistillRunning, distill-console.ts) — идле-дистиллятор («режим прибора —
//  дистилляция, но стадия IDLE») остаётся на LiveDashboardView (§12.1: там уже
//  есть карточка простоя «Прибор свободен. Старт — на устройстве», решение
//  оркестратора — меньше дублирования).
//
//  Датчик колонны — v1 клиентское назначение (localStorage, SSR-safe: сама
//  работа с localStorage — здесь в эффектах, резолв/валидация — чистые функции
//  distill-console.ts). Серверное поле — v2 (см. отчёт H2).
//
//  actionReady («Смените приёмную ёмкость», bf_process.c: `distill_ready`)
//  РЕЗОЛВИТСЯ на устройстве ТЕМ ЖЕ SKIP_STAGE, что и «К следующей фракции»
//  (`go()` в bf_process.c сбрасывает distill_ready на любом переходе стадии) —
//  отдельной ACK-команды в прошивке нет. Поэтому кнопка «Готово» в промпт-
//  баннере — это тот же handler, что основная кнопка перехода (с тем же
//  подтверждением), а не самостоятельный локальный акт на приборе.
//
//  График: живая история хранит ТОЛЬКО primary_c (lean-колонки brew_telemetry,
//  §14) — колонна в историю не пишется. v1-решение: TelemetryChart переиспользуется
//  БЕЗ ИЗМЕНЕНИЙ для истории куба (тот же компонент/паттерн, что у варки, нулевой
//  риск для общего графика); колонна — только живое число в герое (и так «главный
//  рабочий инструмент», §7, не спрятана). Вторая линия колонны на графике — v2,
//  см. отчёт H2 (потребует client-side накопления живых точек поверх общего
//  компонента графика — сознательно не делаем в этом пакете).
// =============================================================================
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, OctagonX, Square } from "lucide-react";

import { cmdClearFault, cmdEstop, cmdSkipStage, cmdStop, type Command } from "@nb/brewforge-protocol";
import { Button } from "@nb/ui";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import type { TelemetryHistoryPoint } from "@/features/brew-batches/contracts";
import { TelemetryChart } from "@/features/brew-batches/components/telemetry-chart";
import { type TelemetrySource } from "@/features/brew-controller/telemetry-source";
import type { useDeviceCommand } from "@/features/brew-controller/use-device-command";
import type { TelemetryStream } from "@/features/brew-controller/use-telemetry-stream";
import { AlarmsPanel } from "@/features/brew-controller/components/alarms-panel";
import { ManualControlCard } from "@/features/brew-controller/components/manual-control-card";
import { HoldToConfirmButton } from "@/features/brew-controller/components/hold-to-confirm-button";
import { StageTimeline } from "@/features/brew-controller/components/stage-timeline";
import { DistillHero } from "@/features/brew-controller/components/distill-hero";
import { DistillLoopStrip } from "@/features/brew-controller/components/distill-loop-strip";
import {
  columnSensorStorageKey,
  isDistillFractionStage,
  nextFractionConfirmDescription,
  nextFractionConfirmTitle,
  resolveColumnReading,
  resolveColumnSensorIndex,
} from "@/features/brew-controller/distill-console";

type ConfirmState = {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "primary" | "danger";
  run: () => Promise<void>;
} | null;

type Props = {
  /** Единая SSE-подписка — от владельца (device-console.tsx). */
  stream: TelemetryStream;
  /** Аренда/команды — от владельца. */
  command: ReturnType<typeof useDeviceCommand>;
  source: TelemetrySource;
  initialHistory: TelemetryHistoryPoint[];
  hasDevice: boolean;
  deviceId: string;
  variant?: "page" | "kiosk";
};

export function DistillDashboardView({
  stream,
  command,
  source,
  initialHistory,
  hasDevice,
  deviceId,
  variant = "page",
}: Props) {
  const { telemetry, isLive } = stream;
  const { controlsHeld, pending, send } = command;

  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Датчик колонны — читаем localStorage ТОЛЬКО на клиенте (SSR-safe: первый
  // рендер — null, эффект догружает сохранённое значение после mount).
  const [columnRaw, setColumnRaw] = useState<string | null>(null);
  useEffect(() => {
    try {
      setColumnRaw(window.localStorage.getItem(columnSensorStorageKey(deviceId)));
    } catch {
      // приватный режим/квота недоступны — остаёмся без назначенного датчика
    }
  }, [deviceId]);

  const assignColumnSensor = useCallback(
    (index: number) => {
      setColumnRaw(String(index));
      try {
        window.localStorage.setItem(columnSensorStorageKey(deviceId), String(index));
      } catch {
        // тихо игнорируем — назначение проживёт до конца сессии в состоянии
      }
    },
    [deviceId],
  );

  const columnSensorIndex = telemetry ? resolveColumnSensorIndex(columnRaw, telemetry.sensors) : null;
  const columnReading = resolveColumnReading(telemetry?.sensors, columnSensorIndex);

  // Рутинные команды (SKIP_STAGE/STOP) — только у держателя аренды при живой телеметрии.
  const controlsDisabled = !isLive || pending || !controlsHeld;

  const run = useCallback(
    async (cmd: Command) => {
      setActionMsg(null);
      const r = await send(cmd);
      setActionMsg(r.ok ? "Команда принята устройством" : r.error ?? "Не удалось выполнить команду");
      return r;
    },
    [send],
  );

  const requestConfirm = useCallback((state: NonNullable<ConfirmState>) => setConfirm(state), []);
  const runConfirmed = useCallback(async () => {
    if (!confirm) return;
    const runFn = confirm.run;
    setConfirm(null);
    await runFn();
  }, [confirm]);

  const stage = telemetry?.stageName ?? null;
  const nextFractionTitle = nextFractionConfirmTitle(stage);

  // «К следующей фракции» — из основного блока управления И из промпт-баннера
  // «Смените ёмкость» (см. баннер файла: то же SKIP_STAGE резолвит actionReady).
  const skipToNextFraction = useCallback(() => {
    if (!nextFractionTitle) return;
    requestConfirm({
      title: nextFractionTitle,
      description: nextFractionConfirmDescription(stage),
      confirmLabel: "Перейти",
      tone: "primary",
      run: async () => {
        await run(cmdSkipStage());
      },
    });
  }, [nextFractionTitle, stage, requestConfirm, run]);

  const stop = useCallback(() => {
    requestConfirm({
      title: "Остановить перегон?",
      description: "Устройство выключит нагрев. Текущий срез фракций потребуется начать заново.",
      confirmLabel: "Остановить",
      tone: "danger",
      run: async () => {
        await run(cmdStop());
      },
    });
  }, [requestConfirm, run]);

  const chart = <TelemetryChart source={source} hasDevice={hasDevice} initial={initialHistory} />;

  const actionReadyBanner =
    telemetry?.actionReady && isDistillFractionStage(stage) ? (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
        <p className="text-sm font-semibold text-amber-900">Смените приёмную ёмкость</p>
        <Button variant="primary" size="md" disabled={controlsDisabled} onClick={skipToNextFraction}>
          Готово
        </Button>
      </div>
    ) : null;

  const controlBlock = (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-zinc-900">Управление</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {nextFractionTitle ? (
          <Button variant="primary" size="md" disabled={controlsDisabled} onClick={skipToNextFraction}>
            <ChevronRight className="h-4 w-4" aria-hidden />
            К следующей фракции
          </Button>
        ) : null}
        <Button variant="dangerOutline" size="md" disabled={pending} onClick={stop}>
          <Square className="h-4 w-4" aria-hidden />
          Стоп
        </Button>
        <HoldToConfirmButton
          label="Аварийный останов"
          holdingLabel="Держите для E-STOP…"
          disabled={pending || !hasDevice}
          onConfirm={() => void run(cmdEstop())}
          icon={<OctagonX className="h-4 w-4" aria-hidden />}
        />
      </div>
      {actionMsg ? <p className="mt-3 text-sm text-zinc-600">{actionMsg}</p> : null}
    </div>
  );

  const manualCard = (
    <ManualControlCard
      telemetry={telemetry}
      hasDevice={hasDevice}
      controlsHeld={controlsHeld}
      isLive={isLive}
      pending={pending}
      send={send}
    />
  );

  const alarms = (
    <AlarmsPanel
      faultMask={telemetry?.faultMask ?? 0}
      hasDevice={hasDevice}
      onClear={() => void run(cmdClearFault())}
      clearDisabled={pending || !isLive}
    />
  );

  const heroProps = {
    telemetry,
    columnSensorIndex,
    columnReading,
    onAssignColumnSensor: assignColumnSensor,
  };

  const isKiosk = variant === "kiosk";

  return (
    <div className="space-y-6">
      {alarms}
      {actionReadyBanner}

      {isKiosk ? (
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-4">
            <DistillHero {...heroProps} chart={chart} size="kiosk" />
            <StageTimeline telemetry={telemetry} hasDevice={hasDevice} />
          </div>
          <div className="space-y-4">
            <DistillLoopStrip telemetry={telemetry} />
            <div className="sticky bottom-0 z-10">{controlBlock}</div>
          </div>
        </div>
      ) : (
        <>
          <DistillHero {...heroProps} chart={chart} />
          <StageTimeline telemetry={telemetry} hasDevice={hasDevice} />
          <DistillLoopStrip telemetry={telemetry} />
          {/* Управление — липнет к низу на мобиле (thumb-zone, над нижней
              навигацией оболочки, тот же приём, что ControlDock в
              LiveDashboardView §5–6), в потоке на десктопе. */}
          <div className="sticky bottom-16 z-10 lg:static lg:bottom-auto">{controlBlock}</div>
        </>
      )}

      {manualCard}

      <ConfirmActionDialog
        open={confirm !== null}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        confirmLabel={confirm?.confirmLabel ?? "Подтвердить"}
        tone={confirm?.tone ?? "danger"}
        pending={pending}
        onConfirm={() => void runConfirmed()}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
