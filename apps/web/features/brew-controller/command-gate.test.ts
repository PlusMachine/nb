import { describe, expect, it } from "vitest";

import {
  cmdEstop,
  cmdPause,
  cmdResume,
  cmdStop,
  cmdSkipStage,
  cmdClearFault,
  cmdStartBrew,
  cmdStartAutotune,
  cmdManualHeat,
  cmdManualPwm,
  cmdManualPump,
  cmdSelectRecipe,
  type Command,
} from "@nb/brewforge-protocol";

import {
  classifyCommand,
  commandRequiresFreshTelemetry,
  commandRequiresLease,
} from "./command-gate";

describe("classifyCommand — freshness-гейт (граница безопасности)", () => {
  it("fail-safe команды всегда проходят (always)", () => {
    const alwaysCmds: Command[] = [
      cmdEstop(),
      cmdStop(),
      cmdPause(),
      cmdResume(),
      cmdSkipStage(),
      cmdClearFault(),
      cmdSelectRecipe(2),
      cmdManualPump(true),
      cmdManualHeat(false), // выключение нагрева — снижает энергию
      cmdManualPwm(0), // ШИМ вниз до нуля
    ];
    for (const cmd of alwaysCmds) {
      expect(classifyCommand(cmd), cmd.type).toBe("always");
      expect(commandRequiresFreshTelemetry(cmd)).toBe(false);
    }
  });

  it("энергоподнимающие/запускающие команды требуют свежести (fresh-required)", () => {
    const dangerous: Command[] = [
      cmdStartBrew(0),
      cmdStartAutotune(),
      cmdManualHeat(true), // включение нагрева
      cmdManualPwm(60), // подъём мощности
    ];
    for (const cmd of dangerous) {
      expect(classifyCommand(cmd), cmd.type).toBe("fresh-required");
      expect(commandRequiresFreshTelemetry(cmd)).toBe(true);
    }
  });

  it("MANUAL_HEAT: on — опасно, off — fail-safe", () => {
    expect(classifyCommand(cmdManualHeat(true))).toBe("fresh-required");
    expect(classifyCommand(cmdManualHeat(false))).toBe("always");
  });

  it("MANUAL_PWM: положительный — опасно, 0 — fail-safe", () => {
    expect(classifyCommand(cmdManualPwm(1))).toBe("fresh-required");
    expect(classifyCommand(cmdManualPwm(0))).toBe("always");
  });
});

describe("commandRequiresLease — single-writer гейт", () => {
  it("fail-safe команды НЕ требуют аренды (любой может обезопасить)", () => {
    expect(commandRequiresLease(cmdEstop())).toBe(false);
    expect(commandRequiresLease(cmdStop())).toBe(false);
    expect(commandRequiresLease(cmdClearFault())).toBe(false);
    expect(commandRequiresLease(cmdManualPwm(0))).toBe(false); // ШИМ вниз
  });

  it("управляющие команды требуют аренды", () => {
    expect(commandRequiresLease(cmdPause())).toBe(true);
    expect(commandRequiresLease(cmdResume())).toBe(true);
    expect(commandRequiresLease(cmdSkipStage())).toBe(true);
    expect(commandRequiresLease(cmdSelectRecipe(1))).toBe(true);
    expect(commandRequiresLease(cmdStartBrew(0))).toBe(true);
    expect(commandRequiresLease(cmdManualHeat(true))).toBe(true);
    expect(commandRequiresLease(cmdManualPwm(60))).toBe(true); // ШИМ вверх
  });
});
