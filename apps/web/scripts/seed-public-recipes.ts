/**
 * Dev-only seed: наполняет публичную витрину `/recipes` реальными популярными
 * рецептами пива из `docs/recepty-podborka-30l.md` (клоны коммерческих сортов и
 * эталонные стилевые рецепты), пересчитанными на 30 л. Каждый рецепт несёт
 * атрибуцию первоисточника (`importMeta.sourceAttribution`: ссылка + площадка +
 * происхождение/автор), которая показывается блоком «Источник» на странице
 * рецепта. Все рецепты публикует единый аккаунт-куратор («admin»); реальное
 * авторство — в блоке «Источник». Плюс случайные сохранения («Избранное») и
 * оценки от dev-читателей — для ручного теста избранного, сортировок, поиска и
 * клонирования.
 *
 * Параметры (OG/FG/ABV/IBU/SRM) берутся из первоисточника и записываются
 * напрямую (перезапись после создания), т.к. это авторитетные числа. Параллельно
 * скрипт замеряет, что насчитал бы наш калькулятор по ингредиентам, и печатает
 * отчёт о расхождении (см. также docs/recipe-stats-divergence.md).
 *
 * Ингредиенты привязаны к каталогу (`ingredients`). Недостающие каноничные
 * позиции добавлены в каталог отдельно (см. ingredients/new/*_minimal_v2*.json).
 *
 * Идемпотентность: всё помечается importMeta.seedSource="demo-public-recipes";
 * повторный запуск удаляет прежние помеченные рецепты (сохранения/оценки уходят
 * каскадом) и пересоздаёт. Детерминированный PRNG → стабильный датасет.
 *
 * Запуск:  npm run seed:public
 *
 * Жёстко заблокирован в production / на нелокальной БД.
 */
import { db, eq, ingredients, inArray, recipes, sql, users } from "@nb/db";
import { parseServerEnv } from "@nb/shared";
import { writeFileSync } from "node:fs";

import { createRecipe, rateRecipe, setRecipeSave } from "../features/recipes/service";
import { buildCatalogIngredientLinkage } from "../features/ingredients/source-linkage";

const SEED_TAG = "demo-public-recipes";
const BATCH_L = 30;
const DEFAULT_EFFICIENCY = 72;

// ---------------------------------------------------------------------------
// Dev guard
// ---------------------------------------------------------------------------
const assertDevOnly = () => {
  const env = parseServerEnv(process.env);
  if (env.NODE_ENV === "production") {
    throw new Error("seed:public заблокирован в production.");
  }
  const url = env.DATABASE_URL;
  if (!(url.includes("localhost") || url.includes("127.0.0.1") || url.includes("postgres"))) {
    throw new Error("seed:public допускает только локальную БД (localhost/127.0.0.1/postgres).");
  }
};

// ---------------------------------------------------------------------------
// Детерминированный PRNG (mulberry32)
// ---------------------------------------------------------------------------
const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const rng = createRng(0x5eed_b33f);
const shuffle = <T,>(items: readonly T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
};
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
const randInt = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

// ---------------------------------------------------------------------------
// Аккаунты
// ---------------------------------------------------------------------------
// Это реальные подобранные рецепты, а не выдумка отдельных пользователей —
// поэтому единый аккаунт-куратор «публикует» их все, а реальное авторство
// (пивовар / площадка-первоисточник) отражается блоком «Источник»
// (importMeta.sourceAttribution), а не аккаунтом-автором.
const CURATOR = { email: "editorial@nb.local", displayName: "admin", role: "admin" } as const;

// Dev-аккаунты-читатели: используются ТОЛЬКО для генерации сохранений
// («Избранное») и оценок, чтобы можно было проверить сортировки
// «популярные»/«рейтинг». Авторами рецептов они не выступают и как авторы
// нигде не отображаются.
const READERS = [
  { email: "reader.alex@demo.local", displayName: "Алексей" },
  { email: "reader.maria@demo.local", displayName: "Мария" },
  { email: "reader.dmitry@demo.local", displayName: "Дмитрий" },
  { email: "reader.olga@demo.local", displayName: "Ольга" },
  { email: "reader.sergey@demo.local", displayName: "Сергей" },
  { email: "reader.nikita@demo.local", displayName: "Никита" }
] as const;

type SeedUser = { email: string; displayName: string; role?: "user" | "editor" | "moderator" | "admin" };

// ---------------------------------------------------------------------------
// Каталожные id (проверены против БД)
// ---------------------------------------------------------------------------
const C = {
  // base / specialty malts (type=malt)
  pale: "bestmalz-best-pale-ale-malt",
  maris: "pauls-malt-maris-otter-gb-base",
  goldenPromise: "simpsons-malt-low-colour-golden-promise-gb-base",
  pilsner: "beerex-pilsner-cz-base",
  vienna: "big-barley-vienna-ua-base",
  munich: "bestmalz-best-munich-malt",
  munichDark: "bestmalz-best-munich-dark-malt",
  wheat: "avangard-malz-wheat-malt-de-base",
  crystal40: "crisp-malt-crystal-40",
  crystal60: "crisp-malt-crystal-60",
  crystal75: "crisp-malt-crystal-75",
  crystal90: "crisp-malt-crystal-90",
  crystal120: "crisp-malt-crystal-120",
  caraMunich: "weyermann--caramunich-type-2",
  carapils: "weyermann--carapils",
  carafoam: "weyermann-carafoam",
  carahell: "weyermann--carahell",
  specialB: "dingemans-special-b-md-be-caramel",
  chocolate: "bestmalz-best-chocolate-malt",
  brown: "crisp-malt-brown-malt",
  blackPatent: "crisp-malt-black-patent",
  melanoidin: "bestmalz-best-melanoidin-malt",
  aromatic: "dingemans-amber-aromatic-md-be-specialty",
  acid: "weyermann-acidulated-malt",
  redX: "bestmalz-best-red-x",
  // fermentables (type=fermentable): flaked / roasted / sugars
  flakedWheat: "flaked-wheat-nesolozhenka",
  flakedOats: "flaked-oats-nesolozhenka",
  flakedBarley: "flaked-barley-nesolozhenka",
  flakedRye: "flaked-rye-nesolozhenka",
  roastedBarley: "simpsons-malt-roasted-barley-nesolozhenka",
  riceHulls: "rice-hulls-nesolozhenka",
  dextrose: "dextrose-sahar",
  candi: "candico-candi-syrup-amber-sahar",
  lactose: "lactose-sahar",
  // hops
  cascade: "us-cascade-beervingem-standard",
  citra: "us-citra-beervingem-standard",
  mosaic: "us-mosaic-beervingem-standard",
  centennial: "us-centennial-beervingem-standard",
  chinook: "us-chinook-beervingem-standard",
  simcoe: "us-simcoe-beervingem-standard",
  columbus: "us-ctz-beervingem-standard",
  amarillo: "us-amarillo-beervingem-standard",
  galaxy: "au-galaxy-beervingem-standard",
  warrior: "us-warrior-standard",
  magnum: "de-hallertauer-magnum-hvg-standard",
  perle: "de-perle-beervingem-standard",
  saaz: "cz-saaz-beervingem-standard",
  hallertau: "de-hallertau-mittelfruh-beervingem-standard",
  tradition: "de-hallertauer-tradition-hvg-standard",
  tettnang: "de-tettnanger-beervingem-standard",
  spalt: "de-spalter-select-standard",
  sterling: "us-sterling-standard",
  fuggle: "gb-fuggle-beervingem-standard",
  ekg: "gb-east-kent-goldings-beervingem-standard",
  styrian: "si-bobek-styrian-golding-b-standard",
  northdown: "gb-northdown-standard",
  northernBrewer: "de-northern-brewer-hvg-standard",
  challenger: "gb-challenger-standard",
  target: "gb-target-standard",
  galena: "us-galena-standard",
  willamette: "us-willamette-beervingem-standard",
  cluster: "xx-cluster-standard",
  hersbrucker: "de-hersbrucker-beervingem-standard",
  bravo: "xx-bravo-standard",
  mandarina: "de-mandarina-bavaria-beervingem-standard",
  // yeast
  us05: "fermentis-us-05",
  s04: "fermentis-s-04",
  w3470: "fermentis-w-34-70",
  wb06: "fermentis-wb-06",
  t58: "fermentis-t-58",
  k97: "fermentis-k-97",
  nottingham: "lallemand-nottingham",
  munichClassic: "lallemand-munich-classic",
  belleSaison: "lallemand-belle-saison",
  wlp001: "white-labs-wlp001-wlp001-california-ale-yeast",
  wlp002: "white-labs-wlp002-wlp002-english-ale-yeast",
  wlp007: "white-labs-wlp007-wlp007-crisp-english-ale-yeast",
  wlp530: "white-labs-wlp530-wlp530-abbey-ale-yeast",
  wlp565: "white-labs-wlp565-wlp565-belgian-saison-i-ale-yeast",
  wy1056: "wyeast-1056-1056-american-ale",
  wy1098: "wyeast-1098-1098-british-ale",
  wy1968: "wyeast-1968-1968-london-esb-ale",
  wy3724: "wyeast-3724-3724-belgian-saison",
  wy3787: "wyeast-3787-3787-belgian-high-gravity",
  kolsch: "white-labs-wlp029-german-ale",
  hefe: "wyeast-3068-weihenstephan-weizen",
  wit: "asp-lab-al-204-belgian-witbier",
  irish: "wyeast-1084-irish-ale"
} as const;

// ---------------------------------------------------------------------------
// Ингредиенты рецепта
// ---------------------------------------------------------------------------
type Ing = {
  id: string;
  type: "malt" | "fermentable" | "hop" | "yeast";
  qty: number;
  unit: string;
  stage: "mash" | "boil" | "whirlpool" | "fermentation";
  timeOffset?: number;
};

const malt = (id: string, kg: number): Ing => ({ id, type: "malt", qty: kg, unit: "kg", stage: "mash" });
const grain = (id: string, kg: number): Ing => ({ id, type: "fermentable", qty: kg, unit: "kg", stage: "mash" });
const sugar = (id: string, kg: number): Ing => ({ id, type: "fermentable", qty: kg, unit: "kg", stage: "boil", timeOffset: 10 });
const bh = (id: string, g: number, min: number): Ing => ({ id, type: "hop", qty: g, unit: "g", stage: "boil", timeOffset: min });
const fwh = (id: string, g: number): Ing => ({ id, type: "hop", qty: g, unit: "g", stage: "boil", timeOffset: 60 });
const mh = (id: string, g: number): Ing => ({ id, type: "hop", qty: g, unit: "g", stage: "mash" });
const wp = (id: string, g: number): Ing => ({ id, type: "hop", qty: g, unit: "g", stage: "whirlpool", timeOffset: 0 });
const dh = (id: string, g: number): Ing => ({ id, type: "hop", qty: g, unit: "g", stage: "fermentation" });
const y = (id: string): Ing => ({ id, type: "yeast", qty: 11, unit: "g", stage: "fermentation" });

// ---------------------------------------------------------------------------
// Рецепты (перенос из docs/recepty-podborka-30l.md, пересчёт на 30 л)
// ---------------------------------------------------------------------------
type RecipeSpec = {
  title: string;
  styleId: string;
  url: string;
  site: string;
  origin: string;
  author?: string;
  description: string;
  og: number;
  fg?: number;
  abv: number;
  ibu?: number;
  srm?: number;
  boil: number;
  mash: number;
  ferm: number;
  fermDays: number;
  ingredients: Ing[];
};

const RECIPES: RecipeSpec[] = [
  // ===== БЛОК 1. Американские IPA / DIPA / NEIPA =====
  {
    title: "Pliny the Elder (клон Russian River)",
    styleId: "22A",
    url: "https://byo.com/recipes/russian-river-brewing-co-s-pliny-the-elder-clone/",
    site: "Brew Your Own",
    origin: "Официальный домашний клон от пивовара Vinnie Cilurzo (Russian River Brewing Co.), Brew Your Own, 2004. Эталон стиля West Coast DIPA.",
    author: "Vinnie Cilurzo",
    description:
      "Мощный, но удивительно питкий западный двойной IPA. Слой за слоем — смолистая хвоя, грейпфрут, цитрусовая цедра и хвойно-дынные тона Simcoe и Centennial. Тело сухое за счёт декстрозы, высокий алкоголь не кажется тяжёлым, горечь высокая, но отполированная. Пить максимально свежим.",
    og: 1.074, fg: 1.014, abv: 8.25, ibu: 100, srm: 8,
    boil: 90, mash: 66, ferm: 20, fermDays: 19,
    ingredients: [
      malt(C.pale, 9.16), malt(C.carapils, 0.62), malt(C.crystal40, 0.2), sugar(C.dextrose, 0.71),
      mh(C.chinook, 68), bh(C.warrior, 123, 90), bh(C.chinook, 22, 90), bh(C.simcoe, 44, 45), bh(C.columbus, 44, 30),
      wp(C.centennial, 101), wp(C.simcoe, 44), dh(C.columbus, 78), dh(C.centennial, 78), dh(C.simcoe, 78), y(C.us05)
    ]
  },
  {
    title: "Stone IPA",
    styleId: "21A",
    url: "https://byo.com/recipes/stone-ipa-clone/",
    site: "Brew Your Own",
    origin: "Клон флагмана Stone Brewing (Эскондидо, Калифорния), Brew Your Own, 2008.",
    description:
      "Классический, ныне исторический образец западного IPA. Чистая солодовая база не мешает цитрусово-хвойному характеру Centennial и Chinook; сухое тело, плотная горечь, долгое смолистое послевкусие. Английский эльный штамм даёт лёгкую фруктовость и хорошее осветление.",
    og: 1.065, fg: 1.012, abv: 6.9, ibu: 77, srm: 8,
    boil: 90, mash: 65, ferm: 19, fermDays: 14,
    ingredients: [
      malt(C.pale, 8.96), malt(C.crystal40, 0.71),
      bh(C.magnum, 19, 90), bh(C.perle, 28, 60), bh(C.centennial, 90, 15),
      dh(C.centennial, 44), dh(C.chinook, 22), y(C.wlp002)
    ]
  },
  {
    title: "Stone Ruination IPA",
    styleId: "22A",
    url: "https://byo.com/recipe/stone-ruination-ipa-clone/",
    site: "Brew Your Own",
    origin: "Клон оригинальной формулы Stone Ruination — одного из первых двойных IPA, определивших стиль. Brew Your Own.",
    description:
      "Один из первых двойных IPA, определивших стиль: смолистая хвоя, апельсиновая цедра, насыщенное янтарно-оранжевое тело, мощная, но не агрессивная горечь. Солодовый каркас крепче, чем у обычного IPA.",
    og: 1.072, fg: 1.012, abv: 8.0, ibu: 90, srm: 8,
    boil: 90, mash: 65, ferm: 19, fermDays: 16,
    ingredients: [
      malt(C.pale, 10.4), malt(C.crystal40, 0.71),
      bh(C.magnum, 101, 90), wp(C.centennial, 68), wp(C.chinook, 22), dh(C.centennial, 90), y(C.wlp002)
    ]
  },
  {
    title: "Stone Pataskala Red X IPA",
    styleId: "21B",
    url: "https://byo.com/recipe/stone-brewing-co-s-pataskala-red-x-ipa-clone/",
    site: "Brew Your Own",
    origin: "Клон сезонного красного IPA Stone (рецептуру делал Kris Ketcham под руководством Mitch Steele). Особенность — 100 % солод BestMalz Red X®. Brew Your Own.",
    description:
      "Красный IPA глубокого рубиново-янтарного цвета. Red X® даёт бисквитно-ирисочную основу без приторности, обильное сухое охмеление Mosaic, Cascade и Amarillo выводит вперёд цитрус, косточковые тона и лёгкую смолистость. Опасно питкий для своих 7,3 %.",
    og: 1.068, fg: 1.012, abv: 7.3, ibu: 74, srm: 15,
    boil: 75, mash: 64, ferm: 19, fermDays: 14,
    ingredients: [
      malt(C.redX, 10.7),
      fwh(C.magnum, 28), bh(C.mosaic, 57, 15), bh(C.cascade, 28, 15),
      wp(C.mosaic, 57), wp(C.cascade, 28), wp(C.amarillo, 28),
      dh(C.mosaic, 115), dh(C.amarillo, 57), dh(C.cascade, 57), y(C.wlp007)
    ]
  },
  {
    title: "New England IPA (Gordon Strong)",
    styleId: "21C",
    url: "https://byo.com/recipes/new-england-ipa/",
    site: "Brew Your Own",
    origin: "Эталонный авторский рецепт-профиль стиля от Gordon Strong, Brew Your Own. Не клон конкретного бренда.",
    author: "Gordon Strong",
    description:
      "Мутный, сочный «хейзи» с мягкой, почти кремовой текстурой от хлопьев пшеницы и овса. Аромат — тропические фрукты, манго, цитрус и косточковые (Citra, Mosaic, Galaxy, Amarillo). Горечь приглушена, тело округлое, финиш мягкий.",
    og: 1.061, fg: 1.012, abv: 6.5, ibu: 56, srm: 5,
    boil: 60, mash: 65, ferm: 19, fermDays: 14,
    ingredients: [
      malt(C.pale, 6.5), malt(C.goldenPromise, 1.44), grain(C.flakedWheat, 0.71), grain(C.flakedOats, 0.54),
      fwh(C.amarillo, 68), wp(C.amarillo, 68), wp(C.citra, 44), wp(C.galaxy, 44), wp(C.mosaic, 44),
      dh(C.citra, 134), dh(C.galaxy, 68), dh(C.mosaic, 68), y(C.wlp001)
    ]
  },
  {
    title: "Bell's Two Hearted Ale",
    styleId: "21A",
    url: "https://homebrewersassociation.org/homebrew-recipe/bells-two-hearted-ale-clone/",
    site: "AHA / Zymurgy",
    origin: "Официальный клон Bell's Brewery (Каламазу, Мичиган); опубликован в Zymurgy (AHA), «Top 50 Commercial Clone Beer Recipes 2018».",
    description:
      "Хрестоматийный американский IPA на 100 % хмеле Centennial. Аромат — сосновая смола, грейпфрут и цитрус; солодовая база мягкая, бисквитная, финиш чистый и сухой.",
    og: 1.063, fg: 1.012, abv: 6.7, ibu: 55, srm: 10,
    boil: 75, mash: 66, ferm: 19, fermDays: 14,
    ingredients: [
      malt(C.pale, 7.1), malt(C.maris, 2.05), malt(C.crystal40, 0.36),
      bh(C.centennial, 54, 45), bh(C.centennial, 54, 30), dh(C.centennial, 156), y(C.us05)
    ]
  },
  {
    title: "Sierra Nevada Pale Ale",
    styleId: "18B",
    url: "https://sierranevada.com/blog/our-beer/pale-ale-homebrew-recipe",
    site: "Sierra Nevada (офиц.)",
    origin: "Официальный домашний рецепт от самой пивоварни Sierra Nevada (Чико, Калифорния). Пиво, определившее жанр американского пейл-эля.",
    description:
      "Пиво, определившее жанр американского пейл-эля. Знаменитый «букет» Cascade — цитрус, хвоя, лёгкая пряность — на чистой карамельно-солодовой базе. Среднее тело, освежающая горечь, очень питко. Хорош и как первый «характерный» хмелевой эль для новичка.",
    og: 1.053, fg: 1.011, abv: 5.6, ibu: 37, srm: 10,
    boil: 90, mash: 68, ferm: 20, fermDays: 12,
    ingredients: [
      malt(C.pale, 7.4), malt(C.crystal60, 0.71),
      bh(C.magnum, 22, 60), bh(C.perle, 22, 60), bh(C.cascade, 90, 30), wp(C.cascade, 90), y(C.us05)
    ]
  },
  {
    title: "American Amber Ale (Gordon Strong)",
    styleId: "19A",
    url: "https://byo.com/recipes/gordon-strongs-american-amber-ale/",
    site: "Brew Your Own",
    origin: "Рецепт-профиль стиля от Gordon Strong, Brew Your Own.",
    author: "Gordon Strong",
    description:
      "Янтарный эль с равновесием карамельно-поджаристого солода и цитрусово-цветочного американского хмеля. Средне-полное тело, умеренная горечь, лёгкие тона ириса и хлеба. Универсальное «пиво на каждый день».",
    og: 1.054, fg: 1.012, abv: 5.5, ibu: 30, srm: 15,
    boil: 90, mash: 66, ferm: 20, fermDays: 12,
    ingredients: [
      malt(C.pale, 6.5), malt(C.munichDark, 0.72), malt(C.crystal60, 0.72), malt(C.chocolate, 0.09),
      fwh(C.cascade, 44), bh(C.mandarina, 22, 10), bh(C.hallertau, 44, 5), wp(C.cascade, 44), y(C.wlp001)
    ]
  },

  // ===== БЛОК 2. Английские эли =====
  {
    title: "Fuller's London Pride",
    styleId: "11B",
    url: "https://byo.com/recipes/fuller-s-london-pride-clone/",
    site: "Brew Your Own",
    origin: "Клон от Brew Your Own; рецепт проверял многолетний бруермастер Fuller's John Keeling. Бутылочная версия 4,7 %.",
    author: "John Keeling (Fuller's)",
    description:
      "Классический английский бест-биттер: насыщенная солодовая база с тонами ириса, орехов и лёгкой медово-цветочной нотой фирменных дрожжей Fuller's. Английские Target, Challenger и Northdown дают землисто-пряную горечь. Сбалансированное, сессионное, очень «британское» пиво.",
    og: 1.048, fg: 1.012, abv: 4.7, ibu: 33, srm: 13,
    boil: 60, mash: 65, ferm: 20, fermDays: 10,
    ingredients: [
      malt(C.pale, 6.5), malt(C.crystal75, 0.63),
      bh(C.target, 24, 60), bh(C.challenger, 16, 15), bh(C.northdown, 16, 15), y(C.wlp002)
    ]
  },
  {
    title: "Fuller's ESB",
    styleId: "11C",
    url: "https://byo.com/recipes/fuller-s-esb-clone-2/",
    site: "Brew Your Own",
    origin: "Клон от Brew Your Own (проверен John Keeling). Бутылочная версия 5,9 %.",
    author: "John Keeling (Fuller's)",
    description:
      "«Старший брат» London Pride — крепче, насыщеннее, с выраженным мармеладно-цитрусовым характером английских дрожжей. Богатая карамельно-бисквитная база, землистая горечь и сухое охмеление Goldings. Эталон ESB.",
    og: 1.060, fg: 1.014, abv: 5.9, ibu: 35, srm: 14,
    boil: 60, mash: 67, ferm: 20, fermDays: 12,
    ingredients: [
      malt(C.pale, 8.1), malt(C.crystal75, 0.81),
      bh(C.target, 24, 60), bh(C.challenger, 16, 60), bh(C.northdown, 4, 15), bh(C.ekg, 15, 15), dh(C.ekg, 15), y(C.wy1968)
    ]
  },

  // ===== БЛОК 3. Бельгийские эли =====
  {
    title: "Бланш де Луш (Galmoff, бир.рф)",
    styleId: "24A",
    url: "http://brewmate.ru/recipes/1615-blansh-de-lush.html",
    site: "бир.рф / brewmate.ru",
    origin: "Авторский рецепт российского пивовара (ник Galmoff) с бир.рф — «лучший рецепт пива по сайту бир.рф за 2018 год». Засыпь по профилю стиля (точные пропорции — в оригинале).",
    author: "Galmoff",
    description:
      "Лёгкое освежающее бельгийское белое на пшенице с кориандром и апельсиновой цедрой. Мутное, бледно-соломенное, с цитрусово-пряным ароматом и мягкой кислинкой. Простое в варке и очень питкое — отличный летний сорт.",
    og: 1.049, abv: 4.9, ibu: 13, srm: 3,
    boil: 60, mash: 66, ferm: 20, fermDays: 12,
    ingredients: [
      malt(C.wheat, 2.9), malt(C.pilsner, 2.9), grain(C.flakedWheat, 0.5),
      bh(C.hallertau, 18, 60), wp(C.saaz, 15), y(C.wit)
    ]
  },
  {
    title: "Saison Dupont в стиле (Paul Zocco)",
    styleId: "25B",
    url: "https://www.beerandbrewing.com/belgian-saison-in-the-style-of-saison-dupont-recipe",
    site: "Craft Beer & Brewing",
    origin: "Рецепт «в стиле Saison Dupont» от чемпиона-домашнего пивовара Paul Zocco (Zok), Craft Beer & Brewing. Saison Dupont — эталон стиля.",
    author: "Paul Zocco",
    description:
      "Эталонный фермерский эль: сухой, искрящийся, с фруктовыми эфирами, цветочно-травянистыми нотами и перечной пряностью сезонных дрожжей. Золотистый, мутноватый, высоко газированный и очень «гастрономичный».",
    og: 1.054, abv: 6.5, ibu: 25, srm: 5,
    boil: 90, mash: 63, ferm: 26, fermDays: 18,
    ingredients: [
      malt(C.pilsner, 7.75), malt(C.vienna, 0.36), malt(C.munich, 0.18), malt(C.caraMunich, 0.36), malt(C.wheat, 0.36),
      bh(C.ekg, 40, 60), bh(C.styrian, 30, 15), y(C.wlp565)
    ]
  },
  {
    title: "Westmalle Tripel",
    styleId: "26C",
    url: "https://byo.com/recipes/westmalle-abbey-tripel-clone/",
    site: "Brew Your Own",
    origin: "Клон трапистского трипеля Brouwerij Westmalle от Brew Your Own («15 Classic Belgian Clone Recipes»).",
    description:
      "Квинтэссенция трапистского трипеля: очень светлый, крепкий и поразительно гладкий. Фруктовые эфиры, лёгкая пряность, сухой финиш и обманчиво питкое тело при 8,5 %. Карамелизация сусла и жёсткая вода придают характерный оттенок.",
    og: 1.081, fg: 1.015, abv: 8.5, ibu: 39, srm: 5,
    boil: 120, mash: 66, ferm: 20, fermDays: 21,
    ingredients: [
      malt(C.pilsner, 9.2), sugar(C.candi, 1.44),
      bh(C.styrian, 84, 60), bh(C.tettnang, 33, 15), bh(C.saaz, 33, 5), y(C.wlp530)
    ]
  },
  {
    title: "Westvleteren 12 (клон «The Pious»)",
    styleId: "26D",
    url: "https://homebrewtalk.com/threads/westvleteren-12-the-receipt.383571/",
    site: "Homebrew Talk",
    origin: "Конкурсный рецепт-победитель «The Pious» (автор Saq) — 1-е место и Best of Show на соревновании клонов Westvleteren 12. Монастырь рецепты не публикует.",
    author: "Saq",
    description:
      "Один из самых титулованных тёмных крепких бельгийцев. Глубокий тёмно-махагоновый цвет, ноты тёмных сухофруктов (изюм, чернослив, инжир), карамели, рома и тёмного сахара. Сложное, согревающее, не приторное за счёт высокой сбраживаемости. Требует длительной выдержки.",
    og: 1.090, fg: 1.012, abv: 11.2, ibu: 35, srm: 33,
    boil: 90, mash: 65, ferm: 21, fermDays: 28,
    ingredients: [
      malt(C.pilsner, 8.6), malt(C.caraMunich, 0.6), malt(C.specialB, 0.4), sugar(C.candi, 1.4),
      bh(C.northernBrewer, 45, 60), bh(C.hallertau, 30, 15), bh(C.styrian, 25, 5), y(C.wlp530)
    ]
  },

  // ===== БЛОК 4. Пшеничные =====
  {
    title: "Hefeweizen (Jamil Zainasheff)",
    styleId: "10A",
    url: "https://byo.com/articles/german-hefeweizen-style-profile/",
    site: "Brew Your Own",
    origin: "Рецепт-профиль стиля от Jamil Zainasheff, Brew Your Own.",
    author: "Jamil Zainasheff",
    description:
      "Классический баварский вайцен — мутный, светлый, с фирменным дрожжевым профилем «банан и гвоздика». Мягкое пшеничное тело, высокая газация, низкая горечь.",
    og: 1.049, fg: 1.012, abv: 4.8, ibu: 13, srm: 3,
    boil: 60, mash: 67, ferm: 19, fermDays: 12,
    ingredients: [
      malt(C.wheat, 3.5), malt(C.pilsner, 3.5), bh(C.hallertau, 30, 60), y(C.hefe)
    ]
  },
  {
    title: "Weihenstephaner Hefeweissbier",
    styleId: "10A",
    url: "https://www.beerandbrewing.com/recipe-weihenstephan-style-hefeweissbier",
    site: "Craft Beer & Brewing",
    origin: "Рецепт «в стиле» от бруермастера Weihenstephan Tobias Zollo для Craft Beer & Brewing (пивоварня обычно не раскрывает точные рецепты).",
    author: "Tobias Zollo (Weihenstephan)",
    description:
      "Ориентир мирового вайцена: насыщенный, кремовый, с хлебно-поджаристой солодовой глубиной и выразительными тонами банана и гвоздики. Традиционно варится затиранием с двумя отварками.",
    og: 1.053, fg: 1.012, abv: 5.4, ibu: 14, srm: 4,
    boil: 60, mash: 67, ferm: 20, fermDays: 12,
    ingredients: [
      malt(C.wheat, 3.8), malt(C.pilsner, 3.4), bh(C.hallertau, 32, 60), y(C.munichClassic)
    ]
  },
  {
    title: "German Weiss с отваркой (Gordon Strong)",
    styleId: "10A",
    url: "https://byo.com/articles/german-weiss-weissbier-in-the-south-hefeweizen-in-the-north/",
    site: "Brew Your Own",
    origin: "Рецепт-профиль с отварочным затиранием от Gordon Strong, Brew Your Own.",
    author: "Gordon Strong",
    description:
      "Вайцен, в котором благодаря одной отварке усилена хлебно-солодовая глубина. Мягкое пшеничное тело, тона банана и гвоздики, чистый финиш.",
    og: 1.050, fg: 1.010, abv: 5.3, ibu: 12, srm: 3,
    boil: 60, mash: 66, ferm: 17, fermDays: 12,
    ingredients: [
      malt(C.wheat, 4.5), malt(C.pilsner, 2.85), grain(C.riceHulls, 0.71), bh(C.sterling, 22, 60), y(C.hefe)
    ]
  },

  // ===== БЛОК 5. Лагеры =====
  {
    title: "Bohemian Pilsner «Nevermore» (Josh Weikert)",
    styleId: "3B",
    url: "https://www.beerandbrewing.com/make-your-best-bohemian-pilsner/",
    site: "Craft Beer & Brewing",
    origin: "Рецепт-профиль чешского пилснера от Josh Weikert, Craft Beer & Brewing («Make Your Best Bohemian Pilsner»).",
    author: "Josh Weikert",
    description:
      "Золотистый чешский лагер с богатой солодовостью, мягкой водой, плотной кремовой пеной и выраженной, но округлой пряно-травянистой горечью Saaz. Питкий и сложный одновременно.",
    og: 1.057, fg: 1.014, abv: 5.8, ibu: 49, srm: 4,
    boil: 90, mash: 65, ferm: 10, fermDays: 28,
    ingredients: [
      malt(C.pilsner, 6.8), malt(C.carafoam, 0.3), malt(C.munich, 0.2),
      bh(C.saaz, 60, 60), bh(C.saaz, 40, 30), bh(C.saaz, 40, 10), bh(C.saaz, 30, 5), y(C.w3470)
    ]
  },
  {
    title: "Pilsner Urquell",
    styleId: "3B",
    url: "https://byo.com/recipes/pilsner-urquell-clone/",
    site: "Brew Your Own",
    origin: "Клон первого в мире пилснера (Plzeňský Prazdroj, Пльзень) от Brew Your Own.",
    description:
      "Оригинальный чешский пилснер: мягкая вода, по традиции — затирание с тремя отварками, насыщенно-солодовая база с лёгкой диацетильной округлостью и пряно-травянистой горечью Saaz. В клоне отварочное затирание упрощено.",
    og: 1.048, fg: 1.015, abv: 4.4, ibu: 40, srm: 4,
    boil: 90, mash: 65, ferm: 10, fermDays: 35,
    ingredients: [
      malt(C.pilsner, 5.7), malt(C.vienna, 0.71), malt(C.munich, 0.36), malt(C.carafoam, 0.36),
      bh(C.saaz, 60, 80), bh(C.saaz, 36, 45), bh(C.saaz, 33, 25), y(C.w3470)
    ]
  },
  {
    title: "Munich Helles (Horst Dornbusch)",
    styleId: "4A",
    url: "https://byo.com/recipe/munich-helles/",
    site: "Brew Your Own",
    origin: "Рецепт-профиль стиля от Horst Dornbusch, Brew Your Own.",
    author: "Horst Dornbusch",
    description:
      "Мягкий золотистый баварский лагер с чуть сладковатой, зерново-хлебной солодовостью и сдержанной благородной горечью. Чистый, нежный и питкий; качество солода и процесса в таком светлом пиве сразу видно.",
    og: 1.047, fg: 1.011, abv: 4.8, ibu: 20, srm: 4,
    boil: 90, mash: 65, ferm: 10, fermDays: 35,
    ingredients: [
      malt(C.pilsner, 6.3), malt(C.carahell, 0.24), malt(C.carafoam, 0.24), malt(C.acid, 0.24),
      bh(C.tradition, 38, 60), bh(C.hallertau, 14, 15), bh(C.hallertau, 9, 5), y(C.w3470)
    ]
  },
  {
    title: "Märzen / Oktoberfest (Gordon Strong)",
    styleId: "6A",
    url: "https://byo.com/recipes/gordon-strongs-marzen/",
    site: "Brew Your Own",
    origin: "Конкурсно-ориентированный рецепт-профиль от Gordon Strong, Brew Your Own.",
    author: "Gordon Strong",
    description:
      "Традиционный праздничный лагер янтарного цвета с богатой тостово-хлебной солодовостью (Vienna и Munich), чистым лагерным телом и сдержанной горечью. Маслянисто-солодовый, но сухой в финише.",
    og: 1.060, fg: 1.014, abv: 6.1, ibu: 22, srm: 11,
    boil: 90, mash: 67, ferm: 10, fermDays: 42,
    ingredients: [
      malt(C.vienna, 7.1), malt(C.pilsner, 2.2), malt(C.munich, 2.2), malt(C.munichDark, 0.71),
      malt(C.melanoidin, 0.36), malt(C.aromatic, 0.36), malt(C.caraMunich, 0.18),
      bh(C.tradition, 30, 60), bh(C.hallertau, 44, 20), y(C.w3470)
    ]
  },
  {
    title: "Baltic Porter (Tom Nolan, GABF Pro-Am)",
    styleId: "9C",
    url: "https://homebrewersassociation.org/homebrew-recipe/beer-recipe-of-the-week-baltic-porter/",
    site: "AHA / Zymurgy",
    origin: "Pro-Am рецепт Tom Nolan (WortHawgs); золото GABF Pro-Am 2006 для Foothills Brewing; опубликован Stan Hieronymus в Zymurgy, 2007.",
    author: "Tom Nolan",
    description:
      "Мощный тёмный лагер балтийской школы: ноты тёмных сухофруктов, ириса, кофе и шоколада при чистом лагерном брожении. Полнотелый, согревающий, но гладкий, без резкой жжёности.",
    og: 1.083, fg: 1.020, abv: 8.2, ibu: 53, srm: 43,
    boil: 90, mash: 66, ferm: 16, fermDays: 42,
    ingredients: [
      malt(C.pale, 5.4), malt(C.munich, 3.2), malt(C.vienna, 1.8), malt(C.wheat, 0.54),
      malt(C.crystal120, 0.54), malt(C.chocolate, 0.36), malt(C.blackPatent, 0.36),
      bh(C.perle, 90, 60), bh(C.hallertau, 68, 12), wp(C.hallertau, 22), y(C.w3470)
    ]
  },
  {
    title: "Kölsch (Jamil Zainasheff)",
    styleId: "5B",
    url: "https://byo.com/articles/koelsch-style-profile/",
    site: "Brew Your Own",
    origin: "Рецепт-профиль стиля от Jamil Zainasheff, Brew Your Own.",
    author: "Jamil Zainasheff",
    description:
      "Кёльнский гибрид — бродит как эль, но холодно лагеризуется. Светлый, деликатный, с чистой зерновой солодовостью, лёгкой фруктовостью и тонкой благородной горечью. Элегантное, тонкое пиво.",
    og: 1.047, fg: 1.010, abv: 4.8, ibu: 24, srm: 4,
    boil: 90, mash: 65, ferm: 15, fermDays: 28,
    ingredients: [
      malt(C.pilsner, 6.8), malt(C.vienna, 0.5), malt(C.acid, 0.1),
      bh(C.hallertau, 30, 60), bh(C.spalt, 18, 15), y(C.kolsch)
    ]
  },

  // ===== БЛОК 6. Стауты и портеры =====
  {
    title: "Guinness Draught (Dry Stout)",
    styleId: "15B",
    url: "https://byo.com/recipes/guinness-style-dry-stout/",
    site: "Brew Your Own",
    origin: "Клон ирландского сухого стаута Guinness — широко известный рецепт Jamil Zainasheff в Brew Your Own.",
    author: "Jamil Zainasheff",
    description:
      "Хрестоматийный ирландский сухой стаут: лёгкое тело, выраженная жжёно-кофейная горечь от обжаренного несоложёного ячменя, сухой финиш. Ключ к характеру — очень тонкий помол обжаренного ячменя (~500 °L).",
    og: 1.041, fg: 1.010, abv: 4.1, ibu: 41, srm: 35,
    boil: 90, mash: 66, ferm: 19, fermDays: 12,
    ingredients: [
      malt(C.maris, 4.5), grain(C.flakedBarley, 1.25), grain(C.roastedBarley, 0.63),
      bh(C.ekg, 74, 60), y(C.irish)
    ]
  },
  {
    title: "Oatmeal Stout (Stephen Galante)",
    styleId: "16B",
    url: "https://byo.com/articles/oatmeal-stout-style/",
    site: "Brew Your Own",
    origin: "Классический рецепт из Brew Your Own (Stephen Galante, BYO, 1997).",
    author: "Stephen Galante",
    description:
      "Овсяный стаут с шелковистой, кремовой текстурой за счёт овса. Ноты кофе, тёмного шоколада и лёгкой солодовой сладости, средне-полное тело, мягкий финиш. Уютное «зимнее» пиво.",
    og: 1.052, fg: 1.014, abv: 5.0, ibu: 33, srm: 39,
    boil: 60, mash: 67, ferm: 19, fermDays: 14,
    ingredients: [
      malt(C.pale, 7.1), grain(C.flakedOats, 0.8), malt(C.crystal60, 0.45), malt(C.chocolate, 0.22), grain(C.roastedBarley, 0.22),
      bh(C.fuggle, 90, 45), y(C.irish)
    ]
  },
  {
    title: "Milk Stout с овсом и лактозой (Doug Rhoades)",
    styleId: "16A",
    url: "https://byo.com/recipes/doug-rhoades-milk-stout/",
    site: "Brew Your Own",
    origin: "Читательский рецепт «Doug Rhoades' Milk Stout», Brew Your Own.",
    author: "Doug Rhoades",
    description:
      "Сладкий молочный стаут с добавлением овса и лактозы. Округлое, бархатистое тело, остаточная сладость, ноты кофе, шоколада и сливок. Десертный, но не приторный.",
    og: 1.072, fg: 1.023, abv: 6.3, ibu: 47, srm: 30,
    boil: 90, mash: 67, ferm: 20, fermDays: 16,
    ingredients: [
      malt(C.pale, 5.7), malt(C.wheat, 0.8), malt(C.crystal90, 1.44), malt(C.carapils, 0.71),
      malt(C.blackPatent, 0.22), grain(C.roastedBarley, 0.54), grain(C.flakedOats, 0.71), grain(C.flakedRye, 0.36), sugar(C.lactose, 0.71),
      bh(C.galena, 44, 90), bh(C.willamette, 22, 10), y(C.irish)
    ]
  },
  {
    title: "North Coast Old Rasputin",
    styleId: "20C",
    url: "https://homebrewersassociation.org/homebrew-recipe/north-coast-old-rasputin-clone/",
    site: "AHA / Zymurgy",
    origin: "Клон North Coast Brewing (Форт-Брэгг, Калифорния); рецепт Amahl Turczyn, опубликован в Zymurgy, 2007.",
    author: "Amahl Turczyn",
    description:
      "Мощный русский имперский стаут: насыщенные ноты горького шоколада, эспрессо, тёмных сухофруктов и согревающего алкоголя, с обильным поздним охмелением. Полнотелый, но за счёт высокой газации удивительно питкий.",
    og: 1.090, fg: 1.022, abv: 9.0, ibu: 75, srm: 38,
    boil: 90, mash: 67, ferm: 20, fermDays: 24,
    ingredients: [
      malt(C.pale, 11.1), malt(C.crystal40, 0.79), malt(C.crystal120, 0.79), malt(C.brown, 0.4), malt(C.chocolate, 0.4), grain(C.roastedBarley, 0.2),
      bh(C.cluster, 60, 60), bh(C.northernBrewer, 40, 30), wp(C.centennial, 40), y(C.wlp001)
    ]
  },

  // ===== БЛОК 7. Шотландский эль =====
  {
    title: "Wee Heavy (Jamil Zainasheff)",
    styleId: "17C",
    url: "https://homebrewersassociation.org/homebrew-recipe/wee-heavystrong-scotch-ale/",
    site: "AHA / Zymurgy",
    origin: "Рецепт Jamil Zainasheff из книги «Brewing Classic Styles», опубликован в Brew Your Own и библиотеке AHA. Торфяной солод НЕ используется.",
    author: "Jamil Zainasheff",
    description:
      "Богатый, солодово-сладкий шотландский крепкий эль с глубокой карамелью, тонами ириса, лёгкой поджаристостью и согревающим алкоголем. Длительное кипячение даёт карамелизацию сусла.",
    og: 1.099, fg: 1.026, abv: 10.6, ibu: 28, srm: 20,
    boil: 120, mash: 67, ferm: 17, fermDays: 24,
    ingredients: [
      malt(C.maris, 11.5), malt(C.crystal40, 0.79), malt(C.munich, 0.63), malt(C.crystal120, 0.31), grain(C.roastedBarley, 0.08),
      bh(C.ekg, 40, 60), y(C.wlp002)
    ]
  },

  // ===== БЛОК 8. Кислые =====
  {
    title: "Gose лейпцигский (Gordon Strong)",
    styleId: "27",
    url: "https://byo.com/recipe/german-gose/",
    site: "Brew Your Own",
    origin: "Рецепт-профиль стиля от Gordon Strong, Brew Your Own. Историческое солёно-кислое пшеничное пиво из Гослара / Лейпцига.",
    author: "Gordon Strong",
    description:
      "Лёгкое, освежающее кисло-солёное пшеничное пиво с тонами кориандра, мягкой молочной кислинкой и едва уловимой солёностью. Высокая газация, сухой финиш, хлебно-зерновая основа. Сбалансированный традиционный стиль.",
    og: 1.040, fg: 1.006, abv: 4.3, ibu: 8, srm: 3,
    boil: 60, mash: 68, ferm: 20, fermDays: 12,
    ingredients: [
      malt(C.pale, 3.8), malt(C.wheat, 2.05), grain(C.riceHulls, 0.09),
      bh(C.chinook, 6, 45), y(C.k97)
    ]
  },

  // ===== БЛОК 9. Русские и СНГ-рецепты =====
  {
    title: "Каскад цветочно-ванильный (Граф_Пивоварoff, бир.рф)",
    styleId: "18B",
    url: "http://brewmate.ru/recipes/3282-kaskad-cvetochno-vanilnyy.html",
    site: "бир.рф / brewmate.ru",
    origin: "Авторский рецепт российского пивовара (ник Граф_Пивоварoff) с бир.рф; занимал 1-е место в ТОП-50 рецептов сайта. Пересчёт с 50 л оригинала.",
    author: "Граф_Пивоварoff",
    description:
      "Простое и эффектное экспериментальное пиво на одном базовом солоде и большом количестве хмеля Cascade. В аромате — характерный «ботанический сад» с цитрусом, в большой засыпи Cascade раскрывается приятным ванильно-хлебным тоном. Светлое, питкое, с умеренной горечью. Обязательны дрожжи US-05.",
    og: 1.058, fg: 1.011, abv: 6.9, ibu: 17, srm: 4,
    boil: 90, mash: 66, ferm: 18, fermDays: 12,
    ingredients: [
      malt(C.pale, 7.2),
      bh(C.cascade, 6, 90), bh(C.cascade, 12, 55), bh(C.cascade, 18, 20), bh(C.cascade, 18, 5), dh(C.cascade, 24), y(C.us05)
    ]
  },
  {
    title: "Хмельная тропиканка (BodreevShow, бир.рф)",
    styleId: "18B",
    url: "https://www.youtube.com/watch?v=6X5342UVAs0",
    site: "бир.рф / BodreevShow",
    origin: "Авторский рецепт пивовара и блогера BodreevShow (Бодреев), бир.рф — один из самых известных «вирусных» рецептов рунета. Засыпь по профилю (карточка бир.рф закрыта для автозагрузки), параметры — из карточки.",
    author: "BodreevShow",
    description:
      "Светлое пиво с ярким, но не агрессивным хмелевым характером и фруктово-цитрусовым, почти тропическим финалом, который придаёт ему свежесть и питкость. Лёгкое, ароматное, хорошо заходит летом и подходит новичкам как первый «характерный» хмелевой сорт.",
    og: 1.055, abv: 6.0, ibu: 32, srm: 4,
    boil: 60, mash: 66, ferm: 19, fermDays: 12,
    ingredients: [
      malt(C.pilsner, 5.3), malt(C.pale, 0.9), malt(C.wheat, 0.5), sugar(C.dextrose, 0.4),
      bh(C.citra, 12, 60), bh(C.mosaic, 20, 10), wp(C.citra, 35), wp(C.mandarina, 25), dh(C.citra, 50), dh(C.mosaic, 30), y(C.us05)
    ]
  },
  {
    title: "Не более трёх литров в одни руки (Golfovod, бир.рф)",
    styleId: "18A",
    url: "https://xn--90aoy.xn--p1ai/beer_recipes/bjcp_2008/ale/ne_bolee_trjokh_litrov_v_odni_ruki/2-1-0-33578",
    site: "бир.рф",
    origin: "Авторский рецепт пивовара Golfovod на бир.рф. Народный хит — топ-1 рейтинга рецептов года. Название — отсылка к советской традиции продажи разливного пива «в одни руки».",
    author: "Golfovod",
    description:
      "Лёгкое, чистое и максимально питкое светлое пиво — «пиво для большой компании». Мягкая зерновая солодовость, деликатная хмелевая горечь и сухой освежающий финиш. Простое в варке, прощает новичку ошибки, пьётся как вода в жару.",
    og: 1.042, abv: 4.2, ibu: 15, srm: 4,
    boil: 60, mash: 67, ferm: 19, fermDays: 10,
    ingredients: [
      malt(C.pilsner, 5.2), malt(C.vienna, 0.6),
      bh(C.cascade, 17, 60), bh(C.cascade, 16, 30), bh(C.cascade, 17, 5), y(C.us05)
    ]
  },
  {
    title: "Жигулёвское по ГОСТу",
    styleId: "2A",
    url: "https://kolba.ru/blog/recept-zhigulyovskogo-piva",
    site: "kolba.ru",
    origin: "Легенда советского пивоварения, наследник «Венского» пива Альфреда фон Вакано (Самара, 1881); переименовано в 1934 г. По ГОСТу: плотность 11 %, крепость ~3,5 %, венский солод + до 15 % несоложёнки.",
    description:
      "Светлый лагер янтарно-золотистого оттенка с мягкой бархатистой солодовостью, лёгкой карамельной нотой венского солода и сдержанной, чуть травянистой хмелевой горечью. Невысокая крепость, чистый сухой финиш — то самое узнаваемое «пиво из бочки».",
    og: 1.044, abv: 3.8, ibu: 21, srm: 7,
    boil: 75, mash: 70, ferm: 11, fermDays: 28,
    ingredients: [
      malt(C.vienna, 4.8), grain(C.flakedBarley, 0.96),
      bh(C.saaz, 20, 60), bh(C.saaz, 40, 10), y(C.w3470)
    ]
  },
  {
    title: "Жигулёвское на отварках с Saaz (Pikabu)",
    styleId: "7A",
    url: "https://pikabu.ru/story/kak_ya_varil_svoy_pervyiy_lager__zhigulevskoe_7012899",
    site: "Pikabu",
    origin: "Популярная домашняя адаптация классической схемы: историческая технология с двумя отварками и несоложёнкой, но российский подвязный хмель заменён на чешский Saaz (Жатецкий).",
    description:
      "Чистый солодовый лагер с хлебно-зерновой основой, мягкой горчинкой и лёгким хмелевым ароматом Saaz. Тело чуть плотнее «магазинного», вкус прозрачный и питкий. Отличный рецепт, чтобы впервые попробовать настоящий низовой лагер дома.",
    og: 1.045, abv: 4.5, ibu: 22, srm: 6,
    boil: 75, mash: 68, ferm: 11, fermDays: 28,
    ingredients: [
      malt(C.vienna, 5.25), grain(C.flakedBarley, 0.92),
      bh(C.saaz, 25, 60), bh(C.saaz, 35, 10), y(C.w3470)
    ]
  },
  {
    title: "Венский лагер «по мотивам Жигулёвского»",
    styleId: "7A",
    url: "https://alcoprof.ru/stati/recepty-piva/pivo-venskoe/",
    site: "alcoprof.ru",
    origin: "Упрощённая авторская адаптация без сложного отварочного затирания — для тех, у кого нет опыта с отварками. Базируется на каноне венского лагера, из которого вырос советский сорт.",
    description:
      "Мягкий янтарный лагер с выраженной солодовостью венского солода (ноты ириски, хлеба, лёгкой карамели), невысокой горечью и питким сухим финишем. Главный плюс — простота: одно настойное затирание вместо отварок при узнаваемом «жигулёвском» характере.",
    og: 1.048, abv: 4.8, ibu: 20, srm: 10,
    boil: 75, mash: 65, ferm: 11, fermDays: 21,
    ingredients: [
      malt(C.vienna, 6.0), malt(C.munich, 0.3),
      bh(C.saaz, 30, 60), bh(C.hallertau, 15, 5), y(C.w3470)
    ]
  },

  // ===== Приложение (альтернативные версии) =====
  {
    title: "Saison Dupont (версия Clone Brews)",
    styleId: "25B",
    url: "https://www.brewersfriend.com/homebrew/recipe/view/",
    site: "Brewer's Friend / «Clone Brews»",
    origin: "Рецептура из книги «Clone Brews» (2-е изд.) — более крепкая и плотная версия сезона, чем основная позиция Saison Dupont.",
    description:
      "Более крепкий и сухой сезон с выраженной перечной пряностью сезонных дрожжей и цитрусовым акцентом от цедры. Золотистый, высокогазированный, гастрономичный.",
    og: 1.067, fg: 1.013, abv: 7.1, ibu: 23, srm: 6,
    boil: 90, mash: 66, ferm: 26, fermDays: 18,
    ingredients: [
      malt(C.pilsner, 7.2), malt(C.vienna, 0.34), malt(C.caraMunich, 0.09), sugar(C.candi, 0.68),
      bh(C.styrian, 42, 90), y(C.wy3724)
    ]
  },
  {
    title: "Motor Oil RIS",
    styleId: "20C",
    url: "https://blog.homebrewing.org/russian-imperial-stout-recipe-extract/",
    site: "Adventures in Homebrewing",
    origin: "Рабочий рецепт имперского стаута (Adventures in Homebrewing). В нашей версии экстракт заменён эквивалентом зернового затора.",
    description:
      "Очень плотный, чёрный, маслянистый стаут с нотами горького шоколада, кофе и тёмных фруктов; высокая горечь и согревающий алкоголь. Создан для выдержки.",
    og: 1.088, fg: 1.025, abv: 8.3, ibu: 82, srm: 39,
    boil: 60, mash: 67, ferm: 21, fermDays: 24,
    ingredients: [
      malt(C.pale, 11.5), malt(C.munich, 1.5), malt(C.chocolate, 1.58), malt(C.crystal90, 0.79), grain(C.roastedBarley, 0.79),
      bh(C.bravo, 36, 60), bh(C.columbus, 28, 10), bh(C.cascade, 28, 10), y(C.us05)
    ]
  }
];

// ---------------------------------------------------------------------------
// Главный сценарий
// ---------------------------------------------------------------------------
const round = (value: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

type Divergence = { title: string; metric: string; source: number; computed: number | null };

const main = async () => {
  assertDevOnly();

  // 1) Аккаунты: куратор-публикатор (автор всех рецептов) + читатели (для оценок)
  const upsertUser = async (u: SeedUser): Promise<string> => {
    const role = u.role ? { role: u.role } : {};
    const [row] = await db
      .insert(users)
      .values({ email: u.email, displayName: u.displayName, emailVerified: true, ...role })
      .onConflictDoUpdate({
        target: users.email,
        set: { displayName: u.displayName, emailVerified: true, ...role, updatedAt: new Date() }
      })
      .returning({ id: users.id });
    if (!row) throw new Error(`Не удалось создать/найти пользователя ${u.email}.`);
    return row.id;
  };
  const curatorId = await upsertUser(CURATOR);
  const readerIds: string[] = [];
  for (const reader of READERS) readerIds.push(await upsertUser(reader));
  console.log(`👤  Куратор: «${CURATOR.displayName}»; читателей для оценок: ${readerIds.length}.`);

  // 2) Проверка каталога + резолв единиц по измерению (дрожжи бывают
  //    count[pack/g] или volume[ml/l/gal] — единицу выбираем под профиль каталога).
  const neededIds = Array.from(new Set(RECIPES.flatMap((r) => r.ingredients.map((i) => i.id))));
  const rows = await db.query.ingredients.findMany({ where: inArray(ingredients.id, neededIds) });
  const presentIds = new Set(rows.map((r) => r.id));
  const missing = neededIds.filter((id) => !presentIds.has(id));
  if (missing.length) {
    throw new Error(`В каталоге нет ингредиентов: ${missing.join(", ")}.\nЗапусти 'npm run db:seed' и повтори.`);
  }
  const dimensionById = new Map(
    rows.map((r) => [r.id, buildCatalogIngredientLinkage(r as Parameters<typeof buildCatalogIngredientLinkage>[0]).measurementDimension])
  );

  // Доза дрожжей на стат не влияет (FG берём из источника) — выбираем валидную
  // единицу под измерение каталога: вес → 11 г, счёт → 1 пакет, объём → 35 мл.
  const resolveAmount = (ing: Ing): { qty: number; unit: string } => {
    if (ing.type !== "yeast") {
      return { qty: ing.qty, unit: ing.unit };
    }
    switch (dimensionById.get(ing.id)) {
      case "volume":
        return { qty: 35, unit: "ml" };
      case "count":
        return { qty: 1, unit: "pack" };
      default:
        return { qty: 11, unit: "g" };
    }
  };

  // 3) Идемпотентность: удаляем прежние demo-рецепты (и старые рандомные с тем же тегом)
  const deleted = await db
    .delete(recipes)
    .where(sql`${recipes.importMeta}->>'seedSource' = ${SEED_TAG}`)
    .returning({ id: recipes.id });
  if (deleted.length) console.log(`🧹  Удалено прежних demo-рецептов: ${deleted.length}.`);

  // 4) Создаём рецепты
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const created: Array<{ id: string; authorId: string; title: string; styleId: string }> = [];
  const divergences: Divergence[] = [];

  for (let i = 0; i < RECIPES.length; i += 1) {
    const spec = RECIPES[i]!;
    const authorId = curatorId;
    const fg = spec.fg ?? round(spec.og - spec.abv / 131.25, 3);

    const recipe = await createRecipe(authorId, {
      publicationState: "published",
      title: spec.title,
      styleId: spec.styleId,
      batchSizeEnteredQuantity: BATCH_L,
      batchSizeEnteredUnit: "l",
      efficiency: DEFAULT_EFFICIENCY,
      boilTimeMinutes: spec.boil,
      description: spec.description,
      importMeta: {
        seedSource: SEED_TAG,
        sourceAttribution: { url: spec.url, siteName: spec.site, origin: spec.origin, author: spec.author ?? null },
        importedStats: { og: spec.og, fg, abv: spec.abv, ibu: spec.ibu ?? null, color: spec.srm ?? null }
      },
      processMeta: {
        mashProfile: { steps: [{ id: "mash-1", name: "Осахаривание", temperatureC: spec.mash, durationMinutes: 60 }] },
        fermentationProfile: { primaryTemperatureC: spec.ferm, primaryDurationDays: spec.fermDays }
      },
      ingredients: spec.ingredients.map((ing) => {
        const amount = resolveAmount(ing);
        return {
          ingredientCatalogItemId: ing.id,
          type: ing.type,
          category: ing.type === "malt" ? "fermentable" : ing.type,
          amountEnteredQuantity: amount.qty,
          amountEnteredUnit: amount.unit,
          stage: ing.stage,
          ...(ing.timeOffset != null ? { timeOffset: ing.timeOffset } : {})
        };
      })
    });

    // Замер расхождения: что насчитало приложение vs источник.
    divergences.push(
      { title: spec.title, metric: "OG", source: spec.og, computed: recipe.og },
      { title: spec.title, metric: "FG", source: fg, computed: recipe.fg },
      { title: spec.title, metric: "ABV", source: spec.abv, computed: recipe.abv },
      ...(spec.ibu != null ? [{ title: spec.title, metric: "IBU", source: spec.ibu, computed: recipe.ibu }] : []),
      ...(spec.srm != null ? [{ title: spec.title, metric: "SRM", source: spec.srm, computed: recipe.color }] : [])
    );

    // Перезапись параметров значениями из источника + раскидка дат.
    const createdAt = new Date(now - randInt(0, 90) * dayMs - randInt(0, 86_400_000));
    await db
      .update(recipes)
      .set({ og: spec.og, fg, abv: spec.abv, ibu: spec.ibu ?? null, color: spec.srm ?? null, createdAt, updatedAt: createdAt })
      .where(eq(recipes.id, recipe.id));

    created.push({ id: recipe.id, authorId, title: spec.title, styleId: spec.styleId });
  }
  console.log(`🍺  Рецепты: создано ${created.length} (опубликованы, параметры из источника).`);

  // 5) Сохранения и оценки от читателей (для сортировок «популярные»/«рейтинг»)
  let totalSaves = 0;
  let totalRatings = 0;
  for (const recipe of created) {
    const others = readerIds;
    const saveTarget = Math.round(rng() ** 1.8 * others.length);
    for (const userId of shuffle(others).slice(0, saveTarget)) {
      await setRecipeSave(userId, recipe.id, true);
      totalSaves += 1;
    }
    const rateTarget = Math.round(rng() ** 1.6 * others.length);
    for (const userId of shuffle(others).slice(0, rateTarget)) {
      await rateRecipe(userId, recipe.id, { stars: pick([3, 4, 4, 5, 5, 5] as const), body: null });
      totalRatings += 1;
    }
  }
  console.log(`⭐  Сохранения: ${totalSaves}, оценки: ${totalRatings}.`);

  // 6) Отчёт о расхождении расчётов (приложение vs источник)
  printDivergenceReport(divergences);

  console.log("\n✅  Готово. Открой /recipes — листай, сортируй, ищи, сохраняй в избранное и клонируй; на странице рецепта виден блок «Источник».");
  process.exit(0);
};

const printDivergenceReport = (rows: Divergence[]) => {
  const metrics = ["OG", "FG", "ABV", "IBU", "SRM"];
  type Agg = { n: number; sumAbs: number; sumPct: number; maxAbs: number; maxPct: number; signed: number };
  // Для OG/FG сравниваем «пункты гравитации» (×1000), иначе абс. погрешность мизерна.
  const scale = (m: string, v: number) => (m === "OG" || m === "FG" ? (v - 1) * 1000 : v);
  const unitOf = (m: string) => (m === "OG" || m === "FG" ? " пт" : "");

  const agg = new Map<string, Agg>();
  const worst = new Map<string, Array<{ title: string; src: number; cmp: number; abs: number }>>();
  for (const m of metrics) {
    const a: Agg = { n: 0, sumAbs: 0, sumPct: 0, maxAbs: 0, maxPct: 0, signed: 0 };
    const offenders: Array<{ title: string; src: number; cmp: number; abs: number }> = [];
    for (const row of rows) {
      if (row.metric !== m || row.computed == null) continue;
      const src = scale(m, row.source);
      const cmp = scale(m, row.computed);
      const absErr = Math.abs(cmp - src);
      a.n += 1;
      a.sumAbs += absErr;
      a.sumPct += src !== 0 ? Math.abs((cmp - src) / src) * 100 : 0;
      a.signed += cmp - src;
      a.maxAbs = Math.max(a.maxAbs, absErr);
      a.maxPct = Math.max(a.maxPct, src !== 0 ? Math.abs((cmp - src) / src) * 100 : 0);
      offenders.push({ title: row.title, src, cmp, abs: absErr });
    }
    agg.set(m, a);
    worst.set(m, offenders.sort((x, z) => z.abs - x.abs).slice(0, 3));
  }

  console.log("\n📊  Расхождение расчётов приложения vs источник (OG/FG — в пунктах ×1000):");
  console.log("    метрика │  n │ ср.|Δ| │ max|Δ| │ ср.% │ max% │ сист.сдвиг");
  const tableLines: string[] = [];
  for (const m of metrics) {
    const a = agg.get(m)!;
    if (!a.n) continue;
    const u = unitOf(m);
    console.log(
      `    ${m.padEnd(7)} │ ${String(a.n).padStart(2)} │ ${(a.sumAbs / a.n).toFixed(1)}${u} │ ${a.maxAbs.toFixed(1)}${u} │ ${(a.sumPct / a.n).toFixed(1)}% │ ${a.maxPct.toFixed(1)}% │ ${(a.signed / a.n >= 0 ? "+" : "")}${(a.signed / a.n).toFixed(1)}${u}`
    );
    tableLines.push(
      `| ${m} | ${a.n} | ${(a.sumAbs / a.n).toFixed(1)}${u} | ${a.maxAbs.toFixed(1)}${u} | ${(a.sumPct / a.n).toFixed(1)}% | ${a.maxPct.toFixed(1)}% | ${(a.signed / a.n >= 0 ? "+" : "")}${(a.signed / a.n).toFixed(1)}${u} |`
    );
  }

  const worstLines: string[] = [];
  for (const m of metrics) {
    const list = worst.get(m) ?? [];
    if (!list.length) continue;
    const u = unitOf(m);
    worstLines.push(
      `- **${m}:** ` +
        list.map((o) => `${o.title} (ист. ${o.src.toFixed(1)}${u} → расч. ${o.cmp.toFixed(1)}${u}, Δ${o.abs.toFixed(1)}${u})`).join("; ")
    );
  }

  const report = [
    "# Расхождение расчётов: приложение vs первоисточник",
    "",
    `Сгенерировано \`npm run seed:public\` на ${RECIPES.length} реальных рецептах (засыпь/хмель пересчитаны на 30 л).`,
    `Эффективность затирания принята **${DEFAULT_EFFICIENCY}%** для всех рецептов. OG/FG — в «пунктах гравитации» (×1000), т.к. погрешность по SG мизерна и нечитаема.`,
    "Источник — published-параметры из `docs/recepty-podborka-30l.md`. «Расч.» — что насчитал наш калькулятор по ингредиентам каталога.",
    "",
    "## Сводка",
    "",
    "| Метрика | n | ср.\\|Δ\\| | max\\|Δ\\| | ср.% | max% | сист. сдвиг |",
    "|---|---|---|---|---|---|---|",
    ...tableLines,
    "",
    "**Сист. сдвиг** = средняя (расч. − ист.). Плюс = приложение систематически завышает.",
    "",
    "## Худшие отклонения (топ-3 по метрике)",
    "",
    ...worstLines,
    "",
    "## Анализ",
    "",
    "- **OG / ABV** — у большинства рецептов расхождение в пределах нескольких пунктов (фиксированная эффективность 72% против «своей» у источника, часто 70–75%; на крепких засыпях реальная эффективность ниже). Среднее тянут вверх 1–2 выброса (Märzen, отчасти RIS): там засыпь из подборки, пересчитанная на 30 л, физически НЕ даёт заявленный OG (≈13 кг зерна → ~1.097, а в карточке 1.060). Это артефакт масштабирования в самом первоисточнике, который вскрывает наш пересчёт, а не баг калькулятора. Вывод: формула OG адекватна; точечно стоит выверить пересчёт нескольких засыпей в подборке.",
    "- **FG** — большие относительные отклонения у очень сухих/очень сладких сортов: оценка FG идёт от аттенюации дрожжей и не учитывает несбраживаемые (лактоза в Milk Stout → должен быть выше; декстроза/канди → ниже). Кандидат на улучшение: учитывать долю несбраживаемых сахаров и кристального солода в оценке FG.",
    "- **IBU** — самые крупные выбросы у сильно охмелённых рецептов с упором на вирпул/сухое охмеление и поздние навески (Pliny, NEIPA, Pataskala). Чувствительно к: (а) формуле горечи по умолчанию, (б) утилизации вирпула, (в) тому, что first-wort/mash-навески смоделированы как кипячение. Кандидат: сверить дефолтную формулу и коэффициент утилизации вирпула с типовыми калькуляторами (BeerSmith/Brewer's Friend).",
    "- **SRM** — крупные отклонения у тёмных сортов (стауты/портеры): цвет очень чувствителен к навеске жжёных солодов и формуле (Morey/Mosher). Кандидат: проверить цветовую формулу и значения color_lovibond жжёных позиций каталога.",
    "",
    "Числа в карточках/витрине — авторитетные из первоисточника (калькулятор приложения их не перезаписывает). Этот отчёт нужен только чтобы оценить точность самого калькулятора.",
    ""
  ].join("\n");
  const reportPath = new URL("../../../docs/recipe-stats-divergence.md", import.meta.url);
  writeFileSync(reportPath, report, "utf8");
  console.log(`📝  Отчёт сохранён: docs/recipe-stats-divergence.md`);
};

main().catch((error) => {
  console.error("❌  seed:public упал:", error?.stack ?? error?.message ?? error);
  process.exit(1);
});
