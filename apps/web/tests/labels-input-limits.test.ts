import { describe, expect, it } from "vitest";

import {
  isValidIsoDate,
  labelOverridesSchema,
  labelRenderRequestSchema,
  LABEL_FIELD_LIMITS,
  LABEL_LIST_MAX_NAMES,
  LABEL_LIST_NAME_MAX_LENGTH,
  LABEL_NUMBER_MAX,
  type LabelSlots
} from "../features/labels/contracts";
import {
  clampLabelStudioFields,
  LABEL_STUDIO_FIELD_KEYS,
  parseLabelStudioQuery,
  type LabelStudioFields
} from "../features/labels/label-studio-url";
import { renderLabelSvg } from "../features/labels/render";
import { applyLabelOverrides } from "../features/labels/slots";

const blankFields = (): LabelStudioFields =>
  LABEL_STUDIO_FIELD_KEYS.reduce((acc, key) => {
    acc[key] = "";
    return acc;
  }, {} as LabelStudioFields);

// Ограничения ввода студии наклеек: длина полей, диапазон чисел, размер списков
// и чистка текста. Всё это защищает рендер (растеризация не прощает ни
// управляющих символов, ни значений, вылезающих за наклейку).

const slots = (overrides: Partial<LabelSlots> = {}): LabelSlots => ({
  title: "Эль",
  styleName: "IPA",
  abvText: "~5.2%",
  ibu: 38,
  ebc: 12,
  ogText: "1.048",
  fgText: "1.011",
  hops: ["Saaz"],
  malts: ["Pilsner"],
  yeast: "W-34/70",
  description: null,
  showLogo: true,
  showIbuScale: true,
  volumeText: null,
  batchText: null,
  authorName: "Артём",
  bottlingDateText: "11.07.2026",
  qrUrl: null,
  brandText: "BREWED WITH NB",
  ...overrides
});

describe("лимиты длины полей", () => {
  it("схема принимает ровно лимит из карты и отвергает символ сверх него", () => {
    for (const [key, limit] of Object.entries(LABEL_FIELD_LIMITS)) {
      expect(labelOverridesSchema.safeParse({ [key]: "x".repeat(limit) }).success).toBe(true);
      expect(labelOverridesSchema.safeParse({ [key]: "x".repeat(limit + 1) }).success).toBe(false);
    }
  });

  it("у каждого поля формы студии есть лимит (новое поле нельзя завести без него)", () => {
    for (const key of LABEL_STUDIO_FIELD_KEYS) {
      expect(LABEL_FIELD_LIMITS[key]).toBeGreaterThan(0);
    }
  });

  it("поля из чужой ссылки режутся по тем же лимитам", () => {
    const parsed = parseLabelStudioQuery({ title: "я".repeat(500) }, { qrAvailable: false });
    expect(parsed.fields?.title).toHaveLength(LABEL_FIELD_LIMITS.title);
  });
});

describe("клампы IBU/EBC", () => {
  it("значение выше потолка прижимается к потолку", () => {
    expect(applyLabelOverrides(slots(), { ibu: "99999999" }).ibu).toBe(LABEL_NUMBER_MAX);
    expect(applyLabelOverrides(slots(), { ebc: "888888" }).ebc).toBe(LABEL_NUMBER_MAX);
  });

  it("отрицательное, hex и экспонента не печатаются: остаётся значение рецепта", () => {
    // Отрицательный IBU уводил остриё маркера шкалы за край наклейки,
    // а Number() принимал «0x10» (→16) и «1e5» (→100000) как числа.
    expect(applyLabelOverrides(slots(), { ibu: "-80" }).ibu).toBe(38);
    expect(applyLabelOverrides(slots(), { ebc: "-5" }).ebc).toBe(12);
    expect(applyLabelOverrides(slots(), { ibu: "0x10" }).ibu).toBe(38);
    expect(applyLabelOverrides(slots(), { ibu: "1e5" }).ibu).toBe(38);
  });

  it("обычное число и запятая как разделитель работают по-прежнему", () => {
    expect(applyLabelOverrides(slots(), { ibu: "70" }).ibu).toBe(70);
    expect(applyLabelOverrides(slots(), { ebc: "40,6" }).ebc).toBe(41);
    expect(applyLabelOverrides(slots(), { ibu: "" }).ibu).toBeNull();
  });
});

describe("списки солода и хмеля", () => {
  it("количество имён ограничено: остальное не доезжает до шаблона", () => {
    const many = Array.from({ length: 40 }, (_, index) => `Солод ${index}`).join(", ");
    expect(applyLabelOverrides(slots(), { malts: many }).malts).toHaveLength(LABEL_LIST_MAX_NAMES);
  });

  it("длина одного имени ограничена", () => {
    const long = "х".repeat(200);
    const [name] = applyLabelOverrides(slots(), { hops: long }).hops;
    expect(name).toHaveLength(LABEL_LIST_NAME_MAX_LENGTH);
  });
});

describe("чистка текста", () => {
  it("переводы строк и табы схлопываются в пробел (в SVG переноса нет)", () => {
    expect(applyLabelOverrides(slots(), { description: " Тёмный,\nкак\t\tночь. " }).description).toBe(
      "Тёмный, как ночь."
    );
    expect(applyLabelOverrides(slots(), { title: "Гаражный\nпортер" }).title).toBe("Гаражный портер");
  });

  it("управляющие символы вырезаются (не-XML символ ронял рендер в 500)", () => {
    expect(applyLabelOverrides(slots(), { title: "Ста\u0001ут" }).title).toBe("Стаут");
    // Строка из одних управляющих символов = пустое поле, а не «печатать мусор».
    expect(applyLabelOverrides(slots(), { style: "\u0001\u001f" }).styleName).toBeNull();
  });
});

describe("«не-символы» XML U+FFFE/U+FFFF", () => {
  it("вырезаются единственной дверью sanitizeText (роняли resvg в 500)", () => {
    // Вектор: ?title=%EF%BF%BE / ?abv=%EF%BF%BF — валидный UTF-8, переживает
    // zod(max) и URL-декод, но вне XML 1.0. escapeXml их не экранирует, resvg
    // падает 'non-XML character found' → анонимный 500 на /api/labels/custom.
    expect(applyLabelOverrides(slots(), { title: "Пор\uFFFEтер" }).title).toBe("Портер");
    expect(applyLabelOverrides(slots(), { abv: "\uFFFF" }).abvText).toBeNull();
    // Сквозная проверка: после чистки в SVG (вход resvg) не осталось «не-символов».
    const clean = applyLabelOverrides(slots(), { title: "Стаут\uFFFE\uFFFF" });
    const { svg } = renderLabelSvg({ template: "typographic", preset: "L", dpi: 203, slots: clean });
    expect(svg).not.toContain("\uFFFE");
    expect(svg).not.toContain("\uFFFF");
  });
});

describe("префил из рецепта режется по лимитам наклейки", () => {
  it("длинное название рецепта (>лимита наклейки) обрезается до лимита", () => {
    // Рецепт разрешает title до 180 (recipes/contracts.ts), наклейка — 120.
    // maxLength у <input> не трогает предзаполненное значение, поэтому режем при
    // сборке полей — иначе форма собрала бы запрос, отвергаемый сервером 400-ым.
    const clamped = clampLabelStudioFields({ ...blankFields(), title: "Э".repeat(150) });
    expect(clamped.title).toHaveLength(LABEL_FIELD_LIMITS.title);
    expect(labelOverridesSchema.safeParse({ title: clamped.title }).success).toBe(true);
  });

  it("склеенный список солодов длиннее 240 обрезается до лимита", () => {
    const longMalts = Array.from({ length: 12 }, (_, i) => `Солод №${i} тёмный карамельный`).join(", ");
    expect(longMalts.length).toBeGreaterThan(LABEL_FIELD_LIMITS.malts);
    const clamped = clampLabelStudioFields({ ...blankFields(), malts: longMalts });
    expect(clamped.malts.length).toBeLessThanOrEqual(LABEL_FIELD_LIMITS.malts);
    expect(labelOverridesSchema.safeParse({ malts: clamped.malts }).success).toBe(true);
  });
});

describe("дата розлива", () => {
  it("календарная проверка, а не только формат", () => {
    expect(isValidIsoDate("2026-07-11")).toBe(true);
    expect(isValidIsoDate("2026-02-31")).toBe(false);
    expect(isValidIsoDate("9999-99-99")).toBe(false);
    expect(labelRenderRequestSchema.safeParse({ bottlingDate: "2026-02-31" }).success).toBe(false);
    expect(parseLabelStudioQuery({ bottlingDate: "2026-02-31" }, { qrAvailable: false }).bottlingDate).toBeUndefined();
  });
});
