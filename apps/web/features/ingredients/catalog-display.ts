import type { UserCatalogIngredientDto, IngredientTechnicalData } from "./contracts";

export const canonicalManufacturerLabel = (value: string | null | undefined): string | null => {
  const label = value?.trim();
  if (!label || ["--", "—", "-", "generic"].includes(label.toLowerCase())) return null;
  return /^(the\s+)?swaen$/i.test(label) ? "The Swaen" : label;
};

export const visibleCatalogAliases = (item: Pick<UserCatalogIngredientDto, "aliases" | "primaryLabelRu" | "secondaryLabelRu" | "category" | "subtype" | "type" | "technicalData">) => {
  const seen = new Set([item.primaryLabelRu, item.secondaryLabelRu].filter(Boolean).map((name) => name!.trim().toLowerCase()));
  const data = item.technicalData;
  const technical = new Set([item.type, item.category, item.subtype,
    data?.type === "consumable" ? data.pickerGroup : null,
    data?.type === "consumable" ? data.familyKey : null].filter((value): value is string => typeof value === "string").map((value) => value.toLowerCase()));
  return item.aliases.flatMap((entry) => {
    const alias = entry.alias.trim(), normalized = alias.toLowerCase();
    const seed = entry.source?.startsWith("seed");
    if (!alias || seen.has(normalized) || (seed && (entry.source === "seed_priority_term" || technical.has(normalized) || alias.includes("_")))) return [];
    seen.add(normalized); return [alias];
  });
};

const aromaRu: Record<string, string> = {
  apple: "Яблоко", apricot: "Абрикос", bergamot: "Бергамот", berries: "Ягоды",
  "black currant": "Чёрная смородина", "black pepper": "Чёрный перец", "black tea": "Чёрный чай",
  blackberry: "Ежевика", blueberry: "Черника", bubblegum: "Жевательная резинка", candy: "Конфеты",
  "candied lime": "Засахаренный лайм", cantaloupe: "Дыня канталупа", caramel: "Карамель", cedar: "Кедр",
  "citrus peel": "Цитрусовая цедра", "citrus rind": "Цитрусовая корка", citrusy: "Цитрусовый",
  coconut: "Кокос", cucumber: "Огурец", currant: "Смородина", curry: "Карри",
  dank: "Насыщенный травяной (dank)", "dark fruit": "Тёмные фрукты", dill: "Укроп", "dried fruit": "Сухофрукты",
  elderflower: "Цветы бузины", fennel: "Фенхель", fruit: "Фрукты", garlic: "Чеснок", geranium: "Герань",
  ginger: "Имбирь", gooseberry: "Крыжовник", "green tea": "Зелёный чай", guava: "Гуава", hay: "Сено",
  honey: "Мёд", "honeydew melon": "Медовая дыня", incense: "Благовония", juniper: "Можжевельник",
  lavender: "Лаванда", "lemon balm": "Мелисса", "lemon zest": "Лимонная цедра", lemongrass: "Лемонграсс",
  "light citrus": "Лёгкий цитрусовый", lychee: "Личи", mandarin: "Мандарин", menthol: "Ментол",
  mint: "Мята", mojito: "Мохито", onion: "Лук", "orange zest": "Апельсиновая цедра", papaya: "Папайя",
  pear: "Груша", pepper: "Перец", "pine resin": "Сосновая смола", "pink grapefruit": "Розовый грейпфрут",
  "pinot gris": "Виноград Пино гри", plum: "Слива", "powdered sugar": "Сахарная пудра", raisin: "Изюм",
  raspberry: "Малина", "red berries": "Красные ягоды", "red berry": "Красные ягоды", "red currant": "Красная смородина",
  "red grapefruit": "Красный грейпфрут", resin: "Смола", rose: "Роза", "rose petals": "Лепестки розы", sage: "Шалфей",
  "sauvignon blanc": "Виноград Совиньон блан", smoky: "Дымный", spice: "Пряности", "star anise": "Бадьян",
  strawberry: "Клубника", sweet: "Сладковатый", "sweet aromatic": "Сладковатый аромат", "sweet citrus": "Сладкие цитрусовые",
  "sweet fruit": "Сладкие фрукты", "sweet melon": "Сладкая дыня", tangerine: "Мандарин", tarragon: "Эстрагон",
  tea: "Чай", thyme: "Тимьян", tobacco: "Табак", "tropical fruit": "Тропические фрукты", vanilla: "Ваниль",
  vegetal: "Растительный", watermelon: "Арбуз", "white wine": "Белое вино", "yuzu fruit": "Юдзу", "and floral rose": "Цветочный, роза",
  citrus: "Цитрусовый", tropical: "Тропический", fruity: "Фруктовый", floral: "Цветочный",
  spicy: "Пряный", woody: "Древесный", pine: "Хвойный", resinous: "Смолистый",
  herbal: "Травяной", grassy: "Травянистый", earthy: "Землистый", berry: "Ягодный",
  stonefruit: "Косточковые фрукты", "stone fruit": "Косточковые фрукты", melon: "Дыня",
  grapefruit: "Грейпфрут", lime: "Лайм", lemon: "Лимон", orange: "Апельсин", mango: "Манго",
  passionfruit: "Маракуйя", "passion fruit": "Маракуйя", pineapple: "Ананас", peach: "Персик"
};
export const translateHopAroma = (value: string) => aromaRu[value.trim().toLowerCase()] ?? value;

export const formatCatalogColorEbc = (data: IngredientTechnicalData | null | undefined): string | null => {
  if (data?.type !== "malt" && data?.type !== "fermentable") return null;
  const min = typeof data.colorEbcMin === "number" ? data.colorEbcMin : null;
  const max = typeof data.colorEbcMax === "number" ? data.colorEbcMax : null;
  const format = (n: number) => Number(n.toFixed(1)).toLocaleString("ru-RU");
  if (min != null && max != null && min > max) return null;
  if (min != null && max != null) return min === max ? `${format(min)} EBC` : `${format(min)}–${format(max)} EBC`;
  if (min != null) return `от ${format(min)} EBC`;
  if (max != null) return `до ${format(max)} EBC`;
  return null;
};
