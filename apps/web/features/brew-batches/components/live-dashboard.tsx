"use client";

// =============================================================================
//  features/brew-batches/components/live-dashboard.tsx
//  Живой дашборд варки: открывает EventSource на SSE-стрим телеметрии партии
//  (/api/brew-batches/[id]/telemetry), рендерит снимок bf_brew_state_t и шлёт
//  команды/ответы на промпты через POST /api/brew-batches/[id]/command.
//
//  ВАЖНО: интерлоки и нагрев — прерогатива устройства. Кнопки портала
//  совещательные (advisory): устройство вправе их отклонить (nack/REJECTED_*).
//  При отсутствии/устаревании телеметрии (offline/stale) управление блокируется.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  TelemetrySchema,
  decodeFaults,
  promptName,
  cmdAck,
  cmdPause,
  cmdResume,
  cmdSkipStage,
  cmdEstop,
  type Telemetry,
  type Command,
  type Ack,
  type Prompt,
  type PromptAns
} from "@nb/brewforge-protocol";
import { Button } from "@nb/ui";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";

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
  brewBatchId: string;
  batchName: string;
  recipeTitle: string;
  deviceName: string | null;
  hasDevice: boolean;
};

export function LiveDashboard({ brewBatchId, batchName, recipeTitle, deviceName, hasDevice }: Props) {
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [lastError, setLastError] = useState<string | null>(null);
  // Монотонные «настенные» часы клиента: момент прихода последнего валидного кадра.
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [pending, setPending] = useState(false);
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

    const source = new EventSource(`/api/brew-batches/${brewBatchId}/telemetry`);

    source.onopen = () => {
      setConn((prev) => (prev === "online" ? prev : "connecting"));
    };

    source.onmessage = (event) => {
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

    source.addEventListener("offline", () => {
      setConn("offline");
    });

    // Кастомный server-sent «error» приходит сюда же, что и сетевые ошибки
    // EventSource: серверный кадр имеет .data, сетевой — нет.
    source.addEventListener("error", (event) => {
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

    return () => source.close();
  }, [brewBatchId, hasDevice]);

  const sinceFrameMs = lastFrameAt === null ? Infinity : now - lastFrameAt;
  const isStale = telemetry !== null && sinceFrameMs > STALE_AFTER_MS;
  const isLive = conn === "online" && telemetry !== null && !isStale;
  const controlsDisabled = !isLive || pending;

  // Плавный локальный обратный отсчёт оставшегося времени стадии.
  const remaining = telemetry
    ? Math.max(0, telemetry.stageRemainingSec - Math.floor(Math.max(0, sinceFrameMs) / 1000))
    : 0;

  const faults = telemetry ? decodeFaults(telemetry.faultMask) : [];
  const hasFaults = faults.length > 0;

  const activePrompt: Prompt | null =
    telemetry && telemetry.prompt !== 0 ? promptName(telemetry.prompt) : null;

  const postCommand = useCallback(
    async (command: Command): Promise<Ack | null> => {
      setPending(true);
      setActionMsg(null);
      try {
        const res = await fetch(`/api/brew-batches/${brewBatchId}/command`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command })
        });
        const body = (await res.json()) as { ack?: Ack; error?: string };
        if (!res.ok || body.error) {
          setActionMsg(`Ошибка: ${body.error ?? res.statusText}`);
          return null;
        }
        const ack = body.ack ?? null;
        if (ack && !ack.ok) {
          setActionMsg(`Устройство отклонило команду: ${ack.reason}`);
        } else if (ack) {
          setActionMsg("Команда принята устройством");
        }
        return ack;
      } catch (error) {
        setActionMsg(`Ошибка сети: ${(error as Error).message}`);
        return null;
      } finally {
        setPending(false);
      }
    },
    [brewBatchId]
  );

  const answerPrompt = useCallback(
    async (ans: PromptAns) => {
      if (!telemetry) return;
      await postCommand(cmdAck(ans, telemetry.promptSeq));
    },
    [postCommand, telemetry]
  );

  const requestConfirm = useCallback((state: NonNullable<ConfirmState>) => {
    setConfirm(state);
  }, []);

  const runConfirmed = useCallback(async () => {
    if (!confirm) return;
    const run = confirm.run;
    setConfirm(null);
    await run();
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
            {batchName}
          </h1>
          <p className="text-sm text-zinc-500">
            {recipeTitle}
            {deviceName ? ` · ${deviceName}` : ""}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${connBadge.cls}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {connBadge.label}
        </span>
      </header>

      {!hasDevice ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
          К этой варке не привязан контроллер BrewForge. Запустите варку на устройстве, чтобы видеть живую телеметрию.
        </div>
      ) : null}

      {/* Аварии — самым верхом и максимально заметно. */}
      {hasFaults ? (
        <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-red-700">Аварии устройства</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {faults.map((f) => (
              <span key={f} className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">
                {f}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-red-700">
            Нагрев заблокирован устройством до снятия аварии. Управляйте безопасностью на самом контроллере.
          </p>
        </div>
      ) : null}

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
                onClick={() => void answerPrompt(opt.ans)}
                disabled={pending || !isLive}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

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

      {/* Совещательное управление. Авторитет — у интерлоков устройства. */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-900">Управление</p>
          <span className="text-xs text-zinc-400">совещательное · решает устройство</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={controlsDisabled}
            onClick={() =>
              requestConfirm({
                title: "Поставить варку на паузу?",
                description: "Устройство приостановит текущую стадию. Нагрев останется под управлением интерлоков.",
                confirmLabel: "Пауза",
                tone: "primary",
                run: async () => {
                  await postCommand(cmdPause());
                }
              })
            }
          >
            Пауза
          </Button>
          <Button
            variant="outline"
            disabled={controlsDisabled}
            onClick={() =>
              requestConfirm({
                title: "Возобновить варку?",
                description: "Устройство продолжит варку со стадии, на которой была пауза.",
                confirmLabel: "Возобновить",
                tone: "primary",
                run: async () => {
                  await postCommand(cmdResume());
                }
              })
            }
          >
            Продолжить
          </Button>
          <Button
            variant="outline"
            disabled={controlsDisabled}
            onClick={() =>
              requestConfirm({
                title: "Пропустить текущую стадию?",
                description: "Устройство немедленно перейдёт к следующей стадии. Действие необратимо.",
                confirmLabel: "Пропустить стадию",
                tone: "danger",
                run: async () => {
                  await postCommand(cmdSkipStage());
                }
              })
            }
          >
            Пропустить стадию
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700"
            disabled={pending || !hasDevice}
            onClick={() =>
              requestConfirm({
                title: "Аварийный останов (E-STOP)?",
                description:
                  "Команда немедленного аварийного останова: устройство выключит нагрев и выходы. Используйте при опасности.",
                confirmLabel: "E-STOP",
                tone: "danger",
                run: async () => {
                  await postCommand(cmdEstop());
                }
              })
            }
          >
            E-STOP
          </Button>
        </div>

        {actionMsg ? <p className="mt-3 text-sm text-zinc-600">{actionMsg}</p> : null}
        {lastError && conn === "error" ? (
          <p className="mt-1 text-sm text-red-600">Телеметрия: {lastError}</p>
        ) : null}
        {(isStale || conn === "offline") && hasDevice ? (
          <p className="mt-1 text-sm text-amber-700">
            Нет свежей телеметрии — управление заблокировано до восстановления связи.
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
