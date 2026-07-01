"use client";

// =============================================================================
//  features/brew-batches/components/live-dashboard.tsx
//  Живой дашборд — TRANSPORT-АГНОСТИЧНЫЙ (зона A «варка партии» и зона B «пульт
//  устройства» отличаются лишь источником: batchId vs deviceId — см.
//  telemetry-source.ts). Открывает EventSource на SSE-стрим телеметрии, рендерит
//  снимок bf_brew_state_t и шлёт команды/ответы на промпты POST'ом на /command.
//
//  ВАЖНО: интерлоки и нагрев — прерогатива устройства. Кнопки портала
//  совещательные (advisory): устройство вправе их отклонить (nack/REJECTED_*).
//  При отсутствии/устаревании телеметрии (offline/stale) управление блокируется
//  в UI, а опасные команды дополнительно гейтятся на сервере (freshness-гейт).
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { OctagonX, Cloud, Wifi } from "lucide-react";

import {
  TelemetrySchema,
  promptName,
  cmdAck,
  cmdPause,
  cmdResume,
  cmdSkipStage,
  cmdStop,
  cmdEstop,
  cmdClearFault,
  type Telemetry,
  type Command,
  type Stage,
  type Prompt,
  type PromptAns
} from "@nb/brewforge-protocol";
import { Button } from "@nb/ui";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { telemetryEndpoints, type TelemetrySource, type DeviceChannel } from "@/features/brew-controller/telemetry-source";
import { useDeviceCommand } from "@/features/brew-controller/use-device-command";
import { TransportBar } from "@/features/brew-controller/components/transport-bar";
import { ControlLeaseBadge } from "@/features/brew-controller/components/control-lease-badge";
import { HoldToConfirmButton } from "@/features/brew-controller/components/hold-to-confirm-button";
import { ControlToast } from "@/features/brew-controller/components/control-toast";
import { AlarmsPanel } from "@/features/brew-controller/components/alarms-panel";
import { ManualControlCard } from "@/features/brew-controller/components/manual-control-card";
import { StageTimeline } from "@/features/brew-controller/components/stage-timeline";

// Сколько секунд без свежего кадра считаем телеметрию устаревшей (poll ~1.5 с).
const STALE_AFTER_MS = 6000;

type ConnState = "connecting" | "online" | "offline" | "error";

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

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function fmtTemp(c: number): string {
  return `${c.toFixed(1)} °C`;
}

type Props = {
  /** Источник телеметрии: партия (зона A) или устройство напрямую (зона B). */
  source: TelemetrySource;
  /** Заголовок дашборда (имя партии или устройства). */
  title: string;
  /** Подзаголовок (рецепт·устройство или hardwareId·прошивка). */
  subtitle?: string | null;
  /** Есть ли за источником устройство (для партии — привязан ли контроллер). */
  hasDevice: boolean;
  /** Канал связи с устройством (честная индикация LAN/облако, Phase 6c). */
  channel?: DeviceChannel | null;
};

export function LiveDashboard({ source, title, subtitle, hasDevice, channel }: Props) {
  // Эндпоинты стрима/команд/аренды строятся из источника — контракт роутов в одном месте.
  const endpoints = telemetryEndpoints(source);
  const streamUrl = endpoints.stream;

  // Управление устройством: control-lease (acquire+heartbeat), отправка команд с
  // sessionId, optimistic/in-flight и отложенный undo (SKIP). Аренда — на устройство.
  const { lease, controlsHeld, pending, send, requestTakeover, release, scheduleUndoable, undo } =
    useDeviceCommand({ commandUrl: endpoints.command, leaseUrl: endpoints.lease, enabled: hasDevice });

  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [lastError, setLastError] = useState<string | null>(null);
  // Монотонные «настенные» часы клиента: момент прихода последнего валидного кадра.
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Локальный тикер раз в секунду: плавный обратный отсчёт + детект устаревания.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // SSE-подписка. EventSource сам переподключается; кадры:
  //   message            → валидный снимок Telemetry
  //   event: offline     → устройство не отдало валидной телеметрии
  //   event: error       → ошибка транспорта/провайдера на итерации
  useEffect(() => {
    if (!hasDevice) {
      return;
    }

    const es = new EventSource(streamUrl);

    es.onopen = () => {
      setConn((prev) => (prev === "online" ? prev : "connecting"));
    };

    es.onmessage = (event) => {
      try {
        const parsed = TelemetrySchema.safeParse(JSON.parse(event.data));
        if (parsed.success) {
          setTelemetry(parsed.data);
          setLastFrameAt(Date.now());
          setConn("online");
          setLastError(null);
        }
      } catch {
        // битый кадр игнорируем — следующий poll исправит
      }
    };

    es.addEventListener("offline", () => {
      setConn("offline");
    });

    // Кастомный server-sent «error» приходит сюда же, что и сетевые ошибки
    // EventSource: серверный кадр имеет .data, сетевой — нет.
    es.addEventListener("error", (event) => {
      const data = (event as MessageEvent).data;
      if (typeof data === "string" && data.length > 0) {
        try {
          const payload = JSON.parse(data) as { error?: string };
          setLastError(payload.error ?? "Ошибка телеметрии");
        } catch {
          setLastError("Ошибка телеметрии");
        }
        setConn("error");
      } else {
        // сетевой обрыв — EventSource переподключится сам
        setConn((prev) => (prev === "online" ? "connecting" : prev));
      }
    });

    return () => es.close();
  }, [streamUrl, hasDevice]);

  const sinceFrameMs = lastFrameAt === null ? Infinity : now - lastFrameAt;
  const isStale = telemetry !== null && sinceFrameMs > STALE_AFTER_MS;
  const isLive = conn === "online" && telemetry !== null && !isStale;
  // Рутинное управление (Пауза/Продолжить/Пропустить/ответ на промпт) требует
  // аренды (single-writer) И живой телеметрии. ESTOP/Стоп — fail-safe, отдельно.
  const controlsDisabled = !isLive || pending || !controlsHeld;

  // Плавный локальный обратный отсчёт оставшегося времени стадии.
  const remaining = telemetry
    ? Math.max(0, telemetry.stageRemainingSec - Math.floor(Math.max(0, sinceFrameMs) / 1000))
    : 0;

  const activePrompt: Prompt | null =
    telemetry && telemetry.prompt !== 0 ? promptName(telemetry.prompt) : null;

  // Машинное имя стадии для conditional visibility TransportBar.
  const stage: Stage | null = telemetry ? telemetry.stageName : null;

  // Отправка команды + краткий фидбек (успех / nack / причина гейта: DEVICE_STALE,
  // NO_CONTROL_LEASE, REMOTE_DISABLED…). Источник истины по состоянию — телеметрия.
  const run = useCallback(
    async (command: Command) => {
      setActionMsg(null);
      const r = await send(command);
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

  const connBadge = useMemo(() => {
    if (!hasDevice) return { label: "Нет устройства", cls: "bg-zinc-100 text-zinc-600" };
    if (isStale) return { label: "Устарело", cls: "bg-amber-100 text-amber-800" };
    if (conn === "online") return { label: "В эфире", cls: "bg-emerald-100 text-emerald-800" };
    if (conn === "offline") return { label: "Устройство офлайн", cls: "bg-amber-100 text-amber-800" };
    if (conn === "error") return { label: "Ошибка связи", cls: "bg-red-100 text-red-800" };
    return { label: "Подключение…", cls: "bg-zinc-100 text-zinc-600" };
  }, [conn, hasDevice, isStale]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1
            className="text-2xl font-semibold text-zinc-950 sm:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h1>
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
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${connBadge.cls}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {connBadge.label}
          </span>
        </div>
      </header>

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

      {/* Промпт — требует ответа оператора. */}
      {activePrompt ? (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">Запрос устройства</p>
          <p className="mt-1 text-lg font-semibold text-zinc-950">{PROMPT_TITLES[activePrompt]}</p>
          <p className="text-xs text-amber-700">{activePrompt}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PROMPT_OPTIONS[activePrompt].map((opt) => (
              <Button
                key={opt.ans}
                onClick={() => answerPrompt(opt.ans)}
                disabled={controlsDisabled}
              >
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

      {/* Ход варки: интерактивная полоса макро-стадий (пройдено/идёт/впереди). */}
      <StageTimeline telemetry={telemetry} hasDevice={hasDevice} />

      {/* Главный блок: температура vs уставка. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-500">Температура</p>
              <p className="mt-1 text-6xl font-semibold tabular-nums text-zinc-950">
                {telemetry && telemetry.primary.valid ? fmtTemp(telemetry.primary.c) : "—"}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Уставка: <span className="font-medium text-zinc-700 tabular-nums">{telemetry ? fmtTemp(telemetry.setpointC) : "—"}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-zinc-500">Стадия</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-950">{telemetry ? telemetry.stageName : "—"}</p>
              <p className="mt-1 text-sm text-zinc-500 tabular-nums">
                Осталось {telemetry ? fmtClock(remaining) : "—"} · прошло {telemetry ? fmtClock(telemetry.stageElapsedSec) : "—"}
              </p>
            </div>
          </div>

          {telemetry && telemetry.statusLine ? (
            <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{telemetry.statusLine}</p>
          ) : null}
        </div>

        {/* Состояние контура / выходов. */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-zinc-900">Контур</p>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Скважность нагрева" value={telemetry ? `${telemetry.heatDutyPct}%` : "—"} />
            <Row label="Нагрев (SSR)" value={<Pill on={telemetry?.heatOn ?? false} />} />
            <Row label="Кипение" value={telemetry ? `${telemetry.boilPct}%` : "—"} />
            <Row label="Насос" value={<Pill on={telemetry?.pumpOn ?? false} />} />
            <Row label="Нагрев промывки" value={<Pill on={telemetry?.spargeHeatOn ?? false} />} />
            <Row
              label="Нагрев разрешён"
              value={
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                    telemetry?.heatingPermitted ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {telemetry?.heatingPermitted ? "ДА" : "НЕТ"}
                </span>
              }
            />
          </dl>
        </div>
      </div>

      {/* Датчики. */}
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

      {/* Ручной режим (RAPT-style): уставка/мощность/нагрев/насос. Эксклюзивно
          через control-lease; опасное гейтится сервером и dead-man'ом платы. */}
      <ManualControlCard
        telemetry={telemetry}
        hasDevice={hasDevice}
        controlsHeld={controlsHeld}
        isLive={isLive}
        pending={pending}
        send={send}
      />

      {/* Совещательное управление. Авторитет — у интерлоков устройства. Рутина —
          один тап (без модалок); опасное — hold-to-confirm/двухшаг; всё гейтится
          сервером (аренда + свежесть). */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-900">Управление</p>
          <span className="text-xs text-zinc-400">совещательное · решает устройство</span>
        </div>

        {/* TransportBar: рутина в один тап (conditional visibility по стадии). */}
        <div className="mt-3">
          <TransportBar
            stageName={stage}
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
          />
        </div>

        {/* Аварийный останов — всегда доступен (fail-safe), hold-to-confirm. */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
          <HoldToConfirmButton
            label="Аварийный останов"
            holdingLabel="Держите для E-STOP…"
            disabled={pending || !hasDevice}
            onConfirm={() => void run(cmdEstop())}
            icon={<OctagonX className="h-4 w-4" aria-hidden />}
          />
          <span className="text-xs text-zinc-500">
            Программная кнопка ≠ аппаратный E-stop. Реальная защита — интерлоки и
            watchdog на плате.
          </span>
        </div>

        {actionMsg ? <p className="mt-3 text-sm text-zinc-600">{actionMsg}</p> : null}
        {lastError && conn === "error" ? (
          <p className="mt-1 text-sm text-red-600">Телеметрия: {lastError}</p>
        ) : null}
        {(isStale || conn === "offline") && hasDevice ? (
          <p className="mt-1 text-sm text-amber-700">
            Нет свежей телеметрии — рутинное управление заблокировано до восстановления связи.
          </p>
        ) : null}
        {isLive && !controlsHeld && lease?.held ? (
          <p className="mt-1 text-sm text-amber-700">
            Управляет другой сеанс — запросите перехват, чтобы взять контроль.
          </p>
        ) : null}
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

      {/* Undo-тост для отложенного SKIP_STAGE. */}
      <ControlToast undo={undo} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-900 tabular-nums">{value}</dd>
    </div>
  );
}

function Pill({ on }: { on: boolean }) {
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
        on ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-500"
      }`}
    >
      {on ? "ВКЛ" : "ВЫКЛ"}
    </span>
  );
}

// Честная индикация канала связи (Phase 6c): LAN — прямой (низкая латентность),
// облако — через мост (зависит от интернета). Демо и неизвестный канал не мозолят.
function ChannelBadge({ channel }: { channel?: DeviceChannel | null }) {
  if (channel !== "lan" && channel !== "cloud") return null;
  const isCloud = channel === "cloud";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600"
      title={isCloud ? "Через мост (облако) — зависит от интернета" : "Прямой канал (LAN)"}
    >
      {isCloud ? <Cloud className="h-3.5 w-3.5" aria-hidden /> : <Wifi className="h-3.5 w-3.5" aria-hidden />}
      {isCloud ? "Облако" : "LAN"}
    </span>
  );
}
