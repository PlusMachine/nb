import type { CatalogLandingSlug } from "@/features/ingredients/contracts";
import { catalogCategoryLandings } from "@/features/ingredients/seo";

import { buildBrandSpectrumStops, type OgCardView } from "./models";

// Ф3 (docs/specs/og-images.md): обложки разделов — хабы (главная, /recipes,
// /catalog, /calculators, /bjcp, /articles, /market, /demo, /labels,
// /brewforge) + категорийные лендинги каталога (/catalog/<slug>). У обложки
// нет статов сущности — только eyebrow/заголовок на фирменном SRM-градиенте
// (тот же спектр, что у статьи/мастера в Ф2).
//
// ⚠ Циклический импорт: features/ingredients/seo.ts импортирует
// getSectionOgImage отсюда (чтобы отдать OG-картинку лендинга в metadata), а
// этот файл импортирует catalogCategoryLandings оттуда. Модуль, загруженный
// первым, ещё не успел проинициализировать свои module-scope конст — поэтому
// catalogCategoryLandings НЕЛЬЗЯ трогать на module scope этого файла (TDZ).
// Реестр лендингов строится лениво (внутри функции) и мемоизируется при
// первом обращении, когда оба модуля уже точно проинициализированы.

export type SectionOgEntry = { eyebrow?: string; title: string };

// Строки — те, что реально есть в проде (заголовки h1/hero соответствующих
// страниц), а не новые формулировки. Там, где строка уже живёт как
// НЕэкспортированная module-private константа (RECIPES_LIST_TITLE в
// features/recipes/seo.ts, CATALOG_BASE_TITLE в features/ingredients/seo.ts,
// MARKET_LIST_TITLE в features/masters/seo.ts), импортировать её нельзя —
// оставляем литерал с комментарием-источником.
// `as const satisfies` — ключи хабов известны на этапе компиляции (не просто
// string), поэтому опечатка в ключе на вызове getSectionOgImage("catalog!")
// ловится tsc, а не падает молча в проде на резолве раздела.
const SECTION_HUBS = {
  // app/(public)/page.tsx — hero главной.
  home: { eyebrow: "Домашнее пивоварение", title: "Свари своё пиво — от рецепта до розлива" },
  // RECIPES_LIST_TITLE, features/recipes/seo.ts.
  recipes: { title: "Рецепты сообщества" },
  // CATALOG_BASE_TITLE, features/ingredients/seo.ts.
  catalog: { title: "Каталог ингредиентов для пивоварения" },
  // app/(public)/calculators/page.tsx.
  calculators: { title: "Калькуляторы для пивоварения" },
  // app/(public)/bjcp/page.tsx.
  bjcp: { title: "Стили пива — справочник BJCP 2021" },
  // app/(public)/articles/page.tsx.
  articles: { title: "Статьи и обзоры для пивоваров" },
  // MARKET_LIST_TITLE, features/masters/seo.ts.
  market: { title: "Маркет пивоварного оборудования от мастеров" },
  // app/(public)/demo/page.tsx.
  demo: { title: "Демо" },
  // app/(public)/labels/page.tsx.
  labels: { title: "Наклейки на бутылки" },
  // app/(public)/brewforge/page.tsx.
  brewforge: { title: "BrewForge — автоматика варки" }
} as const satisfies Record<string, SectionOgEntry>;

/** Ключи хабов реестра — литеральный union, выводится из SECTION_HUBS. */
export type SectionHubKey = keyof typeof SECTION_HUBS;

/**
 * Все допустимые ключи обложек разделов: хабы либо категорийный лендинг
 * каталога ("catalog-<slug>"). CatalogLandingSlug — тип-only импорт из
 * ingredients/contracts.ts (не из seo.ts — там цикл, см. предупреждение выше),
 * его 7 значений 1:1 совпадают с записями catalogCategoryLandings (по одной на
 * слаг) — поэтому getSectionOgImage ниже резолвит ЛЮБОЙ SectionOgKey без null.
 */
export type SectionOgKey = SectionHubKey | `${typeof LANDING_KEY_PREFIX}${CatalogLandingSlug}`;

const LANDING_KEY_PREFIX = "catalog-";

let cachedLandingRegistry: Record<string, SectionOgEntry> | null = null;

/** Ленивый реестр обложек категорийных лендингов каталога — см. предупреждение выше про TDZ. */
const getLandingRegistry = (): Record<string, SectionOgEntry> => {
  if (cachedLandingRegistry) {
    return cachedLandingRegistry;
  }
  const registry: Record<string, SectionOgEntry> = {};
  for (const landing of catalogCategoryLandings) {
    // title обложки — человеческий h1 лендинга, НЕ metaTitle (там есть хвост «— каталог»).
    registry[`${LANDING_KEY_PREFIX}${landing.slug}`] = { eyebrow: "Каталог ингредиентов", title: landing.h1 };
  }
  cachedLandingRegistry = registry;
  return registry;
};

// SECTION_HUBS типизирован как литеральный объект (as const satisfies) ради
// SectionHubKey — у него нет индексной сигнатуры под произвольный string
// (вход резолвера — сырой ключ из URL роута), поэтому лукап здесь через приведение к Record.
const SECTION_HUBS_LOOKUP: Record<string, SectionOgEntry> = SECTION_HUBS;

const resolveSectionEntry = (key: string): SectionOgEntry | null => SECTION_HUBS_LOOKUP[key] ?? getLandingRegistry()[key] ?? null;

/** Все известные ключи обложек разделов — для тестов/будущих итераций. Функция, не константа: реестр лендингов ленивый. */
export const listSectionOgKeys = (): string[] => [...Object.keys(SECTION_HUBS), ...Object.keys(getLandingRegistry())];

/**
 * Кегль заголовка обложки раздела: своя (более крупная) ступень, чем у карточек
 * сущностей (theme.ts resolveTitleFontSize) — у обложки нет строки статов под
 * заголовком, места больше.
 */
export const resolveSectionTitleFontSize = (title: string): number => {
  const length = title.length;
  if (length <= 8) return 104;
  if (length <= 16) return 92;
  if (length <= 24) return 76;
  if (length <= 34) return 64;
  if (length <= 44) return 54;
  return 46;
};

/** View-модель обложки раздела для renderOgCard. null — неизвестный ключ. */
export const resolveSectionOgView = (key: string, opts: { domain: string; wordmark: string }): OgCardView | null => {
  const entry = resolveSectionEntry(key);
  if (!entry) {
    return null;
  }
  return {
    eyebrow: entry.eyebrow ?? "",
    title: entry.title,
    titleFontSize: resolveSectionTitleFontSize(entry.title),
    // У обложки раздела нет статов/секондари-строки под заголовком — без
    // центрирования блок eyebrow+title прижимался бы к верху холста, оставляя
    // половину пустой (Ф3 адверс-ревью).
    centered: true,
    strip: { kind: "gradient", stops: buildBrandSpectrumStops() },
    domain: opts.domain,
    wordmark: opts.wordmark
  };
};

/**
 * Публичный хелпер для seo-файлов разделов: OG-картинка обложки по ключу.
 * key типизирован как SectionOgKey (хаб-ключ реестра либо "catalog-<слаг>") —
 * опечатка ключа в page.tsx/seo.ts не компилируется, а не падает молча в
 * рантайме. Возвращает без null: entry не найтись не может (см. комментарий у
 * SectionOgKey) — throw ниже покрывает только теоретическое рассогласование
 * между CatalogLandingSlug и catalogCategoryLandings, если кто-то поправит одно
 * без другого.
 */
export const getSectionOgImage = (key: SectionOgKey): { url: string; width: number; height: number; alt: string } => {
  const entry = resolveSectionEntry(key);
  if (!entry) {
    throw new Error(`og section: неизвестный ключ обложки "${key}" (не должно случаться для SectionOgKey)`);
  }
  return { url: `/api/og/sections/${key}`, width: 1200, height: 630, alt: entry.title };
};
