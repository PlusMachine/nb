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
