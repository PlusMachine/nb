"use client";

// =============================================================================
//  features/brew-controller/components/live-dashboard-view.tsx
//  Презентационное тело живого дашборда (зоны A/B). Живую подписку (stream) и
//  аренду/команды (command) получает пропсами, чтобы владелец (пульт L2) поднимал
//  ОДНУ подписку и кормил и sticky-хедер, и это тело из одного источника (редизайн
//  L2 §5–6). Локальны только UI-состояния: подтверждение STOP и краткий фидбек.
//
//  Раскладка §5: аварии(баннер) → промпт(гид) → ГЕРОЙ (отсчёт + живой график
//  сверху) → профиль-полоса стадий → ряд «статус | управление» → ручной/датчики.
//  Оркестрация «команда → фидбек» и conditional visibility — здесь; авторитет у
//  интерлоков устройства (кнопки совещательные), опасное гейтится сервером.
// =============================================================================
import { useCallback, useState } from "react";
import { Beer, Power } from "lucide-react";

import {
  promptName,
  cmdAck,
  cmdEnterManual,
  cmdPause,
  cmdResume,
  cmdSkipStage,
  cmdStop,
  cmdEstop,
  cmdClearFault,
  type Command,
  type Stage,
  type Prompt,
  type PromptAns
} from "@nb/brewforge-protocol";
import { Button } from "@nb/ui";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import type { TelemetryHistoryPoint } from "@/features/brew-batches/contracts";
import { TelemetryChart } from "@/features/brew-batches/components/telemetry-chart";
import { type DeviceChannel, type TelemetrySource } from "@/features/brew-controller/telemetry-source";
import type { useDeviceCommand } from "@/features/brew-controller/use-device-command";
import type { TelemetryStream } from "@/features/brew-controller/use-telemetry-stream";
import { ChannelBadge } from "@/features/brew-controller/components/channel-badge";
import { ControlLeaseBadge } from "@/features/brew-controller/components/control-lease-badge";
import { AlarmsPanel } from "@/features/brew-controller/components/alarms-panel";
import { ManualControlCard } from "@/features/brew-controller/components/manual-control-card";
import { StageTimeline } from "@/features/brew-controller/components/stage-timeline";
import { StatusPill } from "@/features/brew-controller/components/status-pill";
import { MonitorHero } from "@/features/brew-controller/components/monitor-hero";
import { StatusStrip } from "@/features/brew-controller/components/status-strip";
import { ControlDock } from "@/features/brew-controller/components/control-dock";
import { deriveDeviceMode } from "@/features/brew-controller/device-mode";
import { BrewRecipeOnDevicePicker } from "@/features/devices/components/brew-recipe-on-device-picker";
import type { PushableRecipeDto } from "@/features/devices/onboard-recipes-contracts";

type ConfirmState = {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "primary" | "danger";
  run: () => Promise<void>;
} | null;

type PromptOption = { label: string; ans: PromptAns };

// Допустимые ответы пользователя на каждый промпт (bf_prompt_t → bf_prompt_answer_t).
const PROMPT_OPTIONS: Record<Prompt, PromptOption[]> = {
  NONE: [],
  SPARGE_WATER: [
    { label: "Да", ans: "YES" },
    { label: "Нет", ans: "NO" }
  ],
  CONTINUE_DOUGH: [{ label: "Продолжить", ans: "CONTINUE" }],
  ADD_MALT: [{ label: "OK", ans: "OK" }],
  IODINE: [
    { label: "Продолжить", ans: "CONTINUE" },
    { label: "Продлить", ans: "EXTEND" }
  ],
  REMOVE_MALT: [{ label: "OK", ans: "OK" }],
  RESUME_BREW: [
    { label: "Да", ans: "YES" },
    { label: "Нет", ans: "NO" }
  ]
};

const PROMPT_TITLES: Record<Prompt, string> = {
  NONE: "",
  SPARGE_WATER: "Готова вода для промывки?",
  CONTINUE_DOUGH: "Продолжить засыпку солода?",
  ADD_MALT: "Засыпьте солод",
  IODINE: "Йодная проба",
  REMOVE_MALT: "Удалите солод",
  RESUME_BREW: "Возобновить варку после перезагрузки?"
};

function fmtTemp(c: number): string {
  return `${c.toFixed(1)} °C`;
}

type Props = {
  /** Единая SSE-подписка (свежесть/«в эфире»/отсчёт) — от владельца. */
  stream: TelemetryStream;
  /** Аренда/команды (control-lease + send + undo) — от владельца. */
  command: ReturnType<typeof useDeviceCommand>;
  /** Источник телеметрии (для истории графика в герое). */
  source: TelemetrySource;
  /** Серверно-загруженная начальная история для графика. */
  initialHistory: TelemetryHistoryPoint[];
  hasDevice: boolean;
  channel?: DeviceChannel | null;
  title?: string | null;
  subtitle?: string | null;
  /** Показать инлайновую шапку со статус-кластером (зона A). Пульт L2 (зона B)
   *  рисует свой единый sticky-хедер и передаёт false. */
  showInlineHeader?: boolean;
  /** Липкий док управления снизу (thumb-zone) на мобиле — пульт L2 (§5–6). */
  stickyDock?: boolean;
  /** Имя устройства — для текста подтверждения нагрева в пикере «Сварить рецепт…»
   *  (W5, только зона B — пульт устройства, source.kind==="device"). */
  deviceName?: string | null;
  /** Рецепты пользователя для вкладки «Мои рецепты» пикера «Сварить рецепт…»
   *  (W5). Не нужны в зоне A (варка партии уже привязана к рецепту). */
  pushableRecipes?: PushableRecipeDto[];
};

export function LiveDashboardView({
  stream,
  command,
  source,
  initialHistory,
  hasDevice,
  channel,
  title,
  subtitle,
  showInlineHeader = true,
  stickyDock = false,
  deviceName,
  pushableRecipes = []
}: Props) {
  const { telemetry, conn, isStale, isLive, lastError, remaining } = stream;
  const { lease, controlsHeld, pending, send, requestTakeover, release, scheduleUndoable } = command;

  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [recipePickerOpen, setRecipePickerOpen] = useState(false);

  // «Сварить рецепт…» (W5, §7) доступна только на пульте устройства (зона B) —
  // в зоне A (варка партии) устройство известно лишь косвенно через партию.
  const idleDeviceId = source.kind === "device" ? source.deviceId : null;

  // Рутинное управление (Пауза/Продолжить/Пропустить/ответ на промпт) требует
  // аренды (single-writer) И живой телеметрии. ESTOP/Стоп — fail-safe, отдельно.
  const controlsDisabled = !isLive || pending || !controlsHeld;

  const activePrompt: Prompt | null =
    telemetry && telemetry.prompt !== 0 ? promptName(telemetry.prompt) : null;

  // Машинное имя стадии для conditional visibility TransportBar.
  const stage: Stage | null = telemetry ? telemetry.stageName : null;

  // Режим устройства (зеркало платы, §1.2/§6) — для лёгкого ветвления UI.
  const mode = deriveDeviceMode(telemetry, isLive);

  // Отправка команды + краткий фидбек (успех / nack / причина гейта: DEVICE_STALE,
  // NO_CONTROL_LEASE, REMOTE_DISABLED…). Источник истины по состоянию — телеметрия.
  const run = useCallback(
    async (cmd: Command) => {
      setActionMsg(null);
      const r = await send(cmd);
      setActionMsg(r.ok ? "Команда принята устройством" : r.error ?? "Не удалось выполнить команду");
      return r;
    },
    [send]
  );

  const answerPrompt = useCallback(
    (ans: PromptAns) => {
      if (!telemetry) return;
      void run(cmdAck(ans, telemetry.promptSeq));
    },
    [run, telemetry]
  );

  // SKIP_STAGE — один тап + окно undo (отложенная отправка): хук шлёт команду
  // через ~5с, «Отменить» в тосте останавливает отправку.
  const skipStage = useCallback(() => {
    setActionMsg(null);
    scheduleUndoable(cmdSkipStage(), {
      label: "Стадия пропущена",
      onResult: (r) => setActionMsg(r.ok ? "Стадия пропущена" : r.error ?? "Не удалось пропустить стадию")
    });
  }, [scheduleUndoable]);

  const requestConfirm = useCallback((state: NonNullable<ConfirmState>) => {
    setConfirm(state);
  }, []);

  const runConfirmed = useCallback(async () => {
    if (!confirm) return;
    const runFn = confirm.run;
    setConfirm(null);
    await runFn();
  }, [confirm]);

  return (
    <div className="space-y-6">
      {showInlineHeader ? (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            {title ? (
              <h1
                className="text-2xl font-semibold text-zinc-950 sm:text-3xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {title}
              </h1>
            ) : null}
            {subtitle ? <p className="text-sm text-zinc-500">{subtitle}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ControlLeaseBadge
              lease={lease}
              hasDevice={hasDevice}
              onRequestTakeover={() => void requestTakeover()}
              onRelease={() => void release()}
              pending={pending}
            />
            {hasDevice ? <ChannelBadge channel={channel} /> : null}
            <StatusPill hasDevice={hasDevice} conn={conn} isStale={isStale} />
          </div>
        </header>
      ) : null}

      {!hasDevice ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
          К этой варке не привязан контроллер BrewForge. Запустите варку на устройстве, чтобы видеть живую телеметрию.
        </div>
      ) : null}

      {/* Аварии (ISA-18.2): приоритет, «что + что делать», acknowledge, сброс. */}
      <AlarmsPanel
        faultMask={telemetry?.faultMask ?? 0}
        hasDevice={hasDevice}
        onClear={() => void run(cmdClearFault())}
        clearDisabled={pending || !isLive}
      />

      {/* Простой: пивоварня свободна — точка входа. «Сварить рецепт…» (W5, §7)
          запускает варку прямо с пульта; «Ручной режим» — вход без рецепта (§6). */}
      {mode === "idle" ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-base font-semibold text-zinc-900">Пивоварня свободна</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {idleDeviceId ? (
              <Button variant="primary" size="md" onClick={() => setRecipePickerOpen(true)}>
                <Beer className="h-4 w-4" aria-hidden />
                Сварить рецепт…
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="md"
              disabled={controlsDisabled}
              onClick={() => void run(cmdEnterManual())}
            >
              <Power className="h-4 w-4" aria-hidden />
              Ручной режим
            </Button>
          </div>
        </div>
      ) : null}

      {/* Промпт — требует ответа оператора (гид). */}
      {activePrompt ? (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">Запрос устройства</p>
          <p className="mt-1 text-lg font-semibold text-zinc-950">{PROMPT_TITLES[activePrompt]}</p>
          <p className="text-xs text-amber-700">{activePrompt}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PROMPT_OPTIONS[activePrompt].map((opt) => (
              <Button key={opt.ans} onClick={() => answerPrompt(opt.ans)} disabled={controlsDisabled}>
                {opt.label}
              </Button>
            ))}
          </div>
          {!controlsHeld ? (
            <p className="mt-2 text-xs text-amber-700">
              Ответить на запрос может только сеанс, который управляет устройством.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Герой (§5): крупный отсчёт + живой график сверху (анти-RAPT: график не
          закопан внизу, а рядом с текущим состоянием). */}
      <div className="space-y-3">
        <MonitorHero telemetry={telemetry} remaining={remaining} />
        <TelemetryChart source={source} hasDevice={hasDevice} initial={initialHistory} />
      </div>

      {/* Профиль-полоса: макро-стадии (Затор → Кипячение → Вирпул → Охлаждение → Готово). */}
      <StageTimeline telemetry={telemetry} hasDevice={hasDevice} />

      {/* Статус «с одного взгляда». */}
      <StatusStrip telemetry={telemetry} />

      {/* Совещательное управление: на мобиле — липкий док снизу (thumb-zone, §5–6,
          над нижней навигацией оболочки), на десктопе — в потоке. Ниже есть контент
          (ручной/датчики), поэтому sticky-bottom реально прилипает. */}
      <div className={stickyDock ? "sticky bottom-16 z-10 lg:static lg:bottom-auto" : undefined}>
        <ControlDock
          stageName={stage}
          hasDevice={hasDevice}
          controlsHeld={controlsHeld}
          isLive={isLive}
          pending={pending}
          onPause={() => void run(cmdPause())}
          onResume={() => void run(cmdResume())}
          onSkip={skipStage}
          onStop={() =>
            requestConfirm({
              title: "Остановить варку?",
              description:
                "Плавная остановка: устройство завершит варку и выключит нагрев. Действие необратимо.",
              confirmLabel: "Остановить",
              tone: "danger",
              run: async () => {
                await run(cmdStop());
              }
            })
          }
          onEstop={() => void run(cmdEstop())}
          actionMsg={actionMsg}
          transportError={lastError && conn === "error" ? lastError : null}
          noFreshTelemetry={(isStale || conn === "offline") && hasDevice}
          otherSessionHolds={isLive && !controlsHeld && Boolean(lease?.held)}
        />
      </div>

      {/* Ручной режим (RAPT-style): уставка/мощность/нагрев/насос — по состоянию
          «ручной» (внутренняя conditional visibility). Эксклюзивно через
          control-lease; опасное гейтится сервером и dead-man'ом платы. */}
      <ManualControlCard
        telemetry={telemetry}
        hasDevice={hasDevice}
        controlsHeld={controlsHeld}
        isLive={isLive}
        pending={pending}
        send={send}
      />

      {/* Датчики (деталь). */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-zinc-900">Датчики</p>
        {telemetry && telemetry.sensors.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {telemetry.sensors.map((s) => (
              <div
                key={s.i}
                className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm"
              >
                <span className="text-zinc-500">Датчик {s.i}</span>
                <span className={`tabular-nums font-medium ${s.valid ? "text-zinc-900" : "text-red-600"}`}>
                  {s.valid ? fmtTemp(s.c) : "нет данных"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">—</p>
        )}
      </div>

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

      {/* «Сварить рецепт…» с пульта простаивающего устройства (W5, §7). */}
      {idleDeviceId ? (
        <BrewRecipeOnDevicePicker
          open={recipePickerOpen}
          onOpenChange={setRecipePickerOpen}
          deviceId={idleDeviceId}
          deviceName={deviceName}
          pushableRecipes={pushableRecipes}
        />
      ) : null}
    </div>
  );
}
