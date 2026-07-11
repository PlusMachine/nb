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

  const grainHeatCapacityL = GRAIN_SPECIFIC_HEAT_L_PER_KG_PER_C * input.grainKg;
  const rawInfusionVolumeL =
    ((input.targetTempC - input.currentTempC) * (grainHeatCapacityL + input.currentMashWaterL)) /
    (infusionWaterTempC - input.targetTempC);
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
