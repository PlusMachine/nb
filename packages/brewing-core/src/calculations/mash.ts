import { roundTo } from "../units";

// Metric equivalent of Palmer's (How to Brew) grain specific heat constant of 0.2
// BTU/(lb·°F), expressed as litres-of-water-equivalent per kg of grain per °C:
// 0.2 qt/(lb·°F) ≈ 0.41 L/(kg·°C).
const GRAIN_SPECIFIC_HEAT_L_PER_KG_PER_C = 0.41;

export interface StrikeWaterInput {
  grainKg: number;
  mashWaterL: number;
  grainTempC: number;
  targetTempC: number;
  /** Thermal mass of the mash tun, expressed as an equivalent litres of water. */
  tunThermalMassL?: number;
  /** Starting temperature of the tun itself; defaults to the grain temperature. */
  tunTempC?: number;
}

export interface StrikeWaterResult {
  strikeTempC: number;
  mashThicknessLPerKg: number;
  warnings: string[];
}

/**
 * Palmer's strike water temperature equation (How to Brew), converted to metric.
 * Heat balance: mashWaterL·(Tstrike − Ttarget) = grain heat gain + tun heat gain.
 */
export const calculateStrikeWater = (input: StrikeWaterInput): StrikeWaterResult => {
  // mashWaterL — делитель формулы; <=0 даёт Infinity/NaN, а не осмысленную температуру.
  // Отрицательный вес зерна тоже бессмысленный вход — оба случая бэйлаутим до арифметики.
  if (input.mashWaterL <= 0 || input.grainKg < 0) {
    return {
      strikeTempC: 0,
      mashThicknessLPerKg: 0,
      warnings: ["mash_water_required"]
    };
  }

  const tunThermalMassL = input.tunThermalMassL ?? 0;
  const tunTempC = input.tunTempC ?? input.grainTempC;

  const grainHeatL = GRAIN_SPECIFIC_HEAT_L_PER_KG_PER_C * input.grainKg * (input.targetTempC - input.grainTempC);
  const tunHeatL = tunThermalMassL * (input.targetTempC - tunTempC);
  const strikeTempC = input.targetTempC + (grainHeatL + tunHeatL) / input.mashWaterL;
  const mashThicknessLPerKg = input.grainKg > 0 ? input.mashWaterL / input.grainKg : 0;

  const warnings: string[] = [];
  if (strikeTempC > 100) {
    warnings.push("strike_temp_above_boiling");
  } else if (strikeTempC > 98) {
    warnings.push("strike_temp_near_boiling");
  }
  if (mashThicknessLPerKg < 2 || mashThicknessLPerKg > 5) {
    warnings.push("mash_thickness_unusual");
  }

  return {
    strikeTempC: roundTo(strikeTempC, 1),
    mashThicknessLPerKg: roundTo(mashThicknessLPerKg, 2),
    warnings
  };
};

export interface InfusionStepInput {
  grainKg: number;
  currentMashWaterL: number;
  currentTempC: number;
  targetTempC: number;
  /** Temperature of the boiling infusion water added to the mash; defaults to 98°C. */
  infusionWaterTempC?: number;
}

export interface InfusionStepResult {
  infusionVolumeL: number;
  newTotalWaterL: number;
  newThicknessLPerKg: number;
  warnings: string[];
}

/**
 * Single heat-balance equation behind every infusion in this module (up or down):
 * Wa = (Tto − Tfrom)·(grain heat capacity + waterL) / (TaddWater − Tto).
 * Going up, TaddWater is boiling water hotter than the target. Going down, TaddWater
 * is cold water colder than the target — both numerator and denominator flip sign and
 * the result stays positive. No rounding/clamping here: callers that fold this over
 * several steps (calculateStepMash) need the unrounded running total so error doesn't
 * accumulate step to step.
 */
const rawWaterAddition = (
  grainKg: number,
  waterL: number,
  fromTempC: number,
  toTempC: number,
  addWaterTempC: number
): number =>
  ((toTempC - fromTempC) * (GRAIN_SPECIFIC_HEAT_L_PER_KG_PER_C * grainKg + waterL)) / (addWaterTempC - toTempC);

/**
 * Palmer's infusion step-up equation (How to Brew), converted to metric:
 * Wa = (Ttarget − Tcurrent)·(grain heat capacity + current mash water) / (Tinfusion − Ttarget).
 */
export const calculateInfusionStep = (input: InfusionStepInput): InfusionStepResult => {
  const infusionWaterTempC = input.infusionWaterTempC ?? 98;
  const warnings: string[] = [];

  if (input.targetTempC <= input.currentTempC) {
    warnings.push("infusion_step_downward");
  }

  // Infusion water must be hotter than the target — otherwise it cannot raise the
  // mash temperature at all and the equation's denominator is non-positive.
  if (infusionWaterTempC <= input.targetTempC) {
    warnings.push("infusion_temp_not_above_target");
    return {
      infusionVolumeL: 0,
      newTotalWaterL: roundTo(input.currentMashWaterL, 2),
      newThicknessLPerKg: roundTo(input.grainKg > 0 ? input.currentMashWaterL / input.grainKg : 0, 2),
      warnings
    };
  }

  const rawInfusionVolumeL = rawWaterAddition(
    input.grainKg,
    input.currentMashWaterL,
    input.currentTempC,
    input.targetTempC,
    infusionWaterTempC
  );
  // A downward or flat step needs no infusion at all rather than a negative volume.
  const infusionVolumeL = Math.max(0, rawInfusionVolumeL);

  if (input.currentMashWaterL > 0 && infusionVolumeL > input.currentMashWaterL * 0.6) {
    warnings.push("infusion_volume_excessive");
  }

  const newTotalWaterL = input.currentMashWaterL + infusionVolumeL;

  return {
    infusionVolumeL: roundTo(infusionVolumeL, 1),
    newTotalWaterL: roundTo(newTotalWaterL, 2),
    newThicknessLPerKg: roundTo(input.grainKg > 0 ? newTotalWaterL / input.grainKg : 0, 2),
    warnings
  };
};

export interface CoolingInfusionInput {
  grainKg: number;
  currentMashWaterL: number;
  currentTempC: number;
  targetTempC: number;
  /** Temperature of the cold water added to cool the mash; defaults to 15°C. */
  coldWaterTempC?: number;
}

export interface CoolingInfusionResult {
  coldWaterVolumeL: number;
  newTotalWaterL: number;
  newThicknessLPerKg: number;
  warnings: string[];
}

/**
 * The inverse of calculateInfusionStep: cooling the mash down with cold water instead
 * of raising it with boiling water. Same heat-balance equation, mirrored — the target
 * is now below the current temperature and the added water is below the target.
 */
export const calculateCoolingInfusion = (input: CoolingInfusionInput): CoolingInfusionResult => {
  const coldWaterTempC = input.coldWaterTempC ?? 15;
  const warnings: string[] = [];

  const currentThicknessLPerKg = input.grainKg > 0 ? input.currentMashWaterL / input.grainKg : 0;

  if (input.targetTempC >= input.currentTempC) {
    warnings.push("cooling_step_not_downward");
    return {
      coldWaterVolumeL: 0,
      newTotalWaterL: roundTo(input.currentMashWaterL, 2),
      newThicknessLPerKg: roundTo(currentThicknessLPerKg, 2),
      warnings
    };
  }

  // Cold water must be colder than the target — otherwise it cannot pull the mash
  // temperature down at all and the equation's denominator is non-negative.
  if (coldWaterTempC >= input.targetTempC) {
    warnings.push("cooling_water_not_below_target");
    return {
      coldWaterVolumeL: 0,
      newTotalWaterL: roundTo(input.currentMashWaterL, 2),
      newThicknessLPerKg: roundTo(currentThicknessLPerKg, 2),
      warnings
    };
  }

  const rawColdWaterVolumeL = rawWaterAddition(
    input.grainKg,
    input.currentMashWaterL,
    input.currentTempC,
    input.targetTempC,
    coldWaterTempC
  );
  const coldWaterVolumeL = Math.max(0, rawColdWaterVolumeL);

  if (input.currentMashWaterL > 0 && coldWaterVolumeL > input.currentMashWaterL * 0.6) {
    warnings.push("cooling_volume_excessive");
  }

  const newTotalWaterL = input.currentMashWaterL + coldWaterVolumeL;

  return {
    // Точность объёма долива — 1 знак, как в calculateInfusionStep: десятые литра — предел
    // честности модели без теплопотерь в воздух; сотые были бы ложной точностью.
    coldWaterVolumeL: roundTo(coldWaterVolumeL, 1),
    newTotalWaterL: roundTo(newTotalWaterL, 2),
    newThicknessLPerKg: roundTo(input.grainKg > 0 ? newTotalWaterL / input.grainKg : 0, 2),
    warnings
  };
};

export interface StepMashPauseInput {
  targetTempC: number;
}

export interface StepMashInput {
  grainKg: number;
  startingWaterL: number;
  startingTempC: number;
  pauses: StepMashPauseInput[];
  /** Temperature of the infusion water added at every step; defaults to 98°C. */
  infusionWaterTempC?: number;
}

export interface StepMashStepResult {
  targetTempC: number;
  infusionVolumeL: number;
  totalWaterAfterL: number;
  thicknessAfterL: number;
  warnings: string[];
}

export interface StepMashResult {
  steps: StepMashStepResult[];
  totalInfusionL: number;
  totalWaterL: number;
  finalThicknessLPerKg: number;
  warnings: string[];
}

/**
 * A multi-step (decoction-free) infusion mash: folds calculateInfusionStep's equation
 * over a ladder of pauses. Water and temperature carry over unrounded from step to
 * step — each infusion is calculated against the mash volume already grown by every
 * infusion before it, not the original strike volume. Rounding happens only in the
 * numbers handed back for display.
 */
export const calculateStepMash = (input: StepMashInput): StepMashResult => {
  const infusionWaterTempC = input.infusionWaterTempC ?? 98;
  const { grainKg } = input;

  let runningWaterL = input.startingWaterL;
  let runningTempC = input.startingTempC;

  const steps: StepMashStepResult[] = [];
  const warnings: string[] = [];

  const addWarning = (code: string) => {
    if (!warnings.includes(code)) {
      warnings.push(code);
    }
  };

  for (const pause of input.pauses) {
    const stepWarnings: string[] = [];

    const downwardStep = pause.targetTempC <= runningTempC;
    const waterNotAboveTarget = infusionWaterTempC <= pause.targetTempC;
    if (downwardStep) {
      stepWarnings.push("infusion_step_downward");
    }
    if (waterNotAboveTarget) {
      stepWarnings.push("infusion_temp_not_above_target");
    }

    // Зеркало бэйлаутов calculateInfusionStep: нисходящая ступень — пассивное остывание без
    // долива, а вода не горячее цели затор не поднимет. Считать уравнение в этих случаях
    // нельзя, а не просто бессмысленно: при равенстве температур знаменатель нулевой, и
    // Infinity заразил бы runningWaterL и все последующие ступени; при обеих инверсиях
    // сразу (нисходящая пауза + вода холоднее её) знаменатель и числитель отрицательны,
    // и Math.max(0, ...) пропустил бы положительный «долив», противоречащий предупреждениям.
    const volumeL = downwardStep || waterNotAboveTarget
      ? 0
      : Math.max(0, rawWaterAddition(grainKg, runningWaterL, runningTempC, pause.targetTempC, infusionWaterTempC));

    if (runningWaterL > 0 && volumeL > runningWaterL * 0.6) {
      stepWarnings.push("infusion_volume_excessive");
    }

    runningWaterL += volumeL;
    runningTempC = pause.targetTempC;

    steps.push({
      targetTempC: pause.targetTempC,
      // 1 знак — как у одиночного долива (см. calculateCoolingInfusion): единая точность
      // инструкции «сколько долить» во всех режимах калькулятора.
      infusionVolumeL: roundTo(volumeL, 1),
      totalWaterAfterL: roundTo(runningWaterL, 2),
      thicknessAfterL: roundTo(grainKg > 0 ? runningWaterL / grainKg : 0, 2),
      warnings: stepWarnings
    });
    stepWarnings.forEach(addWarning);
  }

  const finalThicknessLPerKg = grainKg > 0 ? runningWaterL / grainKg : 0;
  if (finalThicknessLPerKg < 2 || finalThicknessLPerKg > 5) {
    addWarning("mash_thickness_unusual");
  }

  return {
    steps,
    totalInfusionL: roundTo(runningWaterL - input.startingWaterL, 1),
    totalWaterL: roundTo(runningWaterL, 2),
    finalThicknessLPerKg: roundTo(finalThicknessLPerKg, 2),
    warnings
  };
};
