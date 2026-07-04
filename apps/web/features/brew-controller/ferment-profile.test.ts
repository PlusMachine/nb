import { describe, expect, it } from "vitest";

import type { FermentStep } from "@nb/brewforge-protocol";

import {
  MAX_FERMENT_STEPS,
  activeFermentSteps,
  buildFermentProgress,
  formatStepDurationDays,
  mapFermentationPlanToDeviceSteps,
  resolveStepLabels,
  stepsMatchPlan,
  type MappedFermentStep,
} from "./ferment-profile";

describe("mapFermentationPlanToDeviceSteps", () => {
  it("план нечитаем (не объект) → честная ошибка", () => {
    expect(mapFermentationPlanToDeviceSteps(null)).toEqual({ ok: false, error: expect.any(String) });
    expect(mapFermentationPlanToDeviceSteps(undefined)).toEqual({ ok: false, error: expect.any(String) });
    expect(mapFermentationPlanToDeviceSteps("nope")).toEqual({ ok: false, error: expect.any(String) });
  });

  it("нет температуры главного брожения → честная ошибка (нечего мапить)", () => {
    const result = mapFermentationPlanToDeviceSteps({ primaryTemperatureC: null, primaryDurationDays: 10 });
    expect(result.ok).toBe(false);
  });

  it("только главное брожение: дни×24 в часы", () => {
    const result = mapFermentationPlanToDeviceSteps({ primaryTemperatureC: 19, primaryDurationDays: 10 });
    expect(result).toEqual({
      ok: true,
      steps: [{ name: "Главное брожение", tempC: 19, hours: 240 }],
    });
  });

  it("нет primaryDurationDays → hours=0 (держать вручную)", () => {
    const result = mapFermentationPlanToDeviceSteps({ primaryTemperatureC: 19, primaryDurationDays: null });
    expect(result).toEqual({ ok: true, steps: [{ name: "Главное брожение", tempC: 19, hours: 0 }] });
  });

  it("extraSteps: с температурой попадают в маппинг, без температуры пропускаются", () => {
    const result = mapFermentationPlanToDeviceSteps({
      primaryTemperatureC: 19,
      primaryDurationDays: 10,
      extraSteps: [
        { id: "a", name: "Диацетильная пауза", temperatureC: 20, durationDays: 2 },
        { id: "b", name: "Без температуры", durationDays: 3 },
      ],
    });
    expect(result).toEqual({
      ok: true,
      steps: [
        { name: "Главное брожение", tempC: 19, hours: 240 },
        { name: "Диацетильная пауза", tempC: 20, hours: 48 },
      ],
    });
  });

  it("extraStep без имени получает дефолтное «Шаг N»", () => {
    const result = mapFermentationPlanToDeviceSteps({
      primaryTemperatureC: 19,
      primaryDurationDays: 10,
      extraSteps: [{ temperatureC: 20, durationDays: 2 }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.steps[1]!.name).toBe("Шаг 1");
    }
  });

  it("coldCrash.enabled=true добавляет «Холодная выдержка»", () => {
    const result = mapFermentationPlanToDeviceSteps({
      primaryTemperatureC: 19,
      primaryDurationDays: 10,
      coldCrash: { enabled: true, temperatureC: 2, durationDays: 3 },
    });
    expect(result).toEqual({
      ok: true,
      steps: [
        { name: "Главное брожение", tempC: 19, hours: 240 },
        { name: "Холодная выдержка", tempC: 2, hours: 72 },
      ],
    });
  });

  it("coldCrash.enabled=false — не добавляется", () => {
    const result = mapFermentationPlanToDeviceSteps({
      primaryTemperatureC: 19,
      primaryDurationDays: 10,
      coldCrash: { enabled: false, temperatureC: 2, durationDays: 3 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.steps).toHaveLength(1);
  });

  it("conditioning НЕ грузится, даже если enabled=true (после розлива)", () => {
    const result = mapFermentationPlanToDeviceSteps({
      primaryTemperatureC: 19,
      primaryDurationDays: 10,
      conditioning: { enabled: true, temperatureC: 12, durationDays: 14 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.steps).toHaveLength(1);
  });

  it("больше 6 ступеней → честная ошибка, не обрезка", () => {
    const extraSteps = Array.from({ length: MAX_FERMENT_STEPS }, (_, i) => ({
      name: `Доп. ${i}`,
      temperatureC: 18 + i,
      durationDays: 1,
    }));
    const result = mapFermentationPlanToDeviceSteps({
      primaryTemperatureC: 19,
      primaryDurationDays: 10,
      extraSteps,
    });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("6 ступеней") });
  });

  it("ровно 6 ступеней — ok", () => {
    const extraSteps = Array.from({ length: MAX_FERMENT_STEPS - 1 }, (_, i) => ({
      name: `Доп. ${i}`,
      temperatureC: 18 + i,
      durationDays: 1,
    }));
    const result = mapFermentationPlanToDeviceSteps({
      primaryTemperatureC: 19,
      primaryDurationDays: 10,
      extraSteps,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.steps).toHaveLength(MAX_FERMENT_STEPS);
  });
});

describe("stepsMatchPlan", () => {
  const plan: MappedFermentStep[] = [
    { name: "Главное брожение", tempC: 19, hours: 240 },
    { name: "Холодная выдержка", tempC: 2, hours: 72 },
  ];

  it("совпадает число ступеней и температуры в допуске 0.25° → true", () => {
    const device: FermentStep[] = [
      { tempC: 19.2, hours: 240 },
      { tempC: 1.8, hours: 72 },
    ];
    expect(stepsMatchPlan(device, plan)).toBe(true);
  });

  it("разное число ступеней → false", () => {
    expect(stepsMatchPlan([{ tempC: 19, hours: 240 }], plan)).toBe(false);
  });

  it("температура за пределами допуска → false", () => {
    const device: FermentStep[] = [
      { tempC: 19.5, hours: 240 },
      { tempC: 2, hours: 72 },
    ];
    expect(stepsMatchPlan(device, plan)).toBe(false);
  });

  it("пустые ступени прибора → false (нечего сопоставлять)", () => {
    expect(stepsMatchPlan([], [])).toBe(false);
  });
});

describe("resolveStepLabels", () => {
  const device: FermentStep[] = [
    { tempC: 19, hours: 240 },
    { tempC: 2, hours: 72 },
  ];
  const plan: MappedFermentStep[] = [
    { name: "Главное брожение", tempC: 19, hours: 240 },
    { name: "Холодная выдержка", tempC: 2, hours: 72 },
  ];

  it("план опознан → имена плана", () => {
    expect(resolveStepLabels(device, plan)).toEqual(["Главное брожение", "Холодная выдержка"]);
  });

  it("план не передан → «Ступень N»", () => {
    expect(resolveStepLabels(device)).toEqual(["Ступень 1", "Ступень 2"]);
  });

  it("план не совпадает → «Ступень N», не гадаем", () => {
    const mismatched: MappedFermentStep[] = [{ name: "Другое", tempC: 30, hours: 100 }];
    expect(resolveStepLabels(device, mismatched)).toEqual(["Ступень 1", "Ступень 2"]);
  });
});

describe("buildFermentProgress", () => {
  const steps: FermentStep[] = [
    { tempC: 19, hours: 168 }, // 7 дн
    { tempC: 20, hours: 48 }, // 2 дн
    { tempC: 2, hours: 0 }, // держать вручную
  ];

  it("нет ступеней → пустой прогресс", () => {
    expect(buildFermentProgress({ steps: [], currentIndex: 0, elapsedSec: 0 })).toEqual({
      steps: [],
      current: null,
      next: null,
      dayLabel: null,
    });
  });

  it("currentIndex=null → все ступени future, текущей/следующей нет", () => {
    const progress = buildFermentProgress({ steps, currentIndex: null, elapsedSec: 0 });
    expect(progress.steps.every((s) => s.state === "future")).toBe(true);
    expect(progress.current).toBeNull();
    expect(progress.next).toBeNull();
    expect(progress.dayLabel).toBeNull();
  });

  it("currentIndex вне диапазона (-1, за пределами) трактуется как «нет текущей»", () => {
    expect(buildFermentProgress({ steps, currentIndex: -1, elapsedSec: 0 }).current).toBeNull();
    expect(buildFermentProgress({ steps, currentIndex: 99, elapsedSec: 0 }).current).toBeNull();
  });

  it("done/current/future расставлены по индексу", () => {
    const progress = buildFermentProgress({ steps, currentIndex: 1, elapsedSec: 0 });
    expect(progress.steps.map((s) => s.state)).toEqual(["done", "current", "future"]);
    expect(progress.current?.index).toBe(1);
    expect(progress.next?.index).toBe(2);
  });

  it("последняя ступень текущая → next=null", () => {
    const progress = buildFermentProgress({ steps, currentIndex: 2, elapsedSec: 0 });
    expect(progress.current?.index).toBe(2);
    expect(progress.next).toBeNull();
  });

  it("«день N из M»: elapsed 3 полных дня на 7-дневной ступени → день 4 из 7", () => {
    const progress = buildFermentProgress({ steps, currentIndex: 0, elapsedSec: 3 * 86_400 + 3600 });
    expect(progress.dayLabel).toBe("день 4 из 7");
  });

  it("день не превышает M даже при переработке (устройство не перешло само)", () => {
    const progress = buildFermentProgress({ steps, currentIndex: 0, elapsedSec: 30 * 86_400 });
    expect(progress.dayLabel).toBe("день 7 из 7");
  });

  it("hours=0 (держать вручную) → dayLabel без счётчика дней", () => {
    const progress = buildFermentProgress({ steps, currentIndex: 2, elapsedSec: 5 * 86_400 });
    expect(progress.dayLabel).toBe("держится вручную");
  });

  it("подписи ступеней берутся из плана, когда он опознан", () => {
    const planSteps: MappedFermentStep[] = [
      { name: "Главное брожение", tempC: 19, hours: 168 },
      { name: "Диацетильная пауза", tempC: 20, hours: 48 },
      { name: "Холодная выдержка", tempC: 2, hours: 0 },
    ];
    const progress = buildFermentProgress({ steps, currentIndex: 0, elapsedSec: 0, planSteps });
    expect(progress.steps.map((s) => s.label)).toEqual([
      "Главное брожение",
      "Диацетильная пауза",
      "Холодная выдержка",
    ]);
  });
});

describe("formatStepDurationDays", () => {
  it("168 часов → «7 дн»", () => {
    expect(formatStepDurationDays(168)).toBe("7 дн");
  });

  it("36 часов → «1.5 дн»", () => {
    expect(formatStepDurationDays(36)).toBe("1.5 дн");
  });

  it("0 часов → «до ручного перехода»", () => {
    expect(formatStepDurationDays(0)).toBe("до ручного перехода");
  });
});

describe("activeFermentSteps", () => {
  // Прибор всегда шлёт фиксированный 6-слотовый steps[] (§13) — nSteps режет
  // «хвост» заполнителя. Пульт обязан резать так же, иначе список/график и
  // «изменить уставку» видят/пишут фантомные ступени за пределами nSteps.
  const sixSlots: FermentStep[] = [
    { tempC: 18, hours: 168 },
    { tempC: 20, hours: 48 },
    { tempC: 2, hours: 0 },
    { tempC: 2, hours: 0 },
    { tempC: 2, hours: 0 },
    { tempC: 2, hours: 0 },
  ];

  it("режет по nSteps, отбрасывая слоты-заполнители", () => {
    expect(activeFermentSteps({ steps: sixSlots, nSteps: 3 })).toEqual(sixSlots.slice(0, 3));
  });

  it("nSteps=6 — весь массив активен", () => {
    expect(activeFermentSteps({ steps: sixSlots, nSteps: 6 })).toEqual(sixSlots);
  });

  it("nSteps больше длины массива — не выходит за границы", () => {
    expect(activeFermentSteps({ steps: sixSlots.slice(0, 2), nSteps: 6 })).toEqual(sixSlots.slice(0, 2));
  });
});
