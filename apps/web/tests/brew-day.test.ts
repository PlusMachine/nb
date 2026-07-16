import { describe, expect, it } from "vitest";

import {
  applyBrewDayStepPatch,
  brewDayActForStatus,
  buildBrewDaySteps,
  groupsForAct,
  normalizeBrewDayProgress,
  resolveBrewDayCursor,
  resolveLastDoneStep,
  stageToAct,
  summarizeBrewDayPlan,
  summarizeBrewDayProgress
} from "@/features/brew-batches/brew-day";
import { brewPlanSnapshotSchema, type BrewPlanSnapshot } from "@/features/brew-batches/contracts";

const makeSnapshot = (overrides: Partial<BrewPlanSnapshot> = {}): BrewPlanSnapshot => ({
  version: "brew_plan_v1",
  recipe: { id: "00000000-0000-4000-8000-000000000001", title: "Test", versionNumber: 1, batchSizeL: 20 },
  equipmentProfileSnapshot: null,
  waterPlanMeta: null,
  mashSteps: [
    { id: "m1", name: "Затирание", targetTemperatureC: 66, durationMinutes: 60 },
    { id: "m2", name: "Меш-аут", targetTemperatureC: 76, durationMinutes: 10 }
  ],
  boilPlan: {
    boilTimeMinutes: 60,
    timedAdditions: [
      { linePersistentKey: "h1", name: "Magnum", category: "hop", stage: "boil", timeOffsetMinutes: 60, amount: { quantity: 20, unit: "g" }, stepMeta: null },
      { linePersistentKey: "h2", name: "Cascade", category: "hop", stage: "boil", timeOffsetMinutes: 10, amount: { quantity: 30, unit: "g" }, stepMeta: null }
    ]
  },
  whirlpoolPlan: [
    { linePersistentKey: "w1", name: "Citra", category: "hop", stage: "whirlpool", timeOffsetMinutes: null, amount: { quantity: 40, unit: "g" }, stepMeta: { temperatureC: 80, timeMinutes: 20 } }
  ],
  dryHopPlan: [],
  fermentationPlan: { primaryTemperatureC: 19, primaryDurationDays: 14 },
  packagingPlan: null,
  packagingAdditions: [],
  grainBillTotalKg: null,
  waterSchedule: null,
  deviceHints: [],
  ...overrides
});

describe("buildBrewDaySteps", () => {
  it("groups steps by stage in canonical order", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    expect(groups.map((group) => group.stage)).toEqual(["mash", "boil", "whirlpool", "chill", "fermentation"]);
  });

  it("emits a synthetic chill step targeting the pitch temperature", () => {
    const chill = buildBrewDaySteps(makeSnapshot()).find((group) => group.stage === "chill")!;
    expect(chill.steps).toHaveLength(1);
    expect(chill.steps[0]).toMatchObject({ id: "chill:target", kind: "task", title: "Охладите сусло", temperatureC: 19 });
    expect(chill.steps[0].detail).toBe("до 19 °C");
  });

  it("falls back to a generic chill label when no pitch temperature is known", () => {
    const chill = buildBrewDaySteps(makeSnapshot({ fermentationPlan: null })).find((group) => group.stage === "chill")!;
    expect(chill.steps[0].detail).toBe("до температуры внесения дрожжей");
  });

  it("omits the chill group when nothing was heated (no boil / no whirlpool)", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      boilPlan: { boilTimeMinutes: 0, timedAdditions: [] },
      whirlpoolPlan: []
    }));
    expect(groups.some((group) => group.stage === "chill")).toBe(false);
  });

  it("tags boil additions with seconds-before-end for the live countdown", () => {
    const boil = buildBrewDaySteps(makeSnapshot()).find((group) => group.stage === "boil")!;
    // Magnum @60 → 3600s before end; Cascade @10 → 600s.
    expect(boil.steps.find((step) => step.id === "boil:add:h1")?.boilSecondsBeforeEnd).toBe(3600);
    expect(boil.steps.find((step) => step.id === "boil:add:h2")?.boilSecondsBeforeEnd).toBe(600);
  });

  it("emits mash rests as timer steps with stable ids and seconds", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    const mash = groups.find((group) => group.stage === "mash")!;
    const rest = mash.steps.find((step) => step.id === "mash:m1")!;
    expect(rest).toMatchObject({
      id: "mash:m1",
      kind: "timer",
      title: "Затирание",
      durationSeconds: 3600,
      temperatureC: 66
    });
    expect(rest.detail).toContain("66 °C");
    expect(rest.detail).toContain("1 ч");
  });

  it("orders boil additions earliest-first (largest minutes-before-end first) and adds a boil timer", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    const boil = groups.find((group) => group.stage === "boil")!;
    expect(boil.steps[0]).toMatchObject({ id: "boil:timer", kind: "timer", durationSeconds: 3600 });
    // Magnum @60 before Cascade @10.
    expect(boil.steps[1].id).toBe("boil:add:h1");
    expect(boil.steps[2].id).toBe("boil:add:h2");
    expect(boil.steps[1].detail).toContain("за 60 мин до конца");
    expect(boil.steps[2].detail).toContain("30 г");
  });

  it("reads whirlpool stand temp/time from stepMeta", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    const whirlpool = groups.find((group) => group.stage === "whirlpool")!;
    expect(whirlpool.steps[0]).toMatchObject({ id: "whirlpool:w1", kind: "timer", durationSeconds: 1200, temperatureC: 80 });
    expect(whirlpool.steps[0].detail).toContain("выдержка 80 °C");
  });

  it("formats amount units via the inventory short-label dictionary (kg/oz/lb/item/pack), falling back to the raw string for unrecognized units", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      whirlpoolPlan: [
        { linePersistentKey: "w-kg", name: "Зерно", category: "other", stage: "whirlpool", timeOffsetMinutes: null, amount: { quantity: 1.5, unit: "kg" }, stepMeta: null },
        { linePersistentKey: "w-oz", name: "Дуб. щепа", category: "other", stage: "whirlpool", timeOffsetMinutes: null, amount: { quantity: 2, unit: "oz" }, stepMeta: null },
        { linePersistentKey: "w-lb", name: "Сахар", category: "other", stage: "whirlpool", timeOffsetMinutes: null, amount: { quantity: 1, unit: "lb" }, stepMeta: null },
        { linePersistentKey: "w-item", name: "Таблетка", category: "other", stage: "whirlpool", timeOffsetMinutes: null, amount: { quantity: 3, unit: "item" }, stepMeta: null },
        { linePersistentKey: "w-pack", name: "Дрожжи", category: "other", stage: "whirlpool", timeOffsetMinutes: null, amount: { quantity: 1, unit: "pack" }, stepMeta: null },
        { linePersistentKey: "w-unknown", name: "Загадка", category: "other", stage: "whirlpool", timeOffsetMinutes: null, amount: { quantity: 5, unit: "foo" }, stepMeta: null }
      ]
    }));
    const whirlpool = groups.find((group) => group.stage === "whirlpool")!;
    const detailFor = (key: string) => whirlpool.steps.find((step) => step.id === `whirlpool:${key}`)?.detail;
    expect(detailFor("w-kg")).toContain("1.5 кг");
    expect(detailFor("w-oz")).toContain("2 унц.");
    expect(detailFor("w-lb")).toContain("1 фунт");
    expect(detailFor("w-item")).toContain("3 шт.");
    expect(detailFor("w-pack")).toContain("1 пачка");
    // Неопознанный unit (не из закрытого InventoryUnit enum) — fallback на сырую строку.
    expect(detailFor("w-unknown")).toContain("5 foo");
  });

  it("emits a fermentation task with target temp/duration", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    const ferment = groups.find((group) => group.stage === "fermentation")!;
    expect(ferment.steps[0]).toMatchObject({ id: "ferment:primary", kind: "task", temperatureC: 19 });
    expect(ferment.steps[0].detail).toContain("19 °C");
    expect(ferment.steps[0].detail).toContain("14 дн.");
  });

  it("adds dryHopPlan entries to the fermentation group after the primary task, with amount/days", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      dryHopPlan: [
        { linePersistentKey: "dh1", name: "Mosaic", category: "hop", stage: "fermentation", timeOffsetMinutes: null, amount: { quantity: 60, unit: "g" }, stepMeta: { useType: "dry_hop", durationDays: 4 } },
        { linePersistentKey: "dh2", name: "Дубовые чипсы", category: "other", stage: "fermentation", timeOffsetMinutes: null, amount: { quantity: 20, unit: "g" }, stepMeta: null }
      ]
    }));
    const fermentation = groups.find((group) => group.stage === "fermentation")!;
    expect(fermentation.steps[0].id).toBe("ferment:primary");
    expect(fermentation.steps[1]).toMatchObject({ id: "ferment:add:dh1", kind: "addition", title: "Сухое охмеление: Mosaic" });
    expect(fermentation.steps[1].detail).toContain("60 г");
    expect(fermentation.steps[1].detail).toContain("держать 4 дн.");
    // Не-хмелевая fermentation-добавка тоже долетает до гида.
    expect(fermentation.steps[2]).toMatchObject({ id: "ferment:add:dh2", kind: "addition", title: "Внести на брожении: Дубовые чипсы" });
  });

  it("tolerates a legacy snapshot with no dryHopPlan key at all (pre-migration data)", () => {
    const legacy = makeSnapshot();
    delete (legacy as Record<string, unknown>).dryHopPlan;
    expect(() => buildBrewDaySteps(legacy)).not.toThrow();
    const fermentation = buildBrewDaySteps(legacy).find((group) => group.stage === "fermentation")!;
    expect(fermentation.steps).toHaveLength(1);
    expect(fermentation.steps[0].id).toBe("ferment:primary");
  });

  it("adds cold crash / conditioning steps only when explicitly enabled in the fermentation profile", () => {
    const enabled = buildBrewDaySteps(makeSnapshot({
      fermentationPlan: {
        primaryTemperatureC: 19,
        primaryDurationDays: 14,
        coldCrash: { enabled: true, temperatureC: 2, durationDays: 2 },
        conditioning: { enabled: true, temperatureC: 12, durationDays: 14 }
      }
    })).find((group) => group.stage === "fermentation")!;
    const coldCrash = enabled.steps.find((step) => step.id === "ferment:cold_crash");
    const conditioning = enabled.steps.find((step) => step.id === "ferment:conditioning");
    expect(coldCrash).toMatchObject({ kind: "task", title: "Колд-краш", temperatureC: 2 });
    expect(coldCrash?.detail).toBe("2 °C · 2 дн.");
    expect(conditioning).toMatchObject({ kind: "task", title: "Выдержка", temperatureC: 12 });
    expect(conditioning?.detail).toBe("12 °C · 14 дн.");

    const disabled = buildBrewDaySteps(makeSnapshot({
      fermentationPlan: {
        primaryTemperatureC: 19,
        primaryDurationDays: 14,
        coldCrash: { enabled: false, temperatureC: 2, durationDays: 2 },
        conditioning: { enabled: false, temperatureC: 12, durationDays: 14 }
      }
    })).find((group) => group.stage === "fermentation")!;
    expect(disabled.steps.some((step) => step.id === "ferment:cold_crash")).toBe(false);
    expect(disabled.steps.some((step) => step.id === "ferment:conditioning")).toBe(false);
  });

  it("renders no packaging group when packagingPlan is null", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    expect(groups.some((group) => group.stage === "packaging")).toBe(false);
  });

  it("renders packaging/carbonation steps from packagingPlan fields", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      packagingPlan: {
        method: "bottle",
        notes: "Дать отдохнуть 3 дня перед розливом",
        targetCo2Volumes: 2.4,
        primingSugarType: "Декстроза",
        primingSugarGrams: 120
      }
    }));
    const packaging = groups.find((group) => group.stage === "packaging")!;
    expect(packaging).toBeDefined();
    expect(packaging.steps[0]).toMatchObject({ id: "packaging:method", kind: "task", title: "Розлив в бутылки" });
    expect(packaging.steps[0].detail).toContain("Дать отдохнуть");
    expect(packaging.steps[1]).toMatchObject({ id: "packaging:carbonation", kind: "task", title: "Карбонизация" });
    expect(packaging.steps[1].detail).toContain("2.4 об. CO2");
    expect(packaging.steps[1].detail).toContain("120 г");
    expect(packaging.steps[1].detail).toContain("Декстроза");
  });

  it("adds packagingAdditions entries (priming sugar) to the packaging group", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      packagingAdditions: [
        { linePersistentKey: "p1", name: "Декстроза", category: "consumable", stage: "packaging", timeOffsetMinutes: null, amount: { quantity: 120, unit: "g" }, stepMeta: null }
      ]
    }));
    const packaging = groups.find((group) => group.stage === "packaging")!;
    expect(packaging).toBeDefined();
    expect(packaging.steps[0]).toMatchObject({ id: "packaging:add:p1", kind: "addition", title: "Внести при розливе: Декстроза" });
    expect(packaging.steps[0].detail).toContain("120 г");
  });

  it("renders both packagingPlan settings and packagingAdditions ingredient lines together", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      packagingPlan: { method: "keg" },
      packagingAdditions: [
        { linePersistentKey: "p1", name: "Декстроза", category: "consumable", stage: "packaging", timeOffsetMinutes: null, amount: { quantity: 120, unit: "g" }, stepMeta: null }
      ]
    }));
    const packaging = groups.find((group) => group.stage === "packaging")!;
    expect(packaging.steps.map((step) => step.id)).toEqual(["packaging:method", "packaging:add:p1"]);
  });

  it("tolerates a legacy snapshot with no packagingAdditions key at all (pre-migration data)", () => {
    const legacy = makeSnapshot();
    delete (legacy as Record<string, unknown>).packagingAdditions;
    expect(() => buildBrewDaySteps(legacy)).not.toThrow();
    expect(buildBrewDaySteps(legacy).some((group) => group.stage === "packaging")).toBe(false);
  });

  it("renders custom fermentation extraSteps (e.g. diacetyl rest) between the primary task and cold crash", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      fermentationPlan: {
        primaryTemperatureC: 19,
        primaryDurationDays: 14,
        extraSteps: [
          { id: "diacetyl", name: "Diacetyl rest", temperatureC: 20, durationDays: 2 }
        ],
        coldCrash: { enabled: true, temperatureC: 2, durationDays: 2 }
      }
    }));
    const fermentation = groups.find((group) => group.stage === "fermentation")!;
    expect(fermentation.steps.map((step) => step.id)).toEqual(["ferment:primary", "ferment:extra:diacetyl", "ferment:cold_crash"]);
    expect(fermentation.steps[1]).toMatchObject({ kind: "task", title: "Diacetyl rest", temperatureC: 20 });
    expect(fermentation.steps[1].detail).toContain("20 °C");
    expect(fermentation.steps[1].detail).toContain("2 дн.");
  });

  it("skips empty custom fermentation extraSteps with neither temperature nor duration set", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      fermentationPlan: {
        primaryTemperatureC: 19,
        primaryDurationDays: 14,
        extraSteps: [{ id: "empty", name: "Пустой шаг", temperatureC: null, durationDays: null }]
      }
    }));
    const fermentation = groups.find((group) => group.stage === "fermentation")!;
    expect(fermentation.steps.some((step) => step.id === "ferment:extra:empty")).toBe(false);
  });

  it("places mash-stage additions under the mash group", () => {
    const snapshot = makeSnapshot({
      boilPlan: {
        boilTimeMinutes: 60,
        timedAdditions: [
          { linePersistentKey: "g1", name: "Рисовая шелуха", category: "other", stage: "mash", timeOffsetMinutes: null, amount: { quantity: 0.5, unit: "kg" }, stepMeta: null }
        ]
      }
    });
    const groups = buildBrewDaySteps(snapshot);
    const mash = groups.find((group) => group.stage === "mash")!;
    expect(mash.steps.some((step) => step.id === "mash:add:g1" && step.kind === "addition")).toBe(true);
  });

  describe("mash-stage fermentables don't duplicate the dough-in weight (Ф10)", () => {
    it("omits mash:add:* for a single mash-stage malt (already summed into dough-in), keeping the dough-in weight", () => {
      const groups = buildBrewDaySteps(makeSnapshot({
        grainBillTotalKg: 5,
        boilPlan: {
          boilTimeMinutes: 60,
          timedAdditions: [
            { linePersistentKey: "malt1", name: "Pale Ale Malt", category: "fermentable", stage: "mash", timeOffsetMinutes: null, amount: { quantity: 5000, unit: "g" }, stepMeta: null }
          ]
        }
      }));
      const mash = groups.find((group) => group.stage === "mash")!;
      expect(mash.steps.some((step) => step.id === "mash:add:malt1")).toBe(false);
      expect(mash.steps.find((step) => step.id === "mash:dough-in")?.detail).toBe("5 кг");
    });

    it("omits mash:add:* for every fermentable in a 3-malt grain bill, leaving exactly one dough-in step", () => {
      const groups = buildBrewDaySteps(makeSnapshot({
        grainBillTotalKg: 5.5,
        boilPlan: {
          boilTimeMinutes: 60,
          timedAdditions: [
            { linePersistentKey: "malt1", name: "Pale Ale Malt", category: "fermentable", stage: "mash", timeOffsetMinutes: null, amount: { quantity: 4000, unit: "g" }, stepMeta: null },
            { linePersistentKey: "malt2", name: "Munich Malt", category: "fermentable", stage: "mash", timeOffsetMinutes: null, amount: { quantity: 1000, unit: "g" }, stepMeta: { use: "mash" } },
            { linePersistentKey: "malt3", name: "Crystal 60", category: "fermentable", stage: "mash", timeOffsetMinutes: null, amount: { quantity: 500, unit: "g" }, stepMeta: null }
          ]
        }
      }));
      const mash = groups.find((group) => group.stage === "mash")!;
      expect(mash.steps.some((step) => step.id.startsWith("mash:add:"))).toBe(false);
      expect(mash.steps.filter((step) => step.id === "mash:dough-in")).toHaveLength(1);
    });

    it("keeps mash:add:* for a steeped fermentable (stepMeta.use === \"steep\") — it's not folded into dough-in", () => {
      const groups = buildBrewDaySteps(makeSnapshot({
        boilPlan: {
          boilTimeMinutes: 60,
          timedAdditions: [
            { linePersistentKey: "steep1", name: "Спец. солод (настой)", category: "fermentable", stage: "mash", timeOffsetMinutes: null, amount: { quantity: 300, unit: "g" }, stepMeta: { use: "steep" } }
          ]
        }
      }));
      const mash = groups.find((group) => group.stage === "mash")!;
      const step = mash.steps.find((s) => s.id === "mash:add:steep1");
      expect(step).toMatchObject({ kind: "addition", title: "Внести: Спец. солод (настой)" });
      expect(step?.detail).toContain("300 г");
    });

    it("keeps boil:add:* for a boil-stage fermentable (e.g. priming/boil sugar) — dedup is scoped to stage \"mash\"", () => {
      const groups = buildBrewDaySteps(makeSnapshot({
        boilPlan: {
          boilTimeMinutes: 60,
          timedAdditions: [
            { linePersistentKey: "dex1", name: "Декстроза", category: "fermentable", stage: "boil", timeOffsetMinutes: 10, amount: { quantity: 200, unit: "g" }, stepMeta: null }
          ]
        }
      }));
      const boil = groups.find((group) => group.stage === "boil")!;
      const step = boil.steps.find((s) => s.id === "boil:add:dex1");
      expect(step).toMatchObject({ kind: "addition", title: "Внести: Декстроза" });
      expect(step?.detail).toContain("200 г");
    });
  });

  it("skips empty groups and a zero-length boil timer", () => {
    const snapshot = makeSnapshot({
      mashSteps: [],
      boilPlan: { boilTimeMinutes: 0, timedAdditions: [] },
      whirlpoolPlan: [],
      fermentationPlan: null
    });
    expect(buildBrewDaySteps(snapshot)).toEqual([]);
  });

  it("survives weakly-typed / missing fields without throwing", () => {
    const snapshot = makeSnapshot({
      mashSteps: [{ foo: "bar" } as Record<string, unknown>],
      whirlpoolPlan: [{} as Record<string, unknown>]
    });
    const groups = buildBrewDaySteps(snapshot);
    const mash = groups.find((group) => group.stage === "mash")!;
    // No duration → task, not timer; falls back to "Пауза 1" (id "idx-0", since
    // the weakly-typed step has no "id" field).
    const rest = mash.steps.find((step) => step.id === "mash:idx-0")!;
    expect(rest).toMatchObject({ kind: "task", durationSeconds: null });
    expect(rest.title).toContain("Пауза");
  });
});

describe("mash prep steps (strike / dough-in / lauter)", () => {
  it("adds strike, dough-in and lauter around the mash rests, in order, when mash pauses exist", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      waterPlanMeta: { mashWaterVolumeL: 18, spargeWaterVolumeL: 12 },
      grainBillTotalKg: 5.2
    }));
    const mash = groups.find((group) => group.stage === "mash")!;
    expect(mash.steps.map((step) => step.id)).toEqual(["mash:strike", "mash:dough-in", "mash:m1", "mash:m2", "mash:lauter"]);

    const strike = mash.steps[0];
    expect(strike).toMatchObject({ kind: "task", title: "Нагрейте воду", temperatureC: 70 });
    expect(strike.detail).toBe("18 л · до ≈70 °C");

    const doughIn = mash.steps[1];
    expect(doughIn).toMatchObject({ kind: "task", title: "Засыпьте солод" });
    expect(doughIn.detail).toBe("5.2 кг");

    const lauter = mash.steps[4];
    expect(lauter).toMatchObject({ kind: "task", title: "Промывка и фильтрация" });
    expect(lauter.detail).toBe("промывочная вода 12 л");
  });

  it("sets the strike temperature to the first mash pause temperature + STRIKE_TEMP_OFFSET_C (4 °C)", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      mashSteps: [{ id: "single", name: "Затирание", targetTemperatureC: 63, durationMinutes: 45 }]
    }));
    const mash = groups.find((group) => group.stage === "mash")!;
    const strike = mash.steps.find((step) => step.id === "mash:strike")!;
    expect(strike.temperatureC).toBe(67);
    expect(strike.detail).toBe("до ≈67 °C");
  });

  it("renders dough-in/lauter with null detail when grain weight / water plan data is unknown", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    const mash = groups.find((group) => group.stage === "mash")!;
    expect(mash.steps.find((step) => step.id === "mash:dough-in")?.detail).toBeNull();
    expect(mash.steps.find((step) => step.id === "mash:lauter")?.detail).toBeNull();
  });

  it("renders the strike step with null detail when neither volume nor first-pause temperature is known", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      mashSteps: [{ id: "m1", name: "Пауза" }]
    }));
    const mash = groups.find((group) => group.stage === "mash")!;
    const strike = mash.steps.find((step) => step.id === "mash:strike")!;
    expect(strike.detail).toBeNull();
    expect(strike.temperatureC).toBeNull();
  });

  it("omits strike/dough-in/lauter (and the whole mash group) when there are no mash pauses (extract recipes)", () => {
    const groups = buildBrewDaySteps(makeSnapshot({ mashSteps: [] }));
    expect(groups.some((group) => group.stage === "mash")).toBe(false);
  });
});

describe("water schedule steps (salts / acid / pH, from the precomputed water engine)", () => {
  const waterSchedule = {
    mashSalts: [{ label: "Гипс", grams: 1.2 }, { label: "Хлорид кальция", grams: 0.8 }],
    spargeSalts: [{ label: "Гипс", grams: 0.4 }],
    mashAcid: { label: "Молочная кислота", ml: 2.5 },
    spargeAcid: { label: "Молочная кислота", ml: 1 },
    targetMashPh: 5.4
  };

  it("inserts water-salts/acid/pH-check/sparge-water steps in the right order around strike/dough-in/lauter", () => {
    const groups = buildBrewDaySteps(makeSnapshot({ waterSchedule }));
    const mash = groups.find((group) => group.stage === "mash")!;
    expect(mash.steps.map((step) => step.id)).toEqual([
      "mash:strike",
      "mash:water-salts",
      "mash:acid",
      "mash:dough-in",
      "mash:ph-check",
      "mash:m1",
      "mash:m2",
      "mash:sparge-water",
      "mash:lauter"
    ]);
  });

  it("formats the water-salts step detail by joining label+grams with the standard separator", () => {
    const groups = buildBrewDaySteps(makeSnapshot({ waterSchedule }));
    const mash = groups.find((group) => group.stage === "mash")!;
    const step = mash.steps.find((s) => s.id === "mash:water-salts")!;
    expect(step).toMatchObject({ kind: "addition", title: "Внесите соли в воду" });
    expect(step.detail).toBe("Гипс 1.2 г · Хлорид кальция 0.8 г");
  });

  it("formats the mash-acid step detail with label and ml", () => {
    const groups = buildBrewDaySteps(makeSnapshot({ waterSchedule }));
    const mash = groups.find((group) => group.stage === "mash")!;
    const step = mash.steps.find((s) => s.id === "mash:acid")!;
    expect(step).toMatchObject({ kind: "addition", title: "Подкислите затор" });
    expect(step.detail).toBe("Молочная кислота 2.5 мл");
  });

  it("renders the pH-check task with the target pH in the detail", () => {
    const groups = buildBrewDaySteps(makeSnapshot({ waterSchedule }));
    const mash = groups.find((group) => group.stage === "mash")!;
    const step = mash.steps.find((s) => s.id === "mash:ph-check")!;
    expect(step).toMatchObject({ kind: "task", title: "Проверьте pH затора" });
    expect(step.detail).toBe("цель 5.4");
  });

  it("renders the pH-check task even when targetMashPh is null (waterSchedule still present)", () => {
    const groups = buildBrewDaySteps(makeSnapshot({ waterSchedule: { ...waterSchedule, targetMashPh: null } }));
    const mash = groups.find((group) => group.stage === "mash")!;
    const step = mash.steps.find((s) => s.id === "mash:ph-check")!;
    expect(step).toBeDefined();
    expect(step.detail).toBeNull();
  });

  it("combines sparge salts and sparge acid in the sparge-water step detail", () => {
    const groups = buildBrewDaySteps(makeSnapshot({ waterSchedule }));
    const mash = groups.find((group) => group.stage === "mash")!;
    const step = mash.steps.find((s) => s.id === "mash:sparge-water")!;
    expect(step).toMatchObject({ kind: "addition", title: "Подготовьте промывочную воду" });
    expect(step.detail).toBe("Гипс 0.4 г · Молочная кислота 1 мл");
  });

  it("omits mash:water-salts/mash:acid/mash:sparge-water when their part of the schedule is empty, but keeps ph-check", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      waterSchedule: { mashSalts: [], spargeSalts: [], mashAcid: null, spargeAcid: null, targetMashPh: null }
    }));
    const mash = groups.find((group) => group.stage === "mash")!;
    expect(mash.steps.some((step) => step.id === "mash:water-salts")).toBe(false);
    expect(mash.steps.some((step) => step.id === "mash:acid")).toBe(false);
    expect(mash.steps.some((step) => step.id === "mash:sparge-water")).toBe(false);
    expect(mash.steps.some((step) => step.id === "mash:ph-check")).toBe(true);
  });

  it("renders no water-schedule steps at all when waterSchedule is null", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    const mash = groups.find((group) => group.stage === "mash")!;
    expect(mash.steps.map((step) => step.id)).toEqual(["mash:strike", "mash:dough-in", "mash:m1", "mash:m2", "mash:lauter"]);
  });

  it("does not render water-schedule steps when there are no mash pauses at all (extract recipes)", () => {
    const groups = buildBrewDaySteps(makeSnapshot({ mashSteps: [], waterSchedule }));
    expect(groups.some((group) => group.stage === "mash")).toBe(false);
  });
});

describe("brewPlanSnapshotSchema backward compatibility", () => {
  it("parses a pre-dryHopPlan snapshot row from the DB, defaulting dryHopPlan to []", () => {
    const legacyRow = makeSnapshot();
    delete (legacyRow as Record<string, unknown>).dryHopPlan;

    const parsed = brewPlanSnapshotSchema.parse(legacyRow);
    expect(parsed.dryHopPlan).toEqual([]);
    // И построение шагов из уже распарсенного (реальный путь service.ts) не падает.
    expect(() => buildBrewDaySteps(parsed)).not.toThrow();
  });

  it("parses a pre-packagingAdditions snapshot row from the DB, defaulting packagingAdditions to []", () => {
    const legacyRow = makeSnapshot();
    delete (legacyRow as Record<string, unknown>).packagingAdditions;

    const parsed = brewPlanSnapshotSchema.parse(legacyRow);
    expect(parsed.packagingAdditions).toEqual([]);
    expect(() => buildBrewDaySteps(parsed)).not.toThrow();
  });

  it("parses a pre-grainBillTotalKg snapshot row from the DB, defaulting grainBillTotalKg to null", () => {
    const legacyRow = makeSnapshot();
    delete (legacyRow as Record<string, unknown>).grainBillTotalKg;

    const parsed = brewPlanSnapshotSchema.parse(legacyRow);
    expect(parsed.grainBillTotalKg).toBeNull();
    // Деградация мягкая: шаг «Засыпьте солод» рендерится с пустым detail, гид не падает.
    expect(() => buildBrewDaySteps(parsed)).not.toThrow();
  });

  it("parses a pre-waterSchedule snapshot row from the DB, defaulting waterSchedule to null", () => {
    const legacyRow = makeSnapshot();
    delete (legacyRow as Record<string, unknown>).waterSchedule;

    const parsed = brewPlanSnapshotSchema.parse(legacyRow);
    expect(parsed.waterSchedule).toBeNull();
    // Гид молча пропускает шаги воды — не падает и не рисует пустые/частичные шаги.
    const groups = buildBrewDaySteps(parsed);
    const mash = groups.find((group) => group.stage === "mash")!;
    expect(mash.steps.some((step) => step.id.startsWith("mash:water-salts") || step.id === "mash:acid" || step.id === "mash:ph-check" || step.id === "mash:sparge-water")).toBe(false);
  });
});

describe("brew-day acts / cursor", () => {
  it("maps each batch status to its act", () => {
    expect(brewDayActForStatus("planned")).toBe("prep");
    expect(brewDayActForStatus("brewing")).toBe("brewday");
    expect(brewDayActForStatus("fermenting")).toBe("fermentation");
    expect(brewDayActForStatus("completed")).toBe("done");
    expect(brewDayActForStatus("cancelled")).toBe("archived");
  });

  it("maps stages to acts (mash…chill → brewday, fermentation/packaging → fermentation)", () => {
    expect(stageToAct("mash")).toBe("brewday");
    expect(stageToAct("chill")).toBe("brewday");
    expect(stageToAct("fermentation")).toBe("fermentation");
    expect(stageToAct("packaging")).toBe("fermentation");
  });

  it("scopes groups to the brewday act (excludes fermentation/packaging)", () => {
    const groups = buildBrewDaySteps(makeSnapshot({
      packagingAdditions: [{ linePersistentKey: "p1", name: "Декстроза", category: "consumable", stage: "packaging", timeOffsetMinutes: null, amount: { quantity: 120, unit: "g" }, stepMeta: null }]
    }));
    expect(groupsForAct(groups, "brewday").map((group) => group.stage)).toEqual(["mash", "boil", "whirlpool", "chill"]);
    expect(groupsForAct(groups, "fermentation").map((group) => group.stage)).toEqual(["fermentation", "packaging"]);
  });

  it("resolves the cursor to the first/second undone step of the act", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    const mash = groups.find((group) => group.stage === "mash")!;
    // Mark the whole mash group done (prep + rests + lauter) → cursor should land on the boil timer.
    const progress = {
      steps: Object.fromEntries(mash.steps.map((step) => [step.id, { done: true, timerStartedAt: null }])),
      updatedAt: null
    };
    const cursor = resolveBrewDayCursor(groups, progress, "brewday");
    expect(cursor.current?.id).toBe("boil:timer");
    expect(cursor.next?.id).toBe("boil:add:h1");
    expect(cursor.actComplete).toBe(false);
    expect(cursor.doneCount).toBe(mash.steps.length);
  });

  it("flags actComplete when every step of the act is done", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    const steps = groupsForAct(groups, "brewday").flatMap((group) => group.steps);
    const progress = {
      steps: Object.fromEntries(steps.map((step) => [step.id, { done: true, timerStartedAt: null }])),
      updatedAt: null
    };
    const cursor = resolveBrewDayCursor(groups, progress, "brewday");
    expect(cursor.current).toBeNull();
    expect(cursor.actComplete).toBe(true);
    expect(cursor.doneCount).toBe(cursor.total);
  });

  it("summarizes the plan with per-stage step counts and timer totals", () => {
    const summary = summarizeBrewDayPlan(buildBrewDaySteps(makeSnapshot()));
    const mash = summary.stages.find((stage) => stage.stage === "mash")!;
    // 2 mash rests + strike/dough-in/lauter prep steps.
    expect(mash.stepCount).toBe(5);
    // 60 + 10 min of mash rests (strike/dough-in/lauter are task steps, no timer).
    expect(mash.timerSeconds).toBe(4200);
    // mash rests (4200) + boil timer (3600) + whirlpool stand (1200).
    expect(summary.totalTimerSeconds).toBe(9000);
    expect(summary.totalSteps).toBeGreaterThanOrEqual(7);
  });
});

describe("resolveLastDoneStep", () => {
  it("returns null when nothing is done yet", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    const progress = { steps: {}, updatedAt: null };
    expect(resolveLastDoneStep(groups, progress, "brewday")).toBeNull();
  });

  it("returns the last done step in traversal order, not marking order", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    // Mark boil:timer done *before* mash:m1 in the progress object — traversal
    // order (mash → boil) must still win over insertion order.
    const progress = {
      steps: {
        "boil:timer": { done: true, timerStartedAt: null },
        "mash:m1": { done: true, timerStartedAt: null }
      },
      updatedAt: null
    };
    expect(resolveLastDoneStep(groups, progress, "brewday")?.id).toBe("boil:timer");
  });

  it("ignores done steps that belong to a different act", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    // Only the fermentation step is done — irrelevant to the "brewday" act.
    const progress = {
      steps: { "ferment:primary": { done: true, timerStartedAt: null } },
      updatedAt: null
    };
    expect(resolveLastDoneStep(groups, progress, "brewday")).toBeNull();
    expect(resolveLastDoneStep(groups, progress, "fermentation")?.id).toBe("ferment:primary");
  });
});

describe("brew-day progress helpers", () => {
  it("normalizes garbage into a clean progress shape", () => {
    expect(normalizeBrewDayProgress(null)).toEqual({ steps: {}, updatedAt: null });
    expect(normalizeBrewDayProgress({ steps: { a: { done: true, timerStartedAt: "x" }, b: "nope" }, updatedAt: 5 })).toEqual({
      steps: { a: { done: true, timerStartedAt: "x" } },
      updatedAt: null
    });
  });

  it("applies a patch immutably, preserving untouched fields", () => {
    const base = { steps: { s1: { done: false, timerStartedAt: "t0" } }, updatedAt: null };
    const afterDone = applyBrewDayStepPatch(base, "s1", { done: true }, "now");
    expect(afterDone.steps.s1).toEqual({ done: true, timerStartedAt: "t0" });
    expect(afterDone.updatedAt).toBe("now");
    // Original untouched.
    expect(base.steps.s1.done).toBe(false);

    const newStep = applyBrewDayStepPatch(base, "s2", { timerStartedAt: "t1" }, "now");
    expect(newStep.steps.s2).toEqual({ done: false, timerStartedAt: "t1" });
  });

  it("can clear a timer with explicit null", () => {
    const base = { steps: { s1: { done: false, timerStartedAt: "t0" } }, updatedAt: null };
    const cleared = applyBrewDayStepPatch(base, "s1", { timerStartedAt: null }, "now");
    expect(cleared.steps.s1.timerStartedAt).toBeNull();
  });

  it("summarizes done vs total across groups", () => {
    const groups = buildBrewDaySteps(makeSnapshot());
    const progress = { steps: { "mash:m1": { done: true, timerStartedAt: null }, "boil:timer": { done: true, timerStartedAt: null } }, updatedAt: null };
    const summary = summarizeBrewDayProgress(groups, progress);
    expect(summary.done).toBe(2);
    expect(summary.total).toBeGreaterThanOrEqual(6);
  });
});
