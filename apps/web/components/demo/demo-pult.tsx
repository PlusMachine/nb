"use client";

// =============================================================================
//  components/demo/demo-pult.tsx
//  Секция 3b «Автоматика» (docs/demo-page.md §2.3b) — живой пульт NB поверх
//  клиентской симуляции. Это настоящий LiveDashboardView, тот же компонент, что
//  показывает варку с настоящего контроллера, — только stream/command здесь
//  кормятся не SSE/fetch, а SimDevice из @nb/brewforge-sim, целиком в браузере
//  посетителя (свой изолированный инстанс на вкладку, без разделяемого состояния
//  и без сети). Тёмная обвязка блока, заголовок и строка-факт — в page.tsx.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from "react";

import { SimDevice } from "@nb/brewforge-sim";
import {
  PROMPT_NUM,
  PROTOCOL_SCHEMA_VERSION,
  cmdAck,
  cmdStartBrew,
  promptName,
  type Ack,
  type Command,
  type Prompt,
  type PromptAns
} from "@nb/brewforge-protocol";
import { useToast } from "@nb/ui";

import type { TelemetryHistoryPoint } from "@/features/brew-batches/contracts";
import { LiveDashboardView } from "@/features/brew-controller/components/live-dashboard-view";
import type { TelemetryStream } from "@/features/brew-controller/use-telemetry-stream";
import type { SendResult, PendingUndo, useDeviceCommand } from "@/features/brew-controller/use-device-command";
import type { LeaseStatus } from "@/features/brew-controller/control-lease";

// Ускорение времени симуляции: 1 реальная секунда = TICK_SCALE «варочных» секунд.
// Пауза Beta (45 мин) сменяется на Alpha (15 мин) через 2700 варочных секунд —
// при 20× это ~2 мин 15 с реального времени, посетитель успевает увидеть смену
// паузы затирания за отведённые спекой ~2-3 минуты просмотра.
const TICK_SCALE = 20;
const TICK_MS = 1000;
// Окно undo для SKIP_STAGE — паритет с UNDO_WINDOW_MS настоящего use-device-command.
const UNDO_WINDOW_MS = 5000;
// Демо-нянька: промпт живёт на экране столько секунд (посетитель может ответить
// кнопками пульта сам), после чего подтверждается «оператором»; доигранная до
// DONE варка перезапускается после короткой паузы.
const PROMPT_AUTOCONFIRM_MS = 6000;
const DONE_RESTART_MS = 8000;

// Сюжетный рецепт секции (docs/demo-page.md §1): тот же American IPA, что на
// карточках и складе. Загружается в симулятор честным путём прошивки —
// putRecipe() в слот + START_BREW, поэтому пульт показывает настоящее имя
// рецепта и обычный статус затирания, без dev-артефактов сценария "mash".
const DEMO_RECIPE = {
  schema: PROTOCOL_SCHEMA_VERSION,
  name: "American IPA",
  units: "C",
  mash: {
    doughInTempC: null,
    pidDuringDoughIn: true,
    steps: [{ name: "Осахаривание", tempC: 66, timeMin: 60 }],
    mashOut: { tempC: 78, timeMin: 10 }
  },
  boil: {
    boilTimeMin: 60,
    boilTempC: null,
    hops: [
      { name: "Magnum", amountG: 22, atMinBeforeEnd: 60 },
      { name: "Citra", amountG: 25, atMinBeforeEnd: 10 }
    ]
  },
  hopStand: [{ tempC: 80, timeMin: 20 }],
  whirlpool: "hot",
  cooling: { targetC: 20 }
};

// Положительный ответ на каждый промпт — как ответил бы оператор, который хочет
// продолжать варку (для авто-подтверждения няньки и прогрева).
const DEMO_PROMPT_ANSWERS: Record<Prompt, PromptAns | null> = {
  NONE: null,
  SPARGE_WATER: "YES",
  CONTINUE_DOUGH: "CONTINUE",
  ADD_MALT: "OK",
  IODINE: "CONTINUE",
  REMOVE_MALT: "OK",
  RESUME_BREW: "YES"
};

// Подтвердить активный промпт положительным ответом. true — промпт был и закрыт.
function ackActivePrompt(sim: SimDevice): boolean {
  const t = sim.snapshot();
  if (t.prompt === PROMPT_NUM.NONE) return false;
  const ans = DEMO_PROMPT_ANSWERS[promptName(t.prompt)] ?? "OK";
  sim.handleCommand(cmdAck(ans, t.promptSeq));
  return true;
}

// Прокрутить свежезапущенную варку до разгара паузы осахаривания: посетителю
// интересен работающий пульт, а не десять минут нагрева котла с холода.
// Стартовые промпты (засыпь и т.п.) подтверждаем по пути как оператор.
function warmUpToMashRest(sim: SimDevice): void {
  // До стадии паузы (DOUGH_IN → MASH_STEP). Страховка: если конечный автомат
  // ушёл дальше затирания (неожиданный рецепт/стадия) — не проматывать варку.
  for (let guard = 0; guard < 120; guard++) {
    if (ackActivePrompt(sim)) continue;
    const stage = sim.snapshot().stageName;
    if (stage !== "DOUGH_IN" && stage !== "IDLE") break;
    sim.warp(30);
  }
  // Дать температуре выйти на полку. Допуск 2 °C: тепловая модель симулятора
  // держит котёл чуть ниже уставки (~64.6 при 66), точного равенства не бывает.
  for (let guard = 0; guard < 60; guard++) {
    const t = sim.snapshot();
    if (t.stageName !== "MASH_STEP") break;
    if (t.primary.valid && t.primary.c >= t.setpointC - 2) break;
    sim.warp(30);
  }
  // …и ещё 10 варочных минут в глубь паузы — «разгар затирания», согласован
  // с профилем buildMashHistory (demo-data.ts), который кормит график пульта.
  if (sim.snapshot().stageName === "MASH_STEP") {
    sim.warp(10 * 60);
  }
}

// «Моя» аренда зафиксирована навсегда: у каждого посетителя свой изолированный
// SimDevice, конкурентных сеансов на демо не бывает, поэтому честно показываем
// «Вы управляете» без настоящего acquire/heartbeat по сети.
const DEMO_LEASE: LeaseStatus = {
  held: true,
  heldByMe: true,
  holderSessionId: "demo",
  expiresAt: null,
  takeoverRequested: false,
  takeoverByMe: false
};

/**
 * Команды/аренда пульта поверх локальной симуляции — контракт как у настоящего
 * useDeviceCommand (тот же тип возврата), но send() маршрутизирует не в fetch,
 * а в sim.handleCommand(): пауза/продолжить/пропустить/стоп/E-STOP реально
 * управляют симуляцией (docs/demo-page.md §2.3b). requestTakeover/release —
 * no-op: перехватывать управление не у кого.
 */
function useSimCommand(simRef: { current: SimDevice | null }): ReturnType<typeof useDeviceCommand> {
  const [pending, setPending] = useState(false);
  const [undo, setUndo] = useState<PendingUndo | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { show } = useToast();

  const send = useCallback(
    async (command: Command): Promise<SendResult> => {
      const sim = simRef.current;
      if (!sim) return { ok: false, error: "Симулятор ещё не готов", code: null };
      setPending(true);
      try {
        const ack: Ack = sim.handleCommand(command);
        if (!ack.ok) {
          return { ok: false, ack, error: `Устройство отклонило команду: ${ack.reason}`, code: ack.reason };
        }
        return { ok: true, ack, error: null };
      } finally {
        setPending(false);
      }
    },
    [simRef]
  );

  const clearUndoTimer = useCallback(() => {
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
  }, []);

  // SKIP_STAGE — отложенная отправка с окном отмены, паритет с настоящим хуком
  // (тост «Отменить» через @nb/ui, единственный на демо-странице интерактив).
  const scheduleUndoable = useCallback(
    (command: Command, opts: { label: string; onResult?: (r: SendResult) => void }) => {
      clearUndoTimer();
      const commit = () => {
        clearUndoTimer();
        setUndo(null);
        void send(command).then((r) => opts.onResult?.(r));
      };
      const cancel = () => {
        clearUndoTimer();
        setUndo(null);
      };
      setUndo({ label: opts.label, cancel, commitNow: commit });
      undoTimer.current = setTimeout(commit, UNDO_WINDOW_MS);
    },
    [send, clearUndoTimer]
  );

  useEffect(() => () => clearUndoTimer(), [clearUndoTimer]);

  useEffect(() => {
    if (!undo) return undefined;
    const toast = show({
      title: undo.label,
      action: { label: "Отменить", onClick: undo.cancel },
      durationMs: Infinity
    });
    return () => toast.dismiss();
  }, [undo, show]);

  const requestTakeover = useCallback(async () => {
    // Перехватывать не у кого — своя же изолированная симуляция.
  }, []);
  const release = useCallback(async () => {}, []);

  return {
    sessionId: "demo",
    lease: DEMO_LEASE,
    controlsHeld: true,
    pending,
    send,
    requestTakeover,
    release,
    scheduleUndoable,
    undo
  };
}

export function DemoPult({ initialHistory }: { initialHistory: TelemetryHistoryPoint[] }) {
  const simRef = useRef<SimDevice | null>(null);
  const [mounted, setMounted] = useState(false);
  // Управляемая история графика: статичный профиль-префикс (buildMashHistory) +
  // точки живой симуляции с каждым тиком. Без этого график застыл бы на паузе
  // затирания, пока герой уже показывает кипячение: серверному роуту истории
  // неоткуда знать состояние симуляции конкретного посетителя.
  const [liveHistory, setLiveHistory] = useState<TelemetryHistoryPoint[]>(initialHistory);
  const [stream, setStream] = useState<TelemetryStream>({
    telemetry: null,
    conn: "connecting",
    isStale: false,
    isLive: false,
    lastError: null,
    remaining: 0,
    lastFrameAt: null
  });

  const command = useSimCommand(simRef);

  useEffect(() => {
    // SimDevice создаётся лениво НА КЛИЕНТЕ (не при SSR) — до этого компонент
    // рендерит каркас-заглушку (см. ниже). Запуск — честным путём прошивки
    // (рецепт в слот + START_BREW, см. DEMO_RECIPE), затем прогрев до разгара
    // паузы осахаривания, чтобы первая же секунда на пульте была «рабочей».
    const sim = new SimDevice({
      deviceId: "demo",
      fw: "sim-demo",
      tickMs: TICK_MS,
      tickScale: TICK_SCALE,
      scenario: "idle"
    });
    const slot = sim.putRecipe(DEMO_RECIPE);
    sim.handleCommand(cmdStartBrew(slot));
    warmUpToMashRest(sim);
    simRef.current = sim;

    // Демо-нянька вместо sim.ensureDemoBrewing(): движковый вариант перезапускает
    // затирание при первом же промпте — посетитель, дождавшийся йодной пробы,
    // увидел бы телепорт варки в начало. Здесь промпт несколько секунд живёт на
    // экране (на него можно ответить кнопками пульта), после чего подтверждается
    // сам; доигранная до DONE варка перезапускается честным START_BREW. Явный
    // «Стоп»/E-STOP посетителя (IDLE/FAULT) не трогаем — его решение уважаем.
    let promptSeenAt: number | null = null;
    let doneSeenAt: number | null = null;
    // Аккумулятор истории графика: префикс — серверный buildMashHistory, дальше
    // точка на каждый тик. Кап по длине, чтобы вкладка-долгожитель не росла вечно.
    const history: TelemetryHistoryPoint[] = [...initialHistory];
    const HISTORY_CAP = 2400;

    const tick = () => {
      sim.advanceToNow();
      const state = sim.snapshot();

      if (state.prompt !== PROMPT_NUM.NONE) {
        if (promptSeenAt == null) {
          promptSeenAt = Date.now();
        } else if (Date.now() - promptSeenAt >= PROMPT_AUTOCONFIRM_MS) {
          ackActivePrompt(sim);
          promptSeenAt = null;
        }
      } else {
        promptSeenAt = null;
      }

      if (state.stageName === "DONE") {
        if (doneSeenAt == null) {
          doneSeenAt = Date.now();
        } else if (Date.now() - doneSeenAt >= DONE_RESTART_MS) {
          sim.handleCommand(cmdStartBrew(slot));
          warmUpToMashRest(sim);
          doneSeenAt = null;
        }
      } else {
        doneSeenAt = null;
      }

      const telemetry = sim.snapshot();
      history.push({
        ts: Date.now(),
        primaryC: telemetry.primary.valid ? telemetry.primary.c : null,
        setpointC: telemetry.setpointC,
        heatDutyPct: telemetry.heatDutyPct,
        stage: telemetry.stage
      });
      if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP);
      setLiveHistory([...history]);
      setStream({
        telemetry,
        conn: "online",
        isStale: false,
        isLive: true,
        lastError: null,
        remaining: telemetry.stageRemainingSec,
        lastFrameAt: Date.now()
      });
    };

    tick();
    setMounted(true);
    const id = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearInterval(id);
      simRef.current = null;
    };
    // initialHistory приходит с сервера один раз за жизнь страницы — эффект
    // сознательно одноразовый (перезапуск пересоздал бы симуляцию).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) {
    // Каркас-заглушка тех же габаритов, что и живой пульт (заголовок + герой +
    // график + транспорт), чтобы вёрстка не прыгала на mount.
    return (
      <div className="space-y-6">
        <span className="sr-only">Пульт загружается…</span>
        <div aria-hidden className="flex flex-wrap items-center justify-between gap-3">
          <div className="h-6 w-40 rounded-full bg-muted" />
          <div className="h-6 w-24 rounded-full bg-muted" />
        </div>
        <div aria-hidden className="h-40 rounded-2xl border border-border bg-card" />
        <div aria-hidden className="h-56 rounded-2xl border border-border bg-card" />
        <div aria-hidden className="h-20 rounded-2xl border border-border bg-card" />
      </div>
    );
  }

  return (
    <LiveDashboardView
      stream={stream}
      command={command}
      source={{ kind: "device", deviceId: "demo" }}
      initialHistory={initialHistory}
      liveHistory={liveHistory}
      hasDevice
      channel="demo"
      showInlineHeader
      deviceName="BrewForge #1 — гараж"
    />
  );
}
