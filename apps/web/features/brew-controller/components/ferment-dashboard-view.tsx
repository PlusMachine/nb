"use client";

// =============================================================================
//  features/brew-controller/components/ferment-dashboard-view.tsx
//  Пульт ферментации (веб-HMI §8) — третье «лицо» единого пульта устройства
//  (наряду с LiveDashboardView для варки/дистилляции). Та же оркестрация
//  run/confirm и те же пропсы stream/command/source, что у LiveDashboardView —
//  владелец подписки/аренды остаётся device-console.tsx, здесь только тело.
//
//  Транспорта варочного типа (пауза/skip-док) НЕТ — недельный процесс живёт
//  редкими осознанными действиями: «изменить уставку» (PUT /config, БЕЗ гейта
//  на аренду — как настройки устройства) и «перейти к следующей ступени»
//  (SKIP_STAGE — гейт live+lease, как рутинные команды). Старт брожения — только
//  на устройстве (§16.1), кнопки старта здесь нет.
//
//  Матрица состояний §12.1: конфиг недоступен (офлайн-чтение упало) ≠ профиль
//  пуст (nSteps=0) — разные баннеры, не путаем «не смогли узнать» с «пусто».
//
//  Загрузка ferment{} конфига (F3): сервер (page.tsx) больше НЕ ждёт readConfig
//  устройства — офлайн-прибор без таймаута на fetch держал всю SSR-страницу на
//  ОС-таймаут (~17с). Конфиг грузится здесь, на маунте, коротким клиентским
//  fetch с AbortSignal.timeout — состояние configLoadStatus различает «ещё
//  грузим» (нейтральный скелет) от «точно недоступен» (баннер) от «прочитан».
//
//  Датчики-грид (детальный список сенсоров варочного пульта) сознательно
//  ОПУЩЕН — glanceable-пульт ферментации (§8): герой уже показывает главный
//  датчик, детальный список на недельном процессе не нужен ежедневно.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Beer, ChevronRight, OctagonX, Square } from "lucide-react";
import Link from "next/link";

import {
  cmdClearFault,
  cmdEstop,
  cmdSkipStage,
  cmdStop,
  DeviceConfigSchema,
  type FermentConfig,
} from "@nb/brewforge-protocol";
import { Button } from "@nb/ui";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { FERMENT_HISTORY_WINDOW_DAYS, type TelemetryHistoryPoint } from "@/features/brew-batches/contracts";
import { type TelemetrySource } from "@/features/brew-controller/telemetry-source";
import type { useDeviceCommand } from "@/features/brew-controller/use-device-command";
import type { TelemetryStream } from "@/features/brew-controller/use-telemetry-stream";
import { AlarmsPanel } from "@/features/brew-controller/components/alarms-panel";
import { ManualControlCard } from "@/features/brew-controller/components/manual-control-card";
import { HoldToConfirmButton } from "@/features/brew-controller/components/hold-to-confirm-button";
import { FermentHero } from "@/features/brew-controller/components/ferment-hero";
import { FermentLoopStrip } from "@/features/brew-controller/components/ferment-loop-strip";
import { FermentHistoryChart } from "@/features/brew-controller/components/ferment-history-chart";
import { FermentProfileCard } from "@/features/brew-controller/components/ferment-profile-card";
import { FermentProfileEditor } from "@/features/brew-controller/components/ferment-profile-editor";
import {
  activeFermentSteps,
  buildFermentProgress,
  type FermentPlanMappingResult,
} from "@/features/brew-controller/ferment-profile";

const CONFIG_ERROR_TEXT: Record<string, string> = {
  INVALID_REQUEST: "Проверьте введённые значения",
  PROVIDER_UNAVAILABLE: "Синхронизация настроек недоступна для этого устройства",
  DEVICE_UNREACHABLE: "Устройство не отвечает — проверьте, что оно в сети",
  NOT_FOUND: "Устройство не найдено",
};

function configErrText(code: string | undefined | null): string {
  return (code && CONFIG_ERROR_TEXT[code]) || "Не удалось сохранить настройки";
}

function fmtTemp(c: number): string {
  return `${c.toFixed(1)} °C`;
}

export type FermenterBatchLink = { id: string; name: string; href: string };

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
  /** Секция ferment{} конфига устройства — null, если недоступна/не прислана (старая прошивка). */
  initialFermentConfig: FermentConfig | null;
  /** true — конфиг НЕ удалось прочитать (офлайн/провайдер недоступен). Отличаем от «профиль пуст». */
  configUnavailable: boolean;
  /** Бродящая партия, привязанная к этому прибору (§8.4) — null, если не привязана. */
  fermenterBatch: FermenterBatchLink | null;
  /** Маппинг плана привязанной партии → ступени прибора (§13) — null, если партии/плана нет. */
  planMapping: FermentPlanMappingResult | null;
  variant?: "page" | "kiosk";
};

export function FermentDashboardView({
  stream,
  command,
  source,
  initialHistory,
  hasDevice,
  deviceId,
  initialFermentConfig,
  configUnavailable,
  fermenterBatch,
  planMapping,
  variant = "page",
}: Props) {
  const { telemetry, isLive } = stream;
  const { controlsHeld, pending, send } = command;

  const [fermentConfig, setFermentConfig] = useState<FermentConfig | null>(initialFermentConfig);
  // "loading" — ещё не знаем (пришли с сервера без конфига, F3); "unavailable" —
  // клиентский fetch подтвердил недоступность/таймаут; "ready" — конфиг получен
  // (initialFermentConfig !== null покрывает и будущих вызывающих, которые всё же
  // передадут preload). configUnavailable=true с сервера — тоже сразу "unavailable".
  const [configLoadStatus, setConfigLoadStatus] = useState<"loading" | "unavailable" | "ready">(
    initialFermentConfig !== null ? "ready" : configUnavailable ? "unavailable" : "loading",
  );
  const [savingSetpoint, setSavingSetpoint] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Клиентская загрузка ferment{} конфига (F3): офлайн-устройство больше не
  // держит SSR — короткий таймаут (2.5с) вместо ОС-таймаута голого fetch (~17с),
  // по образцу device-config-form.tsx. Пока грузится — нейтральный скелет, не
  // «недоступен» (см. profileSection ниже).
  useEffect(() => {
    if (configLoadStatus !== "loading") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/devices/${deviceId}/config`, {
          cache: "no-store",
          signal: AbortSignal.timeout(2500),
        });
        const body = (await res.json().catch(() => null)) as { config?: unknown } | null;
        if (cancelled) return;
        if (!res.ok || !body?.config) {
          setConfigLoadStatus("unavailable");
          return;
        }
        const parsed = DeviceConfigSchema.safeParse(body.config);
        if (!parsed.success) {
          setConfigLoadStatus("unavailable");
          return;
        }
        setFermentConfig(parsed.data.ferment ?? null);
        setConfigLoadStatus("ready");
      } catch {
        if (!cancelled) setConfigLoadStatus("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configLoadStatus, deviceId]);

  // Рутинные команды (SKIP_STAGE) — только у держателя аренды при живой телеметрии.
  // Правка конфига (PUT /config) НЕ гейтится арендой — как настройки устройства.
  const controlsDisabled = !isLive || pending || !controlsHeld;

  const run = useCallback(
    async (cmd: Parameters<typeof send>[0]) => {
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

  const planSteps = planMapping?.ok ? planMapping.steps : null;
  const planError = planMapping && !planMapping.ok ? planMapping.error : null;

  // Активные ступени (обрезка по nSteps, §13) — устройство шлёт фиксированный
  // 6-слотовый steps[], «хвост» за nSteps — заполнитель, не часть профиля.
  const activeSteps = useMemo(() => (fermentConfig ? activeFermentSteps(fermentConfig) : []), [fermentConfig]);

  const progress = useMemo(
    () =>
      buildFermentProgress({
        steps: activeSteps,
        currentIndex: telemetry ? telemetry.mashStepIndex : null,
        elapsedSec: telemetry?.stageElapsedSec ?? 0,
        planSteps,
      }),
    [activeSteps, telemetry, planSteps],
  );

  const hasProfile = activeSteps.length > 0;

  // Записать ferment.steps ЦЕЛИКОМ (не частичным диффом) — тот же приём, что
  // device-config-form.tsx для sensorCal: прошивка переопределяет массив по
  // индексу, целиком безопаснее частичных дыр. nSteps — ЯВНЫЙ параметр (не
  // steps.length по умолчанию): вызывающая сторона решает, сколько ступеней
  // активны, иначе правка одной уставки поверх обрезанного activeSteps молча
  // ужала/не тронула бы исходный nSteps устройства.
  const patchFermentSteps = useCallback(
    async (
      steps: { tempC: number; hours: number }[],
      nSteps: number,
    ): Promise<{ ok: boolean; error?: string | null }> => {
      try {
        const res = await fetch(`/api/devices/${deviceId}/config`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ config: { ferment: { steps, nSteps } } }),
        });
        const body = (await res.json().catch(() => null)) as { config?: unknown; error?: string } | null;
        if (!res.ok || !body?.config) {
          return { ok: false, error: configErrText(body?.error) };
        }
        const parsed = DeviceConfigSchema.safeParse(body.config);
        if (parsed.success) {
          setFermentConfig(parsed.data.ferment ?? null);
        }
        return { ok: true };
      } catch {
        return { ok: false, error: CONFIG_ERROR_TEXT.DEVICE_UNREACHABLE! };
      }
    },
    [deviceId],
  );

  const saveCurrentSetpoint = useCallback(
    async (tempC: number) => {
      if (!fermentConfig || progress.current === null) {
        return { ok: false, error: "Профиль не задан" };
      }
      const steps = activeSteps.map((s, i) => (i === progress.current!.index ? { ...s, tempC } : s));
      setSavingSetpoint(true);
      const result = await patchFermentSteps(steps, steps.length);
      setSavingSetpoint(false);
      return result;
    },
    [fermentConfig, activeSteps, progress.current, patchFermentSteps],
  );

  const saveProfile = useCallback(
    async (steps: { tempC: number; hours: number }[]) => {
      setSavingProfile(true);
      const result = await patchFermentSteps(steps, steps.length);
      setSavingProfile(false);
      if (result.ok) setEditorOpen(false);
      return result;
    },
    [patchFermentSteps],
  );

  const skipToNext = useCallback(() => {
    if (!progress.current || !progress.next) return;
    requestConfirm({
      title: `Завершить «${progress.current.label}» и перейти к «${progress.next.label}»?`,
      description: "Устройство сразу переключит уставку на следующую ступень профиля.",
      confirmLabel: "Перейти",
      tone: "primary",
      run: async () => {
        await run(cmdSkipStage());
      },
    });
  }, [progress.current, progress.next, requestConfirm, run]);

  const stop = useCallback(() => {
    requestConfirm({
      title: "Остановить ферментацию?",
      description: "Устройство завершит контроль температуры и выключит нагрев/охлаждение. Профиль потребуется задать заново.",
      confirmLabel: "Остановить",
      tone: "danger",
      run: async () => {
        await run(cmdStop());
      },
    });
  }, [requestConfirm, run]);

  const chart = (
    <FermentHistoryChart
      source={source}
      hasDevice={hasDevice}
      initial={initialHistory}
      planSteps={activeSteps}
      windowDays={FERMENT_HISTORY_WINDOW_DAYS}
    />
  );

  const profileSection = configLoadStatus === "loading" ? (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-busy="true">
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-3 w-64 animate-pulse rounded bg-muted" />
    </div>
  ) : configLoadStatus === "unavailable" ? (
    <div className="rounded-2xl border border-warning/30 bg-warning-subtle p-4 text-sm text-warning-subtle-foreground">
      Конфиг устройства недоступен — не можем показать профиль брожения. Живая телеметрия работает как обычно.
    </div>
  ) : hasProfile ? (
    <FermentProfileCard
      progress={progress}
      skipDisabled={controlsDisabled}
      onSkipToNext={skipToNext}
      savingSetpoint={savingSetpoint}
      onSaveSetpoint={saveCurrentSetpoint}
    />
  ) : (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-base font-semibold text-foreground">Профиль не задан</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Прибор держит {telemetry ? fmtTemp(telemetry.setpointC) : "—"}
      </p>
      {editorOpen ? (
        <FermentProfileEditor planSteps={planSteps} planError={planError} saving={savingProfile} onSave={saveProfile} />
      ) : (
        <Button variant="primary" size="md" className="mt-3" onClick={() => setEditorOpen(true)}>
          Задать профиль
        </Button>
      )}
    </div>
  );

  const batchLink = fermenterBatch ? (
    <Link
      href={fermenterBatch.href}
      className="flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-sm font-medium text-foreground shadow-sm transition hover:bg-accent"
    >
      <Beer className="h-4 w-4 text-warning" aria-hidden />
      В ферментере: партия «{fermenterBatch.name}»
      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden />
    </Link>
  ) : null;

  const controlBlock = (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="text-sm font-semibold text-foreground">Управление</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
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
      {actionMsg ? <p className="mt-3 text-sm text-muted-foreground">{actionMsg}</p> : null}
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

  const isKiosk = variant === "kiosk";

  return (
    <div className="space-y-6">
      {alarms}

      {isKiosk ? (
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-4">
            <FermentHero
              telemetry={telemetry}
              current={progress.current}
              next={progress.next}
              dayLabel={progress.dayLabel}
              chart={chart}
              size="kiosk"
            />
            {profileSection}
          </div>
          <div className="space-y-4">
            {batchLink}
            <FermentLoopStrip telemetry={telemetry} />
            <div className="sticky bottom-0 z-10">{controlBlock}</div>
          </div>
        </div>
      ) : (
        <>
          <FermentHero
            telemetry={telemetry}
            current={progress.current}
            next={progress.next}
            dayLabel={progress.dayLabel}
            chart={chart}
          />
          {profileSection}
          {batchLink}
          <FermentLoopStrip telemetry={telemetry} />
        </>
      )}

      {manualCard}
      {!isKiosk ? controlBlock : null}

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
