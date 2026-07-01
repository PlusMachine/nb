// =============================================================================
//  features/brew-controller/command-gate.ts
//  Серверная классификация команд по свежести телеметрии — граница безопасности
//  «варки откуда угодно» (см. docs/brewery-command-center.md §«Серверный
//  freshness-гейт»). Клиентский controlsDisabled — только UX-подсказка; настоящая
//  граница здесь: роут команд САМ отклоняет опасные команды при stale-телеметрии.
//
//  Политика (fail-safe):
//   - "always"          — исполняем ВСЕГДА, даже при stale/offline. Это команды,
//     которые делают систему БЕЗОПАСНЕЕ или снижают энергию: ESTOP, graceful STOP,
//     PAUSE, RESUME(*), SKIP_STAGE, ACK_PROMPT, CLEAR_FAULT, EXIT_MANUAL,
//     SELECT_RECIPE, SAVE_SETTINGS, MANUAL_PUMP, MANUAL_SETPOINT, MANUAL_HEAT(off),
//     MANUAL_PWM-вниз. Блокировать их при потере связи было бы ОПАСНО.
//   - "fresh-required"  — команды, поднимающие энергию/запускающие процесс:
//     START_BREW, START_AUTOTUNE, MANUAL_HEAT(on), MANUAL_PWM-вверх. Требуют свежей
//     телеметрии (иначе оператор рулит вслепую) → при stale роут отвечает 409.
//
//  (*) RESUME снимает паузу и может возобновить нагрев, но не поднимает мощность
//  сверх уже настроенного профиля варки и осмыслен лишь для идущей (значит, недавно
//  живой) варки — классифицируем как always, чтобы пауза/резюм были симметрично
//  доступны. Реальный потолок нагрева всё равно держат интерлоки §5 на плате.
// =============================================================================
import type { Command } from "@nb/brewforge-protocol";

export type CommandGateClass = "always" | "fresh-required";

/**
 * Классифицировать команду. Возвращает "fresh-required" для команд, поднимающих
 * энергию/запускающих процесс — их роут пропускает лишь при свежей телеметрии.
 */
export function classifyCommand(command: Command): CommandGateClass {
  switch (command.type) {
    case "START_BREW":
    case "START_AUTOTUNE":
      return "fresh-required";
    case "MANUAL_HEAT":
      // Включение ручного нагрева — опасно; выключение (b=false) — fail-safe.
      return command.arg?.b === true ? "fresh-required" : "always";
    case "MANUAL_PWM": {
      // Подъём мощности — опасно; снижение (или 0) — fail-safe. Без текущего PWM
      // (control-lease — Phase 2) считаем «подъёмом» любой положительный ШИМ.
      const pct = command.arg?.i ?? 0;
      return pct > 0 ? "fresh-required" : "always";
    }
    default:
      // PAUSE/RESUME/STOP/SKIP_STAGE/ACK_PROMPT/ESTOP/CLEAR_FAULT/EXIT_MANUAL/
      // SELECT_RECIPE/MANUAL_PUMP/MANUAL_SETPOINT/SAVE_SETTINGS — всегда.
      return "always";
  }
}

/** Требует ли команда свежей телеметрии (удобная обёртка над classifyCommand). */
export function commandRequiresFreshTelemetry(command: Command): boolean {
  return classifyCommand(command) === "fresh-required";
}

// =============================================================================
//  Lease-гейт (Phase 2): single-writer — управляющие команды требуют валидной
//  control-lease у отправителя. ИСКЛЮЧЕНИЯ (fail-safe, разрешены БЕЗ аренды, чтобы
//  любой мог остановить/обезопасить пивоварню): ESTOP, graceful STOP, CLEAR_FAULT,
//  MANUAL_PWM-вниз (снижение мощности/ноль). Всё прочее (PAUSE/RESUME/SKIP/
//  ACK_PROMPT/SELECT_RECIPE/START_BREW/AUTOTUNE/MANUAL_HEAT/MANUAL_SETPOINT/
//  MANUAL_PWM-вверх/…) — только у держателя аренды.
// =============================================================================
export function commandRequiresLease(command: Command): boolean {
  switch (command.type) {
    case "ESTOP":
    case "STOP":
    case "CLEAR_FAULT":
      return false; // safety — всегда, даже без аренды
    case "MANUAL_PWM":
      // Снижение мощности/ноль — fail-safe (без аренды); подъём — требует аренды.
      return (command.arg?.i ?? 0) > 0;
    default:
      return true;
  }
}
