import { describe, expect, it } from "vitest";

import { getCalculatorBySlug } from "../features/calculators/catalog";
import {
  calculatorQueryHasKnownFields,
  getCalculatorDefinition,
  type CalculatorResult
} from "../features/calculators/definitions";
import {
  buildCalculatorMetadata,
  buildCalculatorShareMetadata
} from "../features/calculators/seo";
import { buildCalculatorResultOgView } from "../features/og/calculator";

// Ф4 (docs/specs/og-images.md §5.2): карточка калькулятора v2 (результат
// расчёта из share-ссылки) + метаданные саброута /share. Паттерн — по образцу
// tests/og-entity-views.test.ts.

const OPTS = { domain: "hmelo.example", wordmark: "NB" };

const ibuItem = getCalculatorBySlug("ibu");
if (!ibuItem) {
  throw new Error("Тест ожидает калькулятор ibu в каталоге");
}

// Синтетическая фикстура — для проверки самой логики (дедуп/helper-в-label/обрезка/эмодзи)
// независимо от движка. Первый стат намеренно дублирует subtitle целиком (как реальный
// BU:GU у IBU), остальные несут helper — так же, как вклады внесений хмеля у реального
// калькулятора. Отдельный интеграционный кейс на живом definitions.calculate ниже.
const ibuResult = (overrides: Partial<CalculatorResult> = {}): CalculatorResult => ({
  primary: { label: "IBU всего", value: "42", helper: "BU:GU 0.42 — сбалансированное" },
  stats: [
    { label: "BU:GU", value: "0.42", helper: "сбалансированное" },
    { label: "Кипячение", value: "30 IBU", helper: "20 г · 60 мин" },
    { label: "Вирпул", value: "12 IBU", helper: "30 г · 15 мин" },
    { label: "Формула", value: "Tinseth" }
  ],
  ...overrides
});

describe("buildCalculatorResultOgView", () => {
  it("дубликат subtitle отбрасывается ДО среза (следующий стат добирается на его место), helper подмешивается в label", () => {
    const view = buildCalculatorResultOgView(ibuItem, ibuResult(), OPTS);
    expect(view.eyebrow).toBe(`Калькулятор · ${ibuItem.shortTitle}`);
    expect(view.title).toBe("42");
    expect(view.subtitle).toBe("IBU всего · BU:GU 0.42 — сбалансированное");
    // BU:GU (label+value целиком в subtitle) отброшен ДО среза на 3 — на его место
    // добирается 4-й стат "Формула", которого иначе не было бы видно в карточке.
    expect(view.stats).toEqual([
      { label: "Кипячение · 20 г · 60 мин", value: "30 IBU" },
      { label: "Вирпул · 30 г · 15 мин", value: "12 IBU" },
      { label: "Формула", value: "Tinseth" }
    ]);
    expect(view.strip).toEqual({ kind: "solid", color: "#34d399" });
  });

  it("без helper и без stats — subtitle только label, stats undefined", () => {
    const view = buildCalculatorResultOgView(
      ibuItem,
      ibuResult({ primary: { label: "IBU всего", value: "18" }, stats: [] }),
      OPTS
    );
    expect(view.subtitle).toBe("IBU всего");
    expect(view.stats).toBeUndefined();
  });

  it("эмодзи вырезаются, длинные строки обрезаются", () => {
    const longHelper =
      "Очень длинная пояснительная строка про баланс горечи и солода в этом рецепте домашнего пива, которая точно не поместится в лимит";
    const view = buildCalculatorResultOgView(
      ibuItem,
      ibuResult({
        primary: { label: "IBU 🍺 всего", value: "42", helper: longHelper }
      }),
      OPTS
    );
    expect(view.subtitle).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(view.subtitle!.length).toBeLessThanOrEqual(118);
    expect(view.subtitle!.endsWith("…")).toBe(true);
  });

  it("пустое значение primary → title «—»", () => {
    const view = buildCalculatorResultOgView(
      ibuItem,
      ibuResult({ primary: { label: "IBU всего", value: "" } }),
      OPTS
    );
    expect(view.title).toBe("—");
  });

  it("stats с пустым label/value после стрипа отфильтровываются", () => {
    const view = buildCalculatorResultOgView(
      ibuItem,
      ibuResult({ stats: [{ label: "🍺", value: "1.056" }, { label: "OG", value: "" }] }),
      OPTS
    );
    expect(view.stats).toBeUndefined();
  });

  it("на живом IBU-калькуляторе: BU:GU не дублируется, а вклады внесений несут реальные входы (масса·время)", () => {
    // Синтетическая ibuResult() выше выдумывала stats — этот кейс гоняет реальный движок
    // (definitions.calculate), чтобы проверить фактический разрыв из ревью: BU:GU
    // дублировал subtitle, а две строки внесений подписывались одинаково "Кипячение".
    const definition = getCalculatorDefinition("ibu");
    if (!definition) {
      throw new Error("Тест ожидает калькулятор ibu в definitions");
    }

    const defaultRows = definition.defaults.additions as Array<Record<string, unknown>>;
    const state = {
      ...definition.defaults,
      // Оба внесения — "Кипячение": до фикса ячейки были бы неотличимы друг от друга,
      // helper (масса·время) должен их развести.
      additions: [
        { ...defaultRows[0], use: "boil", amountG: 20, timeMinutes: 60 },
        { ...defaultRows[1], use: "boil", amountG: 15, timeMinutes: 20 }
      ]
    };
    const result = definition.calculate(state);
    const view = buildCalculatorResultOgView(ibuItem, result, OPTS);

    const subtitle = view.subtitle ?? "";
    const stats = view.stats ?? [];
    expect(stats.length).toBeGreaterThan(0);

    // Ни одна ячейка не дублирует subtitle целиком (BU:GU-стат должен быть отброшен).
    for (const stat of stats) {
      expect(subtitle.includes(stat.label) && subtitle.includes(stat.value)).toBe(false);
    }

    // Хотя бы одна ячейка несёт входы (масса·время) в подписи.
    expect(stats.some((stat) => stat.label.includes(" г · ") && stat.label.includes("мин"))).toBe(true);

    // Подписи ячеек уникальны (helper развёл одинаковые "Кипячение").
    const labels = stats.map((stat) => stat.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("calculatorQueryHasKnownFields", () => {
  const definition = getCalculatorDefinition("ibu");
  if (!definition) {
    throw new Error("Тест ожидает калькулятор ibu в definitions");
  }

  it("query с известным скалярным полем → true", () => {
    expect(calculatorQueryHasKnownFields(definition, { wortGravity: "1.056" })).toBe(true);
  });

  it("query с известным array-полем → true", () => {
    expect(calculatorQueryHasKnownFields(definition, { additions: "20~10~60~boil~pellet" })).toBe(true);
  });

  it("query только с посторонним ключом (utm_source) → false", () => {
    expect(calculatorQueryHasKnownFields(definition, { utm_source: "tg" })).toBe(false);
  });

  it("пустой query → false", () => {
    expect(calculatorQueryHasKnownFields(definition, {})).toBe(false);
  });
});

describe("getCalculatorDefinition", () => {
  it("слаг, совпадающий с унаследованным ключом Object.prototype, не возвращает мусорный объект", () => {
    // `in` вместо Object.hasOwn видел бы constructor/toString/__proto__ как "существующие" —
    // регрессионный кейс на P2-находку ревью.
    expect(getCalculatorDefinition("constructor")).toBeNull();
    expect(getCalculatorDefinition("toString")).toBeNull();
    expect(getCalculatorDefinition("__proto__")).toBeNull();
  });

  it("существующий слаг возвращает определение", () => {
    expect(getCalculatorDefinition("ibu")).not.toBeNull();
  });
});

// --- Метаданные ------------------------------------------------------------------

describe("buildCalculatorMetadata", () => {
  it("картинка 1200×630 + summary_large_image (route-хендлер отдаёт v1-карточку всегда)", () => {
    const metadata = buildCalculatorMetadata(ibuItem);
    expect(metadata.openGraph?.images).toEqual([
      { url: `/api/og/calculators/${ibuItem.slug}`, width: 1200, height: 630, alt: ibuItem.seoTitle }
    ]);
    expect(metadata.twitter).toEqual({ card: "summary_large_image" });
  });
});

describe("buildCalculatorShareMetadata", () => {
  it("canonical чистый (без query), robots noindex+follow, og:image с slug+query, twitter large", () => {
    const queryString = "og=1.056&fg=1.012&hopWeight=25";
    const metadata = buildCalculatorShareMetadata(ibuItem, ibuResult(), { queryString });

    expect(metadata.alternates?.canonical).toBe(`/calculators/${ibuItem.slug}`);
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.openGraph?.url).toBe(`/calculators/${ibuItem.slug}`);
    expect(metadata.title).toBe("IBU всего: 42");

    const images = metadata.openGraph?.images;
    const image = Array.isArray(images) ? images[0] : images;
    expect(image).toMatchObject({
      url: `/api/og/calculators/${ibuItem.slug}?${queryString}`,
      width: 1200,
      height: 630
    });
    expect(metadata.twitter).toEqual({ card: "summary_large_image" });
  });
});
