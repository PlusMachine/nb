// Модель принудительной карбонизации в кеге.
//
// Единственный источник истины — полином равновесного давления P(T, V), тот же, что
// стоит за `calculateKegCarbonationPressure` (классическая keg-таблица). Прямое
// направление V(T, P), которым заливается таблица, — это аналитическая инверсия того же
// полинома (решение квадратного уравнения по V). Поэтому таблица и обратный расчёт
// физически не могут разойтись: обе стороны считают по одному уравнению.
//
// Температура — в °C, давление — избыточное (gauge) в PSI, объёмы CO2 безразмерны.

export const PSI_PER_BAR = 14.5037738; // 1 бар = 14.5037738 PSI
export const KPA_PER_PSI = 6.89475729;

export const barToPsi = (bar: number): number => bar * PSI_PER_BAR;
export const psiToBar = (psi: number): number => psi / PSI_PER_BAR;
export const celsiusToFahrenheit = (celsius: number): number => (celsius * 9) / 5 + 32;
export const fahrenheitToCelsius = (fahrenheit: number): number => ((fahrenheit - 32) * 5) / 9;

// Коэффициенты keg-полинома (T в °F, V безразмерно) → P в PSI (gauge).
const A_V2 = -0.0684226;
const B_TV = 0.173354;
const B_V = 4.24267;
const C0 = -16.6999;
const C_T = -0.0101059;
const C_T2 = 0.00116512;

/** Равновесное давление (PSI, gauge) для температуры пива (°C) и целевых объёмов CO2. */
export const kegPressurePsi = (tempC: number, volumes: number): number => {
  const t = celsiusToFahrenheit(tempC);
  return C0 + C_T * t + C_T2 * t * t + B_TV * t * volumes + B_V * volumes + A_V2 * volumes * volumes;
};

/**
 * Инверсия `kegPressurePsi`: объёмы CO2 для температуры (°C) и избыточного давления (PSI).
 * Полином квадратичен по V; на физическом диапазоне давление монотонно растёт с объёмами
 * (вершина параболы лежит далеко за пределами реальных значений V), поэтому нужный корень —
 * тот, что берётся со знаком «+» перед корнем дискриминанта. Возвращает непрерывное
 * значение (может быть отрицательным при недостижимой комбинации) — округление и клэмп на
 * стороне отображения.
 */
export const kegCo2Volumes = (tempC: number, pressurePsi: number): number => {
  const t = celsiusToFahrenheit(tempC);
  const a = A_V2;
  const b = B_TV * t + B_V;
  const c = C0 + C_T * t + C_T2 * t * t - pressurePsi;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return NaN;
  }
  return (-b + Math.sqrt(discriminant)) / (2 * a);
};

// Диапазоны сетки таблицы. Вынесены в константы — при желании расширяются без правок UI.
// Верх температурной шкалы 20 °C — чтобы таблица покрывала шпунтование при температуре
// брожения эля, а не только холодную карбонизацию в камере. Низ −2 °C — карбонизация во
// время холодного созревания лагера и cold crash идут при −1…0 °C; ниже −2 °C пиво обычной
// крепости уже подмерзает, так что дальше шкалу опускать незачем.
export const CARBONATION_TEMP_RANGE_C = { min: -2, max: 20, step: 1 } as const;
export const CARBONATION_PRESSURE_RANGE_BAR = { min: 0.4, max: 2.0, step: 0.1 } as const;

export type Co2Zone = "low" | "standard" | "lively" | "high";

// Границы зон карбонизации по объёмам CO2: <2.0 слабая · [2.0,2.6) стандартная ·
// [2.6,3.4] живая · >3.4 высокая.
export const co2Zone = (volumes: number): Co2Zone => {
  if (volumes < 2.0) return "low";
  if (volumes < 2.6) return "standard";
  if (volumes <= 3.4) return "lively";
  return "high";
};

export type CarbonationStyleRange = {
  id: string;
  label: string;
  minVolumes: number;
  maxVolumes: number;
};

// Ориентировочные диапазоны объёмов CO2 по группам стилей. Живут в ядре, а не в компоненте,
// чтобы у карбонизации был один источник истины (BJCP-фиттинг объёмы CO2 не покрывает).
export const CARBONATION_STYLE_RANGES: CarbonationStyleRange[] = [
  { id: "english-bitter", label: "Английский биттер", minVolumes: 1.5, maxVolumes: 2.0 },
  { id: "porter-stout", label: "Портер / стаут", minVolumes: 1.8, maxVolumes: 2.3 },
  { id: "lager-pilsner", label: "Лагер / пилснер", minVolumes: 2.4, maxVolumes: 2.6 },
  { id: "ipa-pale-ale", label: "IPA / пейл-эль", minVolumes: 2.3, maxVolumes: 2.7 },
  { id: "saison", label: "Сэзон", minVolumes: 3.0, maxVolumes: 4.0 },
  { id: "hefeweizen", label: "Хефевайцен", minVolumes: 3.5, maxVolumes: 4.5 }
];

/** Стили, чей диапазон объёмов CO2 включает переданное значение (границы включительно). */
export const matchCarbonationStyles = (volumes: number): CarbonationStyleRange[] =>
  CARBONATION_STYLE_RANGES.filter((range) => volumes >= range.minVolumes && volumes <= range.maxVolumes);

export const carbonationStyleById = (id: string): CarbonationStyleRange | null =>
  CARBONATION_STYLE_RANGES.find((range) => range.id === id) ?? null;
