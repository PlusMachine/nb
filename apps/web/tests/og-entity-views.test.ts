import { describe, expect, it } from "vitest";
import type { ContentArticle } from "@nb/content";

import type { BottleParams } from "../features/beer-page/bottle-params";
import type { BeerPresentationDto } from "../features/beer-page/contracts";
import { getCalculatorBySlug } from "../features/calculators/catalog";
import type { ContentArticleDto } from "../features/content-articles/contracts";
import type { UserCatalogIngredientDto } from "../features/ingredients/contracts";
import type { MasterPublishedSnapshot } from "../features/masters/contracts";
import { srmToHex } from "../features/recipes/beer-color";
import { buildArticleOgView } from "../features/og/article";
import { buildBeerOgView } from "../features/og/beer";
import { buildBjcpStyleOgView } from "../features/og/bjcp";
import { buildCalculatorOgView } from "../features/og/calculator";
import { buildIngredientOgView } from "../features/og/ingredient";
import { buildMasterOgView } from "../features/og/master";
import { sanitizeOgCardView, type OgCardView } from "../features/og/models";
import { OG_COLORS } from "../features/og/theme";

const OPTS = { domain: "hmelo.example", wordmark: "NB" };

// --- Ингредиент ----------------------------------------------------------------

const ingredient = (overrides: Record<string, unknown>): UserCatalogIngredientDto =>
  ({
    primaryLabelRu: "Ингредиент",
    secondaryLabelRu: null,
    category: "hop",
    subtype: null,
    countryName: null,
    brand: null,
    technicalData: null,
    ...overrides
  }) as unknown as UserCatalogIngredientDto;

describe("buildIngredientOgView", () => {
  it("хмель: альфа-диапазон + форма + страна, нейтральная полоса", () => {
    const view = buildIngredientOgView(
      ingredient({
        primaryLabelRu: "Цитра",
        category: "hop",
        countryName: "США",
        technicalData: { type: "hop", alphaAcidPctMin: 12, alphaAcidPctMax: 14, hopForm: "pellet" }
      }),
      OPTS
    );
    expect(view.eyebrow).toBe("Хмель");
    expect(view.title).toBe("Цитра");
    expect(view.factsLine).toContain("Альфа 12–14 %");
    expect(view.factsLine).toContain("США");
    expect(view.strip).toEqual({ kind: "solid", color: OG_COLORS.neutralStrip });
  });

  it("солод: цвет EBC + бренд + страна, полоса цвета пива из EBC", () => {
    const view = buildIngredientOgView(
      ingredient({
        primaryLabelRu: "Мюнхенский",
        category: "fermentable",
        subtype: "malt",
        brand: "Курский солод",
        countryName: "Россия",
        technicalData: { type: "malt", colorEbcMin: 12, colorEbcMax: 16 }
      }),
      OPTS
    );
    expect(view.eyebrow).toBe("Солод");
    expect(view.factsLine).toContain("12–16 EBC");
    expect(view.factsLine).toContain("Курский солод");
    expect(view.factsLine).toContain("Россия");
    // Полоса — реальный цвет: EBC 14 (среднее) / 1.97 ≈ 7.1 SRM, не нейтраль.
    expect(view.strip.kind).toBe("solid");
    if (view.strip.kind === "solid") {
      expect(view.strip.color).not.toBe(OG_COLORS.neutralStrip);
      expect(view.strip.color.toLowerCase()).toBe(srmToHex(14 / 1.97).toLowerCase());
    }
  });

  it("дрожжи: аттенюация + температура + форма", () => {
    const view = buildIngredientOgView(
      ingredient({
        primaryLabelRu: "US-05",
        category: "yeast",
        technicalData: {
          type: "yeast",
          attenuationPctMin: 78,
          attenuationPctMax: 82,
          fermentationTempCMin: 15,
          fermentationTempCMax: 24,
          form: "dry"
        }
      }),
      OPTS
    );
    expect(view.eyebrow).toBe("Дрожжи");
    expect(view.factsLine).toContain("Аттенюация 78–82 %");
    expect(view.factsLine).toContain("15–24 °C");
    expect(view.factsLine).toContain("сухие");
  });

  it("вторичное имя уходит в subtitle, если отличается", () => {
    const view = buildIngredientOgView(
      ingredient({ primaryLabelRu: "Сааз", secondaryLabelRu: "Saaz", category: "hop" }),
      OPTS
    );
    expect(view.subtitle).toBe("Saaz");
  });
});

// --- BJCP-стиль ----------------------------------------------------------------

const article = (overrides: Partial<ContentArticle> = {}): ContentArticle =>
  ({
    slug: "czech-premium-pale-lager",
    kind: "bjcp_style",
    bjcpId: "3B",
    title: "Чешский премиум пилснер",
    titleEn: "Czech Premium Pale Lager",
    vitalStatistics: {
      og: "1.044 – 1.052",
      fg: "1.013 – 1.017",
      ibu: "30 - 45",
      srm: "3.5 – 6",
      abv: "4.2 - 5.8%",
      note: null,
      sessionAbv: null,
      standardAbv: null,
      doubleAbv: null
    },
    ...overrides
  }) as unknown as ContentArticle;

describe("buildBjcpStyleOgView", () => {
  it("eyebrow с кодом, vitals нормализованы, titleEn в subtitle, градиент цвета", () => {
    const view = buildBjcpStyleOgView(article(), OPTS);
    expect(view.eyebrow).toBe("Стиль BJCP · 3B");
    expect(view.title).toBe("Чешский премиум пилснер");
    expect(view.subtitle).toBe("Czech Premium Pale Lager");
    expect(view.factsLine).toBe("OG 1.044–1.052 · IBU 30–45 · ABV 4.2–5.8%");
    expect(view.strip.kind).toBe("gradient");
  });

  it("без SRM — нейтральная полоса, без числовых vitals — нет строки фактов", () => {
    const view = buildBjcpStyleOgView(
      article({
        vitalStatistics: {
          og: null, fg: null, ibu: null, srm: null, abv: null,
          note: "Same as base style.", sessionAbv: null, standardAbv: null, doubleAbv: null
        }
      }),
      OPTS
    );
    expect(view.strip).toEqual({ kind: "solid", color: OG_COLORS.neutralStrip });
    expect(view.factsLine).toBeNull();
  });
});

// --- Калькулятор ---------------------------------------------------------------

describe("buildCalculatorOgView", () => {
  it("раздел в eyebrow, описание в subtitle, цвет-акцент из accentClassName", () => {
    const item = getCalculatorBySlug("ibu");
    expect(item).not.toBeNull();
    const view = buildCalculatorOgView(item!, OPTS);
    expect(view.eyebrow).toBe(`Калькулятор · ${item!.section}`);
    expect(view.title).toBe(item!.title);
    expect(view.subtitle).toBeTruthy();
    // ibu → border-l-emerald-400 → #34d399.
    expect(view.strip).toEqual({ kind: "solid", color: "#34d399" });
  });
});

// --- Статья --------------------------------------------------------------------

const articleDto = (overrides: Partial<ContentArticleDto> = {}): ContentArticleDto =>
  ({
    slug: "cold-crash",
    title: "Холодное осаждение (cold crash)",
    seoTitle: null,
    coverImageUrl: null,
    readingMinutes: 8,
    authorName: "Редакция NB",
    publishedAt: new Date("2026-07-12T00:00:00.000Z"),
    createdAt: new Date("2026-07-10T00:00:00.000Z"),
    updatedAt: new Date("2026-07-12T00:00:00.000Z"),
    ...overrides
  }) as unknown as ContentArticleDto;

describe("buildArticleOgView", () => {
  it("eyebrow «Статья», время чтения + дата, автор в subtitle, спектр-полоса", () => {
    const view = buildArticleOgView(articleDto(), OPTS);
    expect(view.eyebrow).toBe("Статья");
    expect(view.title).toBe("Холодное осаждение (cold crash)");
    expect(view.subtitle).toBe("Автор — Редакция NB");
    expect(view.factsLine).toContain("8 мин чтения");
    expect(view.factsLine).toContain("июля");
    expect(view.strip.kind).toBe("gradient");
  });
});

// --- Мастер --------------------------------------------------------------------

const snapshot = (overrides: Partial<MasterPublishedSnapshot> = {}): MasterPublishedSnapshot => ({
  version: 1,
  displayName: "Мастерская Ивана",
  city: "Москва",
  specializations: ["vessels", "automation"],
  summary: "Ёмкости и автоматика на заказ.",
  about: "",
  contacts: {},
  craftSince: null,
  gallery: [],
  items: [],
  publishedAt: "2026-07-12T00:00:00.000Z",
  ...overrides
});

describe("buildMasterOgView", () => {
  it("eyebrow «Мастерская · Маркет», специализации + город", () => {
    const view = buildMasterOgView(snapshot(), OPTS);
    expect(view.eyebrow).toBe("Мастерская · Маркет");
    expect(view.title).toBe("Мастерская Ивана");
    expect(view.factsLine).toBe("Ёмкости и ЦКТ · Автоматика · Москва");
    expect(view.strip.kind).toBe("gradient");
  });
});

// --- Пиво ----------------------------------------------------------------------

const beer = (overrides: Partial<BeerPresentationDto> = {}): BeerPresentationDto => ({
  slug: "moe-ipa",
  title: "Моё IPA",
  style: { code: "21A", name: "American IPA", articleHref: "/bjcp/american-ipa" },
  abv: 6.4,
  ibu: 55,
  colorSrm: 8,
  og: 1.062,
  descriptionParagraphs: [],
  descriptionSource: null,
  author: { displayName: "Иван", image: null },
  heroPhotoUrl: null,
  styleImageUrl: "/images/bjcp/21a.png",
  isPublished: true,
  ...overrides
});

const bottle = (overrides: Partial<BottleParams> = {}): BottleParams => ({
  bottlingDate: "2026-07-12",
  batchNo: "14",
  abv: 6.6,
  ...overrides
});

describe("buildBeerOgView", () => {
  it("eyebrow со стилем+кодом, ABV бутылки приоритетнее, факты бутылки, цвет пива", () => {
    const view = buildBeerOgView(beer(), bottle(), OPTS);
    expect(view.eyebrow).toBe("Пиво · American IPA · BJCP 21A");
    expect(view.title).toBe("Моё IPA");
    expect(view.subtitle).toBe("Автор — Иван");
    // Крепость бутылки (6.6) перебивает расчётную рецепта (6.4).
    expect(view.factsLine).toBe("ABV 6.6 % · IBU 55");
    expect(view.secondaryLine).toEqual({ kind: "text", text: "Разлито 12.07.2026 · партия #14" });
    expect(view.strip).toEqual({ kind: "solid", color: srmToHex(8) });
  });

  it("без стиля — eyebrow «Пиво»; без фактов бутылки — нет второй строки", () => {
    const view = buildBeerOgView(
      beer({ style: null }),
      bottle({ bottlingDate: null, batchNo: null }),
      OPTS
    );
    expect(view.eyebrow).toBe("Пиво");
    expect(view.secondaryLine).toBeNull();
  });
});

// --- Эмодзи-предохранитель перед Satori -----------------------------------------

describe("sanitizeOgCardView", () => {
  const base: OgCardView = {
    eyebrow: "Пиво",
    title: "Моё IPA",
    titleFontSize: 60,
    subtitle: "Автор — 🍺Вася 🇷🇺",
    factsLine: "ABV 6.6 % 🔥 · IBU 55",
    secondaryLine: { kind: "text", text: "Разлито 12.07.2026 🍻" },
    strip: { kind: "solid", color: "#000000" },
    domain: "hmelo.example",
    wordmark: "NB"
  };

  it("вырезает эмодзи из subtitle/factsLine/secondaryLine (иначе Satori тянет их с CDN)", () => {
    const v = sanitizeOgCardView(base);
    expect(v.subtitle).toBe("Автор — Вася");
    expect(v.factsLine).toBe("ABV 6.6 % · IBU 55");
    expect(v.secondaryLine).toEqual({ kind: "text", text: "Разлито 12.07.2026" });
    expect(v.subtitle).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("поле, ставшее пустым после стрипа, обнуляется (не рисуем пустую строку)", () => {
    const v = sanitizeOgCardView({ ...base, subtitle: "🍺🔥", factsLine: "🇷🇺" });
    expect(v.subtitle).toBeNull();
    expect(v.factsLine).toBeNull();
  });
});
