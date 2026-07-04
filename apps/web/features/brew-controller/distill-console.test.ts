import { describe, expect, it } from "vitest";

import { STAGE_NUM, type Stage } from "@nb/brewforge-protocol";

import {
  columnSensorStorageKey,
  fractionElapsedLabel,
  isDistillFractionStage,
  isDistillRunning,
  isValidColumnSensorIndex,
  nextFractionConfirmDescription,
  nextFractionConfirmTitle,
  parseColumnSensorIndex,
  resolveColumnReading,
  resolveColumnSensorIndex,
} from "./distill-console";

describe("columnSensorStorageKey", () => {
  it("собирает per-device ключ", () => {
    expect(columnSensorStorageKey("dev-1")).toBe("nb_distill_column_sensor_dev-1");
    expect(columnSensorStorageKey("dev-2")).toBe("nb_distill_column_sensor_dev-2");
  });
});

describe("parseColumnSensorIndex", () => {
  it("null → null (не задан)", () => {
    expect(parseColumnSensorIndex(null)).toBeNull();
  });

  it("валидное целое ≥0 → индекс", () => {
    expect(parseColumnSensorIndex("0")).toBe(0);
    expect(parseColumnSensorIndex("3")).toBe(3);
  });

  it("битое значение → null (не бросает)", () => {
    expect(parseColumnSensorIndex("не число")).toBeNull();
    expect(parseColumnSensorIndex("")).toBeNull();
    expect(parseColumnSensorIndex("-1")).toBeNull();
    expect(parseColumnSensorIndex("1.5")).toBeNull();
  });
});

describe("isValidColumnSensorIndex", () => {
  it("индекс присутствует в sensors[] → true", () => {
    expect(isValidColumnSensorIndex([{ i: 0 }, { i: 2 }], 2)).toBe(true);
  });

  it("индекса нет (устройство сменило состав датчиков) → false", () => {
    expect(isValidColumnSensorIndex([{ i: 0 }, { i: 2 }], 1)).toBe(false);
    expect(isValidColumnSensorIndex([], 0)).toBe(false);
  });
});

describe("resolveColumnSensorIndex", () => {
  const sensors = [{ i: 0 }, { i: 1 }];

  it("не задан → null", () => {
    expect(resolveColumnSensorIndex(null, sensors)).toBeNull();
  });

  it("задан и валиден → индекс", () => {
    expect(resolveColumnSensorIndex("1", sensors)).toBe(1);
  });

  it("задан, но такого датчика больше нет → null (не выдумываем)", () => {
    expect(resolveColumnSensorIndex("5", sensors)).toBeNull();
  });
});

describe("resolveColumnReading", () => {
  const sensors = [
    { i: 0, c: 84.2, valid: true },
    { i: 1, c: 78.1, valid: false },
  ];

  it("индекс не назначен (null) → null", () => {
    expect(resolveColumnReading(sensors, null)).toBeNull();
  });

  it("sensors отсутствует в кадре → null", () => {
    expect(resolveColumnReading(undefined, 0)).toBeNull();
  });

  it("назначенный датчик найден → показание (в т.ч. невалидное — герой решает сам)", () => {
    expect(resolveColumnReading(sensors, 0)).toEqual({ c: 84.2, valid: true });
    expect(resolveColumnReading(sensors, 1)).toEqual({ c: 78.1, valid: false });
  });

  it("назначенного индекса нет среди датчиков кадра → null", () => {
    expect(resolveColumnReading(sensors, 9)).toBeNull();
  });
});

describe("isDistillFractionStage", () => {
  it("PREHEAT/HEADS/HEARTS/TAILS → true", () => {
    const stages: Stage[] = ["DISTILL_PREHEAT", "DISTILL_HEADS", "DISTILL_HEARTS", "DISTILL_TAILS"];
    for (const s of stages) expect(isDistillFractionStage(s)).toBe(true);
  });

  it("прочие стадии/null/undefined → false", () => {
    expect(isDistillFractionStage("DONE")).toBe(false);
    expect(isDistillFractionStage("IDLE")).toBe(false);
    expect(isDistillFractionStage("MASH_STEP")).toBe(false);
    expect(isDistillFractionStage("FERMENT")).toBe(false);
    expect(isDistillFractionStage(null)).toBe(false);
    expect(isDistillFractionStage(undefined)).toBe(false);
  });
});

describe("isDistillRunning", () => {
  it("нет телеметрии → false", () => {
    expect(isDistillRunning(null)).toBe(false);
  });

  it("running-фракции → true", () => {
    const stages: Stage[] = ["DISTILL_PREHEAT", "DISTILL_HEADS", "DISTILL_HEARTS", "DISTILL_TAILS"];
    for (const stageName of stages) {
      expect(isDistillRunning({ stageName, pausedFrom: STAGE_NUM.IDLE })).toBe(true);
    }
  });

  it("IDLE (идле-дистиллятор, appMode=distill в конфиге) → false — остаётся на LiveDashboardView", () => {
    expect(isDistillRunning({ stageName: "IDLE", pausedFrom: STAGE_NUM.IDLE })).toBe(false);
  });

  it("DONE (перегон завершён) → false", () => {
    expect(isDistillRunning({ stageName: "DONE", pausedFrom: STAGE_NUM.IDLE })).toBe(false);
  });

  it("PAUSED с pausedFrom из дистилляции → true (пауза перегона не выкидывает с дашборда)", () => {
    expect(isDistillRunning({ stageName: "PAUSED", pausedFrom: STAGE_NUM.DISTILL_HEARTS })).toBe(true);
  });

  it("FAULT с pausedFrom из дистилляции → true", () => {
    expect(isDistillRunning({ stageName: "FAULT", pausedFrom: STAGE_NUM.DISTILL_TAILS })).toBe(true);
  });

  it("PAUSED/FAULT из варочной стадии → false (не перегон)", () => {
    expect(isDistillRunning({ stageName: "PAUSED", pausedFrom: STAGE_NUM.BOILING })).toBe(false);
    expect(isDistillRunning({ stageName: "FAULT", pausedFrom: STAGE_NUM.MASH_STEP })).toBe(false);
  });

  it("варочные/ферментационные running-стадии → false", () => {
    expect(isDistillRunning({ stageName: "BOILING", pausedFrom: STAGE_NUM.IDLE })).toBe(false);
    expect(isDistillRunning({ stageName: "FERMENT", pausedFrom: STAGE_NUM.IDLE })).toBe(false);
  });
});

describe("nextFractionConfirmTitle", () => {
  it("динамический текст по текущей фракции (bf_process.c:607-619)", () => {
    expect(nextFractionConfirmTitle("DISTILL_PREHEAT")).toBe("Завершить разогрев и начать отбор голов?");
    expect(nextFractionConfirmTitle("DISTILL_HEADS")).toBe("Завершить отбор голов и начать отбор тела?");
    expect(nextFractionConfirmTitle("DISTILL_HEARTS")).toBe("Завершить отбор тела и начать отбор хвостов?");
    expect(nextFractionConfirmTitle("DISTILL_TAILS")).toBe("Завершить отбор хвостов и перегон?");
  });

  it("вне фракционных стадий → null (кнопка не показывается)", () => {
    expect(nextFractionConfirmTitle("DONE")).toBeNull();
    expect(nextFractionConfirmTitle("IDLE")).toBeNull();
    expect(nextFractionConfirmTitle(null)).toBeNull();
  });
});

describe("nextFractionConfirmDescription", () => {
  it("TAILS особая — перегон завершится, нагрев выключится", () => {
    expect(nextFractionConfirmDescription("DISTILL_TAILS")).toBe("Устройство завершит перегон и выключит нагрев.");
  });

  it("остальные фракции — нагрев не прерывается", () => {
    expect(nextFractionConfirmDescription("DISTILL_PREHEAT")).toBe(
      "Устройство сразу переключит контур на следующую фракцию — нагрев не прерывается.",
    );
    expect(nextFractionConfirmDescription("DISTILL_HEADS")).toBe(
      "Устройство сразу переключит контур на следующую фракцию — нагрев не прерывается.",
    );
  });
});

describe("fractionElapsedLabel", () => {
  it("PREHEAT формулирует как «разогрев идёт»", () => {
    expect(fractionElapsedLabel("DISTILL_PREHEAT", 102)).toBe("разогрев идёт 1:42");
  });

  it("HEADS/HEARTS/TAILS формулируют как «отбор идёт»", () => {
    expect(fractionElapsedLabel("DISTILL_HEADS", 5)).toBe("отбор идёт 0:05");
    expect(fractionElapsedLabel("DISTILL_HEARTS", 65)).toBe("отбор идёт 1:05");
    expect(fractionElapsedLabel("DISTILL_TAILS", 3600)).toBe("отбор идёт 60:00");
  });

  it("вне фракционных стадий → null", () => {
    expect(fractionElapsedLabel("DONE", 10)).toBeNull();
    expect(fractionElapsedLabel(null, 10)).toBeNull();
  });

  it("отрицательный/дробный остаток не роняет форматирование", () => {
    expect(fractionElapsedLabel("DISTILL_HEADS", -5)).toBe("отбор идёт 0:00");
    expect(fractionElapsedLabel("DISTILL_HEADS", 90.9)).toBe("отбор идёт 1:30");
  });
});
