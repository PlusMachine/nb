type BeerColorEntry = {
  maxSrm: number;
  hex: string;
  label: string;
};

const SRM_COLOR_MAP: BeerColorEntry[] = [
  { maxSrm: 2, hex: "#F3F993", label: "Светло-соломенный" },
  { maxSrm: 3, hex: "#FFD878", label: "Соломенный" },
  { maxSrm: 4, hex: "#FFCA5A", label: "Светло-золотистый" },
  { maxSrm: 6, hex: "#FFBF42", label: "Золотистый" },
  { maxSrm: 9, hex: "#F8A600", label: "Насыщенно-золотистый" },
  { maxSrm: 12, hex: "#E58500", label: "Светло-янтарный" },
  { maxSrm: 15, hex: "#CF6900", label: "Янтарный" },
  { maxSrm: 18, hex: "#BB5100", label: "Тёмно-янтарный" },
  { maxSrm: 22, hex: "#A63E00", label: "Янтарно-коричневый" },
  { maxSrm: 27, hex: "#8B2E00", label: "Коричневый" },
  { maxSrm: 33, hex: "#6F1A07", label: "Тёмно-коричневый" },
  { maxSrm: 40, hex: "#3B0F0A", label: "Тёмно-коричневый" },
];

const DARKEST: Omit<BeerColorEntry, "maxSrm"> = { hex: "#1A0F0B", label: "Чёрный" };

const LIGHT_TEXT_THRESHOLD = 12;

export type BeerColor = { hex: string; label: string; textColor: string };

export function beerColorFromSrm(srm: number): BeerColor {
  const entry = SRM_COLOR_MAP.find((e) => srm < e.maxSrm) ?? DARKEST;
  return {
    hex: entry.hex,
    label: entry.label,
    textColor: srm >= LIGHT_TEXT_THRESHOLD ? "#ffffff" : "#1a1a1a",
  };
}

/**
 * Hex-цвет пива по SRM (для свотча/заливки карточки вместо фото).
 * Тонкая обёртка над {@link beerColorFromSrm} (та же палитра `SRM_COLOR_MAP`),
 * clamp обеспечивается фолбэком на `DARKEST` для высоких SRM.
 */
export function srmToHex(srm: number): string {
  return beerColorFromSrm(srm).hex;
}

/**
 * Цвет текста (светлый/тёмный), читаемый поверх свотча данного SRM.
 */
export function pickTextColorForSrm(srm: number): string {
  return beerColorFromSrm(srm).textColor;
}

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const hexToRgb = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/** Смешивает hex-цвет с целевым RGB на долю `amount` (0..1) → `rgb(...)`. */
const mixHex = (hex: string, target: [number, number, number], amount: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const mixChannel = (channel: number, towards: number) => clampChannel(channel + (towards - channel) * amount);
  return `rgb(${mixChannel(r, target[0])}, ${mixChannel(g, target[1])}, ${mixChannel(b, target[2])})`;
};

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

/** Мягкая цветовая заливка-обложка по SRM: лёгкий градиент вместо плоского цвета. */
export function srmToSoftGradient(srm: number): string {
  const base = srmToHex(srm);
  const light = mixHex(base, WHITE, 0.3);
  const deep = mixHex(base, BLACK, 0.16);
  return `linear-gradient(150deg, ${light} 0%, ${base} 55%, ${deep} 100%)`;
}

/**
 * Две конечные точки мягкой заливки по SRM для вертикального градиента бокала
 * ({@link BeerGlassIcon}, пропы `gradientFrom`/`gradientTo`): `from` — светлый верх
 * (0.3 к белому), `to` — тёмный низ (0.16 к чёрному). Те же коэффициенты, что и в
 * {@link srmToSoftGradient} — одна точка истины, без утечки `mixHex`/`WHITE`/`BLACK`.
 */
export function srmToGlassStops(srm: number): { from: string; to: string } {
  const base = srmToHex(srm);
  return {
    from: mixHex(base, WHITE, 0.3),
    to: mixHex(base, BLACK, 0.16)
  };
}

/** Нейтральная мягкая заливка для рецептов без указанного цвета. */
export const NEUTRAL_SOFT_GRADIENT = "linear-gradient(150deg, #f5f5f4 0%, #e7e5e4 60%, #d6d3d1 100%)";

export type SrmColorBand = {
  id: string;
  label: string;
  min: number;
  max: number;
};

/**
 * 7 крупных SRM-сегментов для фильтра цвета на витрине `/recipes` (клик по
 * сегменту ставит `colorMin`/`colorMax`). Границы — ориентир по `SRM_COLOR_MAP`.
 */
export const srmColorBands: SrmColorBand[] = [
  { id: "straw", label: "Соломенный", min: 0, max: 3 },
  { id: "gold", label: "Золотистый", min: 3, max: 6 },
  { id: "amber", label: "Янтарный", min: 6, max: 9 },
  { id: "copper", label: "Медный", min: 9, max: 14 },
  { id: "brown", label: "Коричневый", min: 14, max: 20 },
  { id: "dark", label: "Тёмный", min: 20, max: 30 },
  { id: "black", label: "Чёрный", min: 30, max: 80 }
];
