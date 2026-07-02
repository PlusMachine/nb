import {
  brewDayStageLabels,
  emptyBrewDayProgress,
  type BrewDayProgress,
  type BrewDayStage,
  type BrewDayStageGroup,
  type BrewDayStep,
  type BrewDayStepState,
  type BrewPlanSnapshot
} from "./contracts";

// Чистый слой гида варочного дня: превращает иммутабельный brew_plan_snapshot в
// упорядоченный чек-лист шагов со стабильными id и нормализует/мёрджит прогресс.
// Без БД/React — покрывается юнит-тестами.

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const readString = (record: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const readNumber = (record: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
};

const fmtTemp = (tempC: number | null): string | null => (tempC == null ? null : `${tempC} °C`);

const fmtDuration = (minutes: number | null): string | null => {
  if (minutes == null || minutes <= 0) {
    return null;
  }
  if (minutes < 60) {
    return `${Math.round(minutes)} мин`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
};

// Длительности брожения/выдержки — в днях, а не в минутах (в отличие от затора и
// кипячения), поэтому таймером их не делаем (см. fmtDuration) — только подпись.
const fmtDays = (days: number | null): string | null => (
  days == null || days <= 0 ? null : `${Math.round(days)} дн.`
);

const fmtAmount = (record: Record<string, unknown>): string | null => {
  const amount = record.amount;
  if (!isRecord(amount)) {
    return null;
  }
  const quantity = readNumber(amount, "quantity");
  const unit = readString(amount, "unit");
  if (quantity == null) {
    return null;
  }
  // Аккуратное число: без хвостовых нулей.
  const value = Number(quantity.toFixed(3));
  return unit ? `${value} ${unit}` : `${value}`;
};

const joinDetail = (...parts: Array<string | null>): string | null => {
  const filtered = parts.filter((part): part is string => Boolean(part && part.trim()));
  return filtered.length ? filtered.join(" · ") : null;
};

// Время засыпи в кипячении выражается как «за N минут до конца» (timeOffsetMinutes).
const fmtBoilTiming = (minutesBeforeEnd: number | null): string | null => {
  if (minutesBeforeEnd == null) {
    return null;
  }
  if (minutesBeforeEnd <= 0) {
    return "в конце кипячения";
  }
  return `за ${Math.round(minutesBeforeEnd)} мин до конца`;
};

const readAdditionTiming = (record: Record<string, unknown>): number | null => {
  // stepMeta.timeMinutes имеет приоритет над timeOffsetMinutes (как в трансляторе устройства).
  const stepMeta = record.stepMeta;
  if (isRecord(stepMeta)) {
    const fromMeta = readNumber(stepMeta, "timeMinutes", "durationMinutes");
    if (fromMeta != null) {
      return fromMeta;
    }
  }
  return readNumber(record, "timeOffsetMinutes");
};

const readWhirlpoolStand = (record: Record<string, unknown>): { tempC: number | null; timeMin: number | null } => {
  const stepMeta = isRecord(record.stepMeta) ? record.stepMeta : {};
  return {
    tempC: readNumber(stepMeta, "temperatureC", "tempC"),
    timeMin: readNumber(stepMeta, "timeMinutes", "durationMinutes")
  };
};

// Сколько дней стоит внесение на брожении (сухой хмель и т.п.) — как в редакторе
// рецепта (recipe-designer хранит это в stepMeta.durationDays для useType dry_hop).
const readFermentationDurationDays = (record: Record<string, unknown>): number | null => {
  const stepMeta = isRecord(record.stepMeta) ? record.stepMeta : {};
  return readNumber(stepMeta, "durationDays");
};

const additionKey = (record: Record<string, unknown>, fallbackIndex: number): string => (
  readString(record, "linePersistentKey", "id") ?? `idx-${fallbackIndex}`
);

const additionName = (record: Record<string, unknown>): string => (
  readString(record, "name") ?? "Ингредиент"
);

/**
 * Строит сгруппированный по этапам чек-лист варочного дня из снапшота плана.
 * Этапы и порядок: затор → кипячение → вирпул → брожение → розлив. Пустые группы
 * отбрасываются. id шагов стабильны между рендерами (ключ прогресса).
 */
export const buildBrewDaySteps = (snapshot: BrewPlanSnapshot): BrewDayStageGroup[] => {
  const mash: BrewDayStep[] = [];
  const boil: BrewDayStep[] = [];
  const whirlpool: BrewDayStep[] = [];
  const fermentation: BrewDayStep[] = [];

  // --- Затор: паузы (таймеры) + засыпи стадии mash ---
  snapshot.mashSteps.forEach((raw, index) => {
    if (!isRecord(raw)) {
      return;
    }
    const id = readString(raw, "id") ?? `idx-${index}`;
    const name = readString(raw, "name") ?? `Пауза ${index + 1}`;
    const tempC = readNumber(raw, "targetTemperatureC", "temperatureC", "tempC");
    const durationMin = readNumber(raw, "durationMinutes", "timeMinutes");
    mash.push({
      id: `mash:${id}`,
      stage: "mash",
      kind: durationMin && durationMin > 0 ? "timer" : "task",
      title: name,
      detail: joinDetail(fmtTemp(tempC), fmtDuration(durationMin)),
      durationSeconds: durationMin && durationMin > 0 ? Math.round(durationMin * 60) : null,
      temperatureC: tempC
    });
  });

  // Засыпи стадии mash (из timedAdditions со stage === "mash").
  snapshot.boilPlan.timedAdditions.forEach((raw, index) => {
    if (!isRecord(raw) || readString(raw, "stage") !== "mash") {
      return;
    }
    mash.push({
      id: `mash:add:${additionKey(raw, index)}`,
      stage: "mash",
      kind: "addition",
      title: `Внести: ${additionName(raw)}`,
      detail: fmtAmount(raw),
      durationSeconds: null,
      temperatureC: null
    });
  });

  // --- Кипячение: таймер кипячения + засыпи по времени до конца ---
  const boilTimeMin = snapshot.boilPlan.boilTimeMinutes;
  if (boilTimeMin && boilTimeMin > 0) {
    boil.push({
      id: "boil:timer",
      stage: "boil",
      kind: "timer",
      title: "Кипячение сусла",
      detail: fmtDuration(boilTimeMin),
      durationSeconds: Math.round(boilTimeMin * 60),
      temperatureC: null
    });
  }

  const boilAdditions = snapshot.boilPlan.timedAdditions
    .map((raw, index) => ({ raw, index }))
    .filter(({ raw }) => isRecord(raw) && readString(raw, "stage") === "boil")
    .map(({ raw, index }) => {
      const record = raw as Record<string, unknown>;
      const timing = readNumber(record, "timeOffsetMinutes");
      return {
        record,
        index,
        timing,
        step: {
          id: `boil:add:${additionKey(record, index)}`,
          stage: "boil" as const,
          kind: "addition" as const,
          title: `Внести: ${additionName(record)}`,
          detail: joinDetail(fmtAmount(record), fmtBoilTiming(timing)),
          durationSeconds: null,
          temperatureC: null
        }
      };
    });
  // Засыпи кипячения — в порядке внесения: раньше = больше минут до конца.
  boilAdditions
    .sort((left, right) => (right.timing ?? -1) - (left.timing ?? -1))
    .forEach(({ step }) => boil.push(step));

  // --- Вирпул: засыпи с выдержкой ---
  snapshot.whirlpoolPlan.forEach((raw, index) => {
    if (!isRecord(raw)) {
      return;
    }
    const stand = readWhirlpoolStand(raw);
    whirlpool.push({
      id: `whirlpool:${additionKey(raw, index)}`,
      stage: "whirlpool",
      kind: stand.timeMin && stand.timeMin > 0 ? "timer" : "addition",
      title: `Внести на вирпуле: ${additionName(raw)}`,
      detail: joinDetail(
        fmtAmount(raw),
        stand.tempC != null ? `выдержка ${stand.tempC} °C` : null,
        fmtDuration(stand.timeMin)
      ),
      durationSeconds: stand.timeMin && stand.timeMin > 0 ? Math.round(stand.timeMin * 60) : null,
      temperatureC: stand.tempC
    });
  });

  // --- Брожение: одна отметка с целевой температурой/длительностью ---
  const ferment = snapshot.fermentationPlan;
  if (isRecord(ferment)) {
    const tempC = readNumber(ferment, "primaryTemperatureC");
    const days = readNumber(ferment, "primaryDurationDays");
    const detail = joinDetail(
      tempC != null ? `${tempC} °C` : null,
      days != null ? `${Math.round(days)} дн.` : null
    );
    if (tempC != null || days != null) {
      fermentation.push({
        id: "ferment:primary",
        stage: "fermentation",
        kind: "task",
        title: "Поставить на брожение",
        detail,
        durationSeconds: null,
        temperatureC: tempC
      });
    }
  }

  // Внесения на брожении (сухой хмель и др.) — после старта брожения. Длительность
  // в днях, не в минутах, поэтому это "addition"-шаг, а не таймер (как во вкладке
  // рецепта: `${durationDays} дн` рядом с названием).
  (snapshot.dryHopPlan ?? []).forEach((raw, index) => {
    if (!isRecord(raw)) {
      return;
    }
    fermentation.push({
      id: `ferment:add:${additionKey(raw, index)}`,
      stage: "fermentation",
      kind: "addition",
      title: `Внести на брожении: ${additionName(raw)}`,
      detail: joinDetail(fmtAmount(raw), fmtDays(readFermentationDurationDays(raw))),
      durationSeconds: null,
      temperatureC: null
    });
  });

  // Кастомные шаги брожения (diacetyl rest и т.п.) — из processMeta.fermentationProfile.
  // Темпорально они относятся к концу первичного брожения (ещё «тёплая» стадия),
  // поэтому рендерятся до cold crash/conditioning, а не после них.
  if (isRecord(ferment) && Array.isArray(ferment.extraSteps)) {
    ferment.extraSteps.forEach((raw, index) => {
      if (!isRecord(raw)) {
        return;
      }
      const tempC = readNumber(raw, "temperatureC");
      const days = readNumber(raw, "durationDays");
      if (tempC == null && days == null) {
        return;
      }
      const id = readString(raw, "id") ?? `idx-${index}`;
      fermentation.push({
        id: `ferment:extra:${id}`,
        stage: "fermentation",
        kind: "task",
        title: readString(raw, "name") ?? `Шаг ${index + 1}`,
        detail: joinDetail(fmtTemp(tempC), fmtDays(days)),
        durationSeconds: null,
        temperatureC: tempC
      });
    });
  }

  // Cold crash / conditioning — из processMeta.fermentationProfile рецепта, только
  // если явно включены (enabled). Длительность в днях — task, не timer (как и
  // основное брожение выше): многодневный обратный отсчёт неюзабелен как таймер.
  if (isRecord(ferment)) {
    const coldCrash = isRecord(ferment.coldCrash) ? ferment.coldCrash : null;
    if (coldCrash && coldCrash.enabled === true) {
      const tempC = readNumber(coldCrash, "temperatureC");
      const days = readNumber(coldCrash, "durationDays");
      fermentation.push({
        id: "ferment:cold_crash",
        stage: "fermentation",
        kind: "task",
        title: "Cold crash",
        detail: joinDetail(fmtTemp(tempC), fmtDays(days)),
        durationSeconds: null,
        temperatureC: tempC
      });
    }

    const conditioning = isRecord(ferment.conditioning) ? ferment.conditioning : null;
    if (conditioning && conditioning.enabled === true) {
      const tempC = readNumber(conditioning, "temperatureC");
      const days = readNumber(conditioning, "durationDays");
      fermentation.push({
        id: "ferment:conditioning",
        stage: "fermentation",
        kind: "task",
        title: "Conditioning",
        detail: joinDetail(fmtTemp(tempC), fmtDays(days)),
        durationSeconds: null,
        temperatureC: tempC
      });
    }
  }

  // --- Розлив: настройки упаковки/карбонизации рецепта, если заданы. Пока ни
  // одна поверхность редактора не пишет packagingPlan (нет "packaging-визарда") —
  // рендерим по фактическим полям на будущее, без жёсткой обязательной формы.
  const packaging: BrewDayStep[] = [];
  const packagingPlan = snapshot.packagingPlan;
  if (isRecord(packagingPlan)) {
    const methodRaw = readString(packagingPlan, "method", "packagingMethod");
    const methodLabel = methodRaw === "keg" || methodRaw === "kegging"
      ? "Розлив в кег"
      : methodRaw === "bottle" || methodRaw === "bottling"
        ? "Розлив в бутылки"
        : methodRaw
          ? "Розлив"
          : null;
    const notes = readString(packagingPlan, "notes", "instructions");
    if (methodLabel || notes) {
      packaging.push({
        id: "packaging:method",
        stage: "packaging",
        kind: "task",
        title: methodLabel ?? "Розлив",
        detail: notes,
        durationSeconds: null,
        temperatureC: null
      });
    }

    const co2Volumes = readNumber(packagingPlan, "targetCo2Volumes", "co2Volumes", "carbonationVolumes");
    const sugarName = readString(packagingPlan, "primingSugarType", "primingSugarName", "sugarType");
    const sugarGrams = readNumber(packagingPlan, "primingSugarGrams", "primingSugarAmount", "sugarGrams");
    if (co2Volumes != null || sugarName != null || sugarGrams != null) {
      const sugarDetail = joinDetail(
        sugarGrams != null ? `${Number(sugarGrams.toFixed(1))} г` : null,
        sugarName
      );
      packaging.push({
        id: "packaging:carbonation",
        stage: "packaging",
        kind: "task",
        title: "Карбонизация",
        detail: joinDetail(co2Volumes != null ? `${co2Volumes} об. CO2` : null, sugarDetail),
        durationSeconds: null,
        temperatureC: null
      });
    }
  }

  // Позиции рецепта на розливе (прайминг-сахар и т.п.) — из ingredients со
  // stage="packaging" (не из packagingPlan выше: это настройки, не строки состава).
  (snapshot.packagingAdditions ?? []).forEach((raw, index) => {
    if (!isRecord(raw)) {
      return;
    }
    packaging.push({
      id: `packaging:add:${additionKey(raw, index)}`,
      stage: "packaging",
      kind: "addition",
      title: `Внести при розливе: ${additionName(raw)}`,
      detail: fmtAmount(raw),
      durationSeconds: null,
      temperatureC: null
    });
  });

  const groups: BrewDayStageGroup[] = [];
  const pushGroup = (stage: BrewDayStage, steps: BrewDayStep[]) => {
    if (steps.length) {
      groups.push({ stage, label: brewDayStageLabels[stage], steps });
    }
  };
  pushGroup("mash", mash);
  pushGroup("boil", boil);
  pushGroup("whirlpool", whirlpool);
  pushGroup("fermentation", fermentation);
  pushGroup("packaging", packaging);
  return groups;
};

const defaultStepState = (): BrewDayStepState => ({ done: false, timerStartedAt: null });

/** Нормализует сырое значение из JSONB-колонки в типизированный прогресс. */
export const normalizeBrewDayProgress = (raw: unknown): BrewDayProgress => {
  if (!isRecord(raw)) {
    return { ...emptyBrewDayProgress, steps: {} };
  }
  const stepsRaw = isRecord(raw.steps) ? raw.steps : {};
  const steps: Record<string, BrewDayStepState> = {};
  for (const [key, value] of Object.entries(stepsRaw)) {
    if (!isRecord(value)) {
      continue;
    }
    steps[key] = {
      done: value.done === true,
      timerStartedAt: typeof value.timerStartedAt === "string" ? value.timerStartedAt : null
    };
  }
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : null;
  return { steps, updatedAt };
};

/** Применяет патч к одному шагу, возвращая новый прогресс (чистая операция). */
export const applyBrewDayStepPatch = (
  progress: BrewDayProgress,
  stepId: string,
  patch: { done?: boolean; timerStartedAt?: string | null },
  now: string
): BrewDayProgress => {
  const current = progress.steps[stepId] ?? defaultStepState();
  const next: BrewDayStepState = {
    done: patch.done ?? current.done,
    timerStartedAt: patch.timerStartedAt !== undefined ? patch.timerStartedAt : current.timerStartedAt
  };
  return {
    steps: { ...progress.steps, [stepId]: next },
    updatedAt: now
  };
};

/** Сводка прогресса: сколько шагов отмечено из общего числа. */
export const summarizeBrewDayProgress = (
  groups: BrewDayStageGroup[],
  progress: BrewDayProgress
): { total: number; done: number } => {
  let total = 0;
  let done = 0;
  for (const group of groups) {
    for (const step of group.steps) {
      total += 1;
      if (progress.steps[step.id]?.done) {
        done += 1;
      }
    }
  }
  return { total, done };
};
