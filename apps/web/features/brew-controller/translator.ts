// =============================================================================
//  features/brew-controller/translator.ts
//  Перевод замороженного снимка плана варки `brew_plan_v1` → нативный рецепт
//  прошивки §6.1 (`DeviceRecipe` из @nb/brewforge-protocol).
//
//  Это самый рискованный узел интеграции: снимок частично «слабо типизирован»
//  (mashSteps / boilPlan.timedAdditions / whirlpoolPlan объявлены как
//  z.record(z.unknown())), поэтому читаем ВСЁ оборонительно — нет поля/мусор →
//  разумный дефолт или пропуск, — а итог обязательно валидируем
//  `DeviceRecipeSchema.parse` перед возвратом (бросаем понятную ошибку, если
//  валидный рецепт собрать не удалось).
//
//  Поля, которые ВЫЧИСЛЯЕТ само устройство (формулы Палмера + глобальные
//  настройки §6.3), из портала НЕ переносим — оставляем null:
//    mash.doughInTempC, mash.mashOut, boil.boilTempC.
// =============================================================================
import {
  DeviceRecipeSchema,
  PROTOCOL_SCHEMA_VERSION,
  type DeviceRecipe,
  type Whirlpool,
} from "@nb/brewforge-protocol";
import { convertWeight, type WeightUnit } from "@nb/brewing-core";

// --- Границы прошивки (bf_types.h; их же зеркалит схема протокола) ----------
const MAX_MASH_STEPS = 8; // BF_MAX_MASH_STEPS
const MAX_HOPS = 12; // BF_MAX_HOPS
const MAX_HOP_STANDS = 5; // BF_MAX_HOP_STANDS
const NAME_LEN = 32; // BF_NAME_LEN

// --- Дефолты для полей, которых нет в brew_plan_v1, но требует схема устройства
const DEFAULT_RECIPE_NAME = "Brew";
const DEFAULT_MASH_STEP_NAME = "Mash";
const DEFAULT_HOP_NAME = "Hop";
const DEFAULT_BOIL_TIME_MIN = 60;
const DEFAULT_COOLING_TARGET_C = 20; // типичная температура внесения дрожжей
const DEFAULT_PID_DURING_DOUGH_IN = true;
// Порог «горячего» вирпула: стенд ≥ 80 °C — горячая сторона (hot), иначе остывший (cool).
const WHIRLPOOL_HOT_MIN_C = 80;

// Весовые единицы, нормализуемые в граммы (bf_hop_t.amount_g).
const WEIGHT_UNITS: readonly WeightUnit[] = ["g", "kg", "oz", "lb"];
const isWeightUnit = (unit: string): unit is WeightUnit =>
  (WEIGHT_UNITS as readonly string[]).includes(unit);

// --- Оборонительные читатели произвольных JSON-значений ---------------------
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Конечное число из number или числовой строки, иначе null. */
const readNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/** Первое конечное число среди перечисленных ключей записи, иначе null. */
const readNumberField = (rec: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const key of keys) {
    const value = readNumber(rec[key]);
    if (value !== null) return value;
  }
  return null;
};

const readString = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** Имя ≤ NAME_LEN символов, без крайних пробелов; пустое → fallback. */
const cleanName = (value: unknown, fallback: string): string => {
  const raw = (readString(value) ?? "").trim();
  return (raw === "" ? fallback : raw).slice(0, NAME_LEN);
};

/** Целое ≥ 0 (округление + клип); null → fallback. */
const toNonNegInt = (value: number | null, fallback = 0): number => {
  if (value === null) return fallback;
  return Math.max(0, Math.round(value));
};

const roundTo1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Нормализация количества хмеля/внесения в граммы (bf_hop_t.amount_g):
 *  - g/kg/oz/lb → конвертация через @nb/brewing-core (oz = 28.349523125 г и т.п.);
 *  - объёмные/штучные/неизвестные единицы (ml/l/gal/item/pack) — берём числовое
 *    количество «как есть» (best-effort: у прошивки есть только поле в граммах).
 * Результат округляем до 0.1 г и не допускаем отрицательных значений.
 */
const normalizeToGrams = (amount: unknown): number => {
  const rec = asRecord(amount);
  const quantity = readNumber(rec.quantity) ?? 0;
  const unit = (readString(rec.unit) ?? "").trim().toLowerCase();
  // decimals=6, чтобы не округлять дважды: финальное округление — до 0.1 г ниже.
  const grams = isWeightUnit(unit)
    ? convertWeight({ value: quantity, unit }, "g", 6).value
    : quantity;
  return Math.max(0, roundTo1(grams));
};

/**
 * Перевод `brew_plan_v1` → `DeviceRecipe`. Принимает unknown (снимок мог быть
 * сериализован/прочитан из БД), читает оборонительно и валидирует результат.
 */
export function brewPlanV1ToDeviceRecipe(snapshot: unknown): DeviceRecipe {
  const root = asRecord(snapshot);
  const recipe = asRecord(root.recipe);

  // --- name ---------------------------------------------------------------
  const name = cleanName(recipe.title, DEFAULT_RECIPE_NAME);

  // --- mash.steps (clamp ≤ 8); шаг без температуры пропускаем --------------
  const mashSteps = asArray(root.mashSteps)
    .map((raw) => {
      const step = asRecord(raw);
      const tempC = readNumberField(step, "targetTemperatureC", "tempC", "temperatureC");
      if (tempC === null) return null;
      const timeMin = toNonNegInt(
        readNumberField(step, "durationMinutes", "timeMin", "durationMin", "minutes"),
      );
      return { name: cleanName(step.name, DEFAULT_MASH_STEP_NAME), tempC, timeMin };
    })
    .filter((step): step is { name: string; tempC: number; timeMin: number } => step !== null)
    .slice(0, MAX_MASH_STEPS);

  // --- boil --------------------------------------------------------------
  const boilPlan = asRecord(root.boilPlan);
  const boilTimeMin = toNonNegInt(
    readNumberField(boilPlan, "boilTimeMinutes", "boilTimeMin", "boilTime"),
    DEFAULT_BOIL_TIME_MIN,
  );

  // Внесения этапа кипячения → boil.hops[{name, amountG, atMinBeforeEnd}].
  // Семантика времени: timeOffset (мин «до конца кипения») напрямую = atMinBeforeEnd
  // (подтверждено BeerXML/Brewfather-импортом и генератором brew-steps). Приоритет
  // у stepMeta.timeMinutes, затем timeOffsetMinutes. Затирочные внесения отбрасываем
  // (у прошивки нет места для добавок на mash-шагах). Clamp ≤ 12.
  const hops = asArray(boilPlan.timedAdditions)
    .map((raw) => {
      const addition = asRecord(raw);
      const stage = (readString(addition.stage) ?? "").toLowerCase();
      if (stage === "mash") return null;
      const meta = asRecord(addition.stepMeta);
      const atMinBeforeEnd = toNonNegInt(
        readNumberField(meta, "timeMinutes") ??
          readNumberField(addition, "timeOffsetMinutes", "timeOffset"),
      );
      return {
        name: cleanName(addition.name, DEFAULT_HOP_NAME),
        amountG: normalizeToGrams(addition.amount),
        atMinBeforeEnd,
      };
    })
    .filter(
      (hop): hop is { name: string; amountG: number; atMinBeforeEnd: number } => hop !== null,
    )
    .slice(0, MAX_HOPS);

  // --- whirlpool / hopStand ----------------------------------------------
  // whirlpoolPlan — внесения с useType whirlpool/dip_hop. Температуру/время стенда
  // берём из stepMeta (temperatureC / timeMinutes|durationMinutes). Стенд без
  // температуры не задаём (не выдумываем hold-уставку), но он всё равно делает
  // вирпул «не off». Идентичные (tempC,timeMin) схлопываем — несколько хмелей в
  // одном стенде дают один стенд. Clamp ≤ 5.
  const whirlpoolAdditions = asArray(root.whirlpoolPlan).map(asRecord);
  const standTemps: number[] = [];
  const standCandidates = whirlpoolAdditions
    .map((addition) => {
      const meta = asRecord(addition.stepMeta);
      const tempC =
        readNumberField(meta, "temperatureC", "tempC") ?? readNumberField(addition, "temperatureC");
      if (tempC === null) return null;
      standTemps.push(tempC);
      const timeMin = toNonNegInt(
        readNumberField(meta, "timeMinutes", "durationMinutes") ??
          readNumberField(addition, "timeOffsetMinutes", "timeOffset"),
      );
      return { tempC, timeMin };
    })
    .filter((stand): stand is { tempC: number; timeMin: number } => stand !== null);

  const hopStand: { tempC: number; timeMin: number }[] = [];
  const seenStands = new Set<string>();
  for (const stand of standCandidates) {
    const key = `${stand.tempC}:${stand.timeMin}`;
    if (seenStands.has(key)) continue;
    seenStands.add(key);
    hopStand.push(stand);
    if (hopStand.length >= MAX_HOP_STANDS) break;
  }

  const whirlpool: Whirlpool =
    whirlpoolAdditions.length === 0
      ? "off"
      : standTemps.length > 0 && Math.max(...standTemps) < WHIRLPOOL_HOT_MIN_C
        ? "cool"
        : "hot";

  // --- cooling (схема требует число; берём температуру внесения дрожжей) ---
  const fermentation = asRecord(root.fermentationPlan);
  const coolingTargetC =
    readNumberField(fermentation, "primaryTemperatureC", "temperatureC", "pitchTemperatureC") ??
    DEFAULT_COOLING_TARGET_C;

  const candidate = {
    schema: PROTOCOL_SCHEMA_VERSION,
    name,
    units: "C" as const,
    mash: {
      doughInTempC: null, // вычисляет устройство
      pidDuringDoughIn: DEFAULT_PID_DURING_DOUGH_IN,
      steps: mashSteps,
      mashOut: null, // в brew_plan_v1 нет данных мэш-аута → устройство решает само
    },
    boil: {
      boilTimeMin,
      boilTempC: null, // вычисляет устройство
      hops,
    },
    hopStand,
    whirlpool,
    cooling: { targetC: coolingTargetC },
    beerxmlSource: null,
  };

  const result = DeviceRecipeSchema.safeParse(candidate);
  if (!result.success) {
    throw new Error(
      `brewPlanV1ToDeviceRecipe: не удалось собрать валидный DeviceRecipe: ${result.error.message}`,
    );
  }
  return result.data;
}
