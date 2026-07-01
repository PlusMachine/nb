// =============================================================================
//  features/brew-controller/faults.ts
//  Единый источник метаданных аварий (bf_fault_t): приоритет по риску + «что
//  произошло / что делать». Общий для AlarmsPanel (пульт/дашборд) и плиток L1
//  командного центра — чтобы приоритеты/тексты не расходились между поверхностями.
//
//  Авторитет по факту аварии — faultMask устройства (decodeFaults из протокола);
//  этот модуль лишь классифицирует и описывает.
// =============================================================================
import { decodeFaults, type Fault } from "@nb/brewforge-protocol";

export type FaultPriority = "critical" | "high" | "medium";

export type FaultMeta = { priority: FaultPriority; title: string; cause: string; action: string };

// Приоритет по риску + человекочитаемое «что произошло / что делать».
export const FAULT_META: Record<Fault, FaultMeta> = {
  ESTOP: {
    priority: "critical",
    title: "Аварийный останов (E-stop)",
    cause: "Активирован аварийный останов.",
    action: "Устраните опасность, затем сбросьте аварию.",
  },
  OVERHEAT_ABS: {
    priority: "critical",
    title: "Перегрев: абсолютный предел",
    cause: "Температура превысила абсолютный потолок.",
    action: "Дайте остыть, проверьте датчик и ТЭН, затем сбросьте.",
  },
  FLOAT_DRY: {
    priority: "critical",
    title: "Сухой ход",
    cause: "Поплавок сигнализирует отсутствие жидкости.",
    action: "Долейте воду/сусло — не грейте всухую.",
  },
  WATCHDOG: {
    priority: "critical",
    title: "Сторожевой таймер",
    cause: "Контроллер перезапустился по watchdog.",
    action: "Проверьте состояние пивоварни и связь, затем сбросьте.",
  },
  OVERHEAT_REL: {
    priority: "high",
    title: "Перегрев: относительный",
    cause: "Перегрев относительно уставки выше допустимого.",
    action: "Снизьте мощность, дайте температуре стабилизироваться.",
  },
  DT_DT: {
    priority: "high",
    title: "Резкий скачок температуры",
    cause: "Слишком быстрый рост температуры (dT/dt).",
    action: "Проверьте датчик и перемешивание, снизьте мощность.",
  },
  SENSOR: {
    priority: "high",
    title: "Отказ датчика",
    cause: "Показание датчика вне диапазона или не прошло проверку.",
    action: "Проверьте подключение датчика, затем сбросьте.",
  },
  NO_FLOW: {
    priority: "high",
    title: "Нет рециркуляции",
    cause: "Косвенный нагрев (HERMS/RIMS) без потока жидкости.",
    action: "Проверьте насос и засоры, восстановите поток.",
  },
  STAGE_TO: {
    priority: "medium",
    title: "Таймаут стадии",
    cause: "Стадия не завершилась за отведённое время.",
    action: "Проверьте нагрев и датчик; продолжите вручную или сбросьте.",
  },
};

export const PRIORITY_WEIGHT: Record<FaultPriority, number> = { critical: 0, high: 1, medium: 2 };

/** Активные аварии из маски, отсортированные по приоритету (critical → medium). */
export function sortActiveFaults(faultMask: number): Fault[] {
  return decodeFaults(faultMask).sort(
    (a, b) => PRIORITY_WEIGHT[FAULT_META[a].priority] - PRIORITY_WEIGHT[FAULT_META[b].priority],
  );
}

/** Свод по маске аварий: число активных + наивысший приоритет (для плиток/бейджей). */
export function summarizeFaults(faultMask: number): { count: number; top: FaultPriority | null } {
  const active = decodeFaults(faultMask);
  if (active.length === 0) return { count: 0, top: null };
  let top: FaultPriority = "medium";
  for (const f of active) {
    if (PRIORITY_WEIGHT[FAULT_META[f].priority] < PRIORITY_WEIGHT[top]) {
      top = FAULT_META[f].priority;
    }
  }
  return { count: active.length, top };
}
