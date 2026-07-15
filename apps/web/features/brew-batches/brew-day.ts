import {
  brewDayStageLabels,
  emptyBrewDayProgress,
  type BrewBatchStatus,
  type BrewDayAct,
  type BrewDayCursor,
  type BrewDayPlanSummary,
  type BrewDayProgress,
  type BrewDayStage,
  type BrewDayStageGroup,
  type BrewDayStep,
  type BrewDayStepState,
  type BrewMeasurementKind,
  type BrewMeasurementSummary,
  type BrewPlanSnapshot
} from "./contracts";
import { formatInventoryUnitLabel, parseInventoryUnit } from "../inventory/units";
import { pluralize } from "@/lib/pluralize";

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

const fmtLiters = (liters: number | null): string | null => (
  liters == null ? null : `${Number(liters.toFixed(2))} л`
);

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
  if (!unit) {
    return `${value}`;
  }
  // unit — из закрытого InventoryUnit enum; неопознанное значение (легаси/чужой
  // формат) — fallback на сырую строку, не падаем.
  const parsedUnit = parseInventoryUnit(unit);
  const unitLabel = parsedUnit ? formatInventoryUnitLabel(parsedUnit, Number(value)) : unit;
  return `${value} ${unitLabel}`;
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

// Грубая поправка температуры воды для затирания: вода остывает при засыпи
// солода, поэтому греть нужно чуть выше целевой температуры первой паузы. Точный
// расчёт зависит от гидромодуля и материала оборудования — для гида-ориентира
// достаточно фиксированной поправки.
const STRIKE_TEMP_OFFSET_C = 4;

// Аккуратное число для веса засыпи: без хвостовых нулей (как fmtAmount выше).
const fmtGrainKg = (kg: number | null): string | null => (
  kg == null ? null : `${Number(kg.toFixed(3))} кг`
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
  const chill: BrewDayStep[] = [];
  const fermentation: BrewDayStep[] = [];

  // Прекомпьют водного движка (см. buildBrewPlanSnapshot/buildWaterSchedule) —
  // соли/кислоты затора и промывки + целевой pH затора. null для старых
  // снапшотов и рецептов без включённой водоподготовки: шаги воды просто не
  // рендерятся, без поломки остального гида.
  const waterSchedule = snapshot.waterSchedule;

  // Дозы соли/кислоты одной строкой для detail шага, в формате «Гипс 1.2 г».
  const fmtDoseLine = (label: string, amount: number, unitLabel: string): string => `${label} ${amount} ${unitLabel}`;

  // --- Затор: подготовка (нагрев воды + засыпь) → паузы (таймеры) + засыпи стадии
  // mash → промывка/фильтрация. Подготовительные и завершающие шаги рендерятся,
  // только когда в снапшоте есть mash-паузы: экстрактным рецептам без затора
  // нечего греть/засыпать/промывать.
  if (snapshot.mashSteps.length > 0) {
    const firstMashRaw = snapshot.mashSteps[0];
    const firstPauseTempC = isRecord(firstMashRaw)
      ? readNumber(firstMashRaw, "targetTemperatureC", "temperatureC", "tempC")
      : null;
    const waterPlanMeta = isRecord(snapshot.waterPlanMeta) ? snapshot.waterPlanMeta : null;
    const mashWaterVolumeL = waterPlanMeta ? readNumber(waterPlanMeta, "mashWaterVolumeL") : null;
    const strikeTempC = firstPauseTempC != null ? firstPauseTempC + STRIKE_TEMP_OFFSET_C : null;

    // id "mash:strike"/"mash:dough-in" синтетические — не коллидируют с id пауз
    // (`mash:<id>` из snapshot.mashSteps, приходят из recipe-designer и не несут
    // служебных слов strike/dough-in/lauter).
    mash.push({
      id: "mash:strike",
      stage: "mash",
      kind: "task",
      title: "Нагрейте воду",
      detail: joinDetail(fmtLiters(mashWaterVolumeL), strikeTempC != null ? `до ≈${Math.round(strikeTempC)} °C` : null),
      durationSeconds: null,
      temperatureC: strikeTempC
    });

    // Соли/кислота затора — до засыпи солода: их вносят в заторную воду ещё до
    // дробины (см. buildWaterSchedule в brew-plan.ts).
    if (waterSchedule && waterSchedule.mashSalts.length > 0) {
      mash.push({
        id: "mash:water-salts",
        stage: "mash",
        kind: "addition",
        title: "Внесите соли в воду",
        detail: waterSchedule.mashSalts.map((salt) => fmtDoseLine(salt.label, salt.grams, "г")).join(" · "),
        durationSeconds: null,
        temperatureC: null
      });
    }

    if (waterSchedule && waterSchedule.mashAcid) {
      mash.push({
        id: "mash:acid",
        stage: "mash",
        kind: "addition",
        title: "Подкислите затор",
        detail: fmtDoseLine(waterSchedule.mashAcid.label, waterSchedule.mashAcid.ml, "мл"),
        durationSeconds: null,
        temperatureC: null
      });
    }

    mash.push({
      id: "mash:dough-in",
      stage: "mash",
      kind: "task",
      title: "Засыпьте солод",
      detail: fmtGrainKg(snapshot.grainBillTotalKg),
      durationSeconds: null,
      temperatureC: null
    });

    // Проверка pH затора — после засыпи солода (только тогда pH затора вообще
    // существует), рендерится всегда при наличии прекомпьюта воды, даже если
    // солей/кислоты вносить не нужно (профиль воды и так в норме).
    if (waterSchedule) {
      mash.push({
        id: "mash:ph-check",
        stage: "mash",
        kind: "task",
        title: "Проверьте pH затора",
        detail: waterSchedule.targetMashPh != null ? `цель ${waterSchedule.targetMashPh}` : null,
        durationSeconds: null,
        temperatureC: null
      });
    }
  }

  // Паузы затора (таймеры).
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

  // Промывка/фильтрация — последний шаг группы затора (id "mash:lauter", см.
  // комментарий выше про отсутствие коллизий с id пауз).
  if (snapshot.mashSteps.length > 0) {
    const waterPlanMeta = isRecord(snapshot.waterPlanMeta) ? snapshot.waterPlanMeta : null;
    const spargeWaterVolumeL = waterPlanMeta ? readNumber(waterPlanMeta, "spargeWaterVolumeL") : null;

    // Соли/кислота промывочной воды — готовятся перед промывкой, а не в момент
    // самой промывки.
    if (waterSchedule && (waterSchedule.spargeSalts.length > 0 || waterSchedule.spargeAcid)) {
      const spargeDetail = joinDetail(
        waterSchedule.spargeSalts.length > 0
          ? waterSchedule.spargeSalts.map((salt) => fmtDoseLine(salt.label, salt.grams, "г")).join(" · ")
          : null,
        waterSchedule.spargeAcid ? fmtDoseLine(waterSchedule.spargeAcid.label, waterSchedule.spargeAcid.ml, "мл") : null
      );
      mash.push({
        id: "mash:sparge-water",
        stage: "mash",
        kind: "addition",
        title: "Подготовьте промывочную воду",
        detail: spargeDetail,
        durationSeconds: null,
        temperatureC: null
      });
    }

    mash.push({
      id: "mash:lauter",
      stage: "mash",
      kind: "task",
      title: "Промывка и фильтрация",
      detail: spargeWaterVolumeL != null ? `промывочная вода ${Number(spargeWaterVolumeL.toFixed(2))} л` : null,
      durationSeconds: null,
      temperatureC: null
    });
  }

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
          temperatureC: null,
          // Момент засыпи «за N мин до конца» — в секундах для живого отсчёта от
          // таймера кипячения. null (нет тайминга) → «в конце», считаем 0.
          boilSecondsBeforeEnd: timing != null ? Math.max(0, Math.round(timing * 60)) : 0
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

  // --- Охлаждение: синтетический шаг между вирпулом и брожением. Появляется
  // только если было тепло (кипячение/вирпул) — иначе охлаждать нечего. Цель —
  // температура внесения дрожжей из плана брожения (если задана).
  const ferment = snapshot.fermentationPlan;
  if (boil.length > 0 || whirlpool.length > 0) {
    const pitchTempC = isRecord(ferment) ? readNumber(ferment, "primaryTemperatureC") : null;
    chill.push({
      id: "chill:target",
      stage: "chill",
      kind: "task",
      title: "Охладите сусло",
      detail: pitchTempC != null ? `до ${pitchTempC} °C` : "до температуры внесения дрожжей",
      durationSeconds: null,
      temperatureC: pitchTempC
    });
  }

  // --- Брожение: одна отметка с целевой температурой/длительностью ---
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
        title: "Колд-краш",
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
        title: "Выдержка",
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
  pushGroup("chill", chill);
  pushGroup("fermentation", fermentation);
  pushGroup("packaging", packaging);
  return groups;
};

// --- Акты и курсор гида ------------------------------------------------------
// Страница партии — машина состояний: статус варки задаёт «акт», акт задаёт, какие
// этапы гида показываются как «сейчас». Чистые хелперы (без БД/React/времени).

/** Акт страницы по статусу партии. */
export const brewDayActForStatus = (status: BrewBatchStatus): BrewDayAct => {
  switch (status) {
    case "planned":
      return "prep";
    case "brewing":
      return "brewday";
    case "fermenting":
      return "fermentation";
    case "completed":
      return "done";
    case "cancelled":
      return "archived";
  }
};

/**
 * Какой замер ждёт журнал в этом акте. В подготовке замеров ещё нет, в итоге и
 * архиве журнал уже закрыт — подсказывать в поле плотности нечего ("any").
 */
export const brewMeasurementKindForAct = (act: BrewDayAct): BrewMeasurementKind => {
  switch (act) {
    case "brewday":
      return "og";
    case "fermentation":
      return "fg";
    case "prep":
    case "done":
    case "archived":
      return "any";
  }
};

// Типичные плотности домашнего пива — запасная подсказка, когда у партии нет
// целей рецепта (варка без рецепта: brewPlanSnapshot есть, target — null).
const TYPICAL_OG_SG = 1.05;
const TYPICAL_FG_SG = 1.012;

/**
 * Подсказка (placeholder) поля плотности: цель рецепта по контексту акта, иначе
 * типичное значение. null — подсказки нет: в итоге/архиве/на устройстве замер
 * вносят по факту, а не «примерно как в плане».
 */
export const resolveBrewGravityPlaceholderSg = (
  kind: BrewMeasurementKind,
  target: BrewMeasurementSummary["target"]
): number | null => {
  if (kind === "og") {
    return target?.og ?? TYPICAL_OG_SG;
  }
  if (kind === "fg") {
    return target?.fg ?? TYPICAL_FG_SG;
  }
  return null;
};

// К какому акту относится этап гида. Затор→охлаждение — варочный день; брожение и
// розлив — акт брожения. done/archived/prep рендерят гид целиком (read-only/превью).
const STAGE_ACT: Record<BrewDayStage, "brewday" | "fermentation"> = {
  mash: "brewday",
  boil: "brewday",
  whirlpool: "brewday",
  chill: "brewday",
  fermentation: "fermentation",
  packaging: "fermentation"
};

export const stageToAct = (stage: BrewDayStage): "brewday" | "fermentation" => STAGE_ACT[stage];

/** Этапы гида, относящиеся к акту (в каноническом порядке). */
export const groupsForAct = (
  groups: BrewDayStageGroup[],
  act: "brewday" | "fermentation"
): BrewDayStageGroup[] => groups.filter((group) => stageToAct(group.stage) === act);

/**
 * Курсор акта: первый не-done шаг = «сейчас», второй = «следующий». actComplete —
 * все шаги акта отмечены (сигнал показать CTA перехода в следующий статус).
 */
export const resolveBrewDayCursor = (
  groups: BrewDayStageGroup[],
  progress: BrewDayProgress,
  act: "brewday" | "fermentation"
): BrewDayCursor => {
  const steps = groupsForAct(groups, act).flatMap((group) => group.steps);
  let current: BrewDayStep | null = null;
  let next: BrewDayStep | null = null;
  let doneCount = 0;
  for (const step of steps) {
    if (progress.steps[step.id]?.done) {
      doneCount += 1;
      continue;
    }
    if (!current) {
      current = step;
    } else if (!next) {
      next = step;
    }
  }
  return {
    current,
    next,
    actComplete: steps.length > 0 && doneCount === steps.length,
    doneCount,
    total: steps.length
  };
};

/**
 * Последний отмеченный (done) шаг акта — кандидат для отката «Вернуть шаг».
 * Идём в порядке обхода групп акта (как в resolveBrewDayCursor), а не по времени
 * отметки: так откат предсказуемо снимает именно шаг, идущий перед курсором.
 * null — в акте ещё нет ни одного done-шага.
 */
export const resolveLastDoneStep = (
  groups: BrewDayStageGroup[],
  progress: BrewDayProgress,
  act: "brewday" | "fermentation"
): BrewDayStep | null => {
  const steps = groupsForAct(groups, act).flatMap((group) => group.steps);
  let last: BrewDayStep | null = null;
  for (const step of steps) {
    if (progress.steps[step.id]?.done) {
      last = step;
    }
  }
  return last;
};

/** Сводка плана варочного дня для акта подготовки (этапы + таймеры + итоги). */
export const summarizeBrewDayPlan = (groups: BrewDayStageGroup[]): BrewDayPlanSummary => {
  const stages = groups.map((group) => ({
    stage: group.stage,
    label: group.label,
    stepCount: group.steps.length,
    timerSeconds: group.steps.reduce((sum, step) => sum + (step.durationSeconds ?? 0), 0)
  }));
  return {
    stages,
    totalSteps: stages.reduce((sum, stage) => sum + stage.stepCount, 0),
    totalTimerSeconds: stages.reduce((sum, stage) => sum + stage.timerSeconds, 0)
  };
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

// --- Завершение партии (акт «Брожение») ---------------------------------------
// Здесь, а не в completion.ts: тот модуль через recipes/visibility тянет @nb/db,
// а подтверждение нужно клиентской доске брожения.

/** Подтверждение перехода партии в «Завершена» (см. buildFinishBrewConfirm). */
export type BrewFinishConfirm = {
  title: string;
  description: string;
  tone: "primary" | "danger";
};

/**
 * Текст подтверждения «Завершить партию». Спрашиваем ВСЕГДА: переход закрывает
 * акт брожения (журнал FG, шаги розлива) — раньше на 1-м дне из 10 он случался
 * одним кликом без вопроса. Тон danger — только когда завершают раньше плана:
 * это не обычный путь, но и не деструктив, поэтому текст честный, а не пугающий.
 * plannedDays нет (старые партии, план без длительности) — деградируем до «День N»,
 * без «из M». Брожение дольше плана — тоже не деструктив, тон остаётся primary.
 */
export const buildFinishBrewConfirm = ({
  fermentDayN,
  plannedDays,
  undoneSteps
}: {
  fermentDayN: number | null;
  plannedDays: number | null;
  undoneSteps: number;
}): BrewFinishConfirm => {
  const daysLeft = fermentDayN != null && plannedDays != null && fermentDayN < plannedDays
    ? plannedDays - fermentDayN
    : null;
  const isOver = fermentDayN != null && plannedDays != null && fermentDayN > plannedDays;
  const early = daysLeft != null;
  const parts: string[] = [];

  if (isOver) {
    parts.push(`Брожение идёт день ${fermentDayN} — дольше плана (${plannedDays} ${pluralize(plannedDays as number, ["день", "дня", "дней"])}).`);
  } else if (fermentDayN != null) {
    const day = plannedDays != null ? `день ${fermentDayN} из ${plannedDays}` : `день ${fermentDayN}`;
    parts.push(daysLeft != null
      ? `Брожение идёт: ${day}, по плану ещё ${daysLeft} ${pluralize(daysLeft, ["день", "дня", "дней"])}.`
      : `Брожение идёт: ${day}.`);
  }

  if (undoneSteps > 0) {
    parts.push(
      `Не отмечено ${undoneSteps} ${pluralize(undoneSteps, ["шаг", "шага", "шагов"])} брожения и розлива.`
    );
  }

  parts.push("Партия перейдёт в «Завершена», подведём итог. Этап можно вернуть через меню ⋯ → «Изменить этап».");

  return {
    title: "Завершить партию?",
    description: parts.join(" "),
    tone: early ? "danger" : "primary"
  };
};
