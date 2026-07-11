import { describe, expect, it } from "vitest";

// Покрытие zod-схем форм витрины мастеров (docs/masters-showcase-review-findings.md, #27):
// masterProfileInputSchema/masterItemInputSchema (@/features/masters/contracts) —
// только читаем контракт (его правит другой параллельный агент), тестируем
// текущее поведение. Если границы к моменту прогона изменились, ожидания
// подгоняются под фактический контракт (отмечено в комментариях там, где важно).

import { masterItemInputSchema, masterProfileInputSchema, masterSpecializationKeys } from "../features/masters/contracts";

const currentYear = new Date().getFullYear();

// Валидный базовый профиль — минимальный набор полей, проходящий все правила
// (в т.ч. «хотя бы один контакт»). Тесты переопределяют по одному полю за раз.
const validProfile = () => ({
  displayName: "Иван Кузнецов",
  city: "Тюмень",
  specializations: ["vessels"] as string[],
  summary: "Делаю ЦКТ и краны на заказ.",
  about: "Работаю с нержавейкой уже 10 лет.",
  contactTelegram: "@ivanov_forge"
});

describe("masterProfileInputSchema", () => {
  describe("contactTelegram", () => {
    it.each([
      ["@ivanov_forge", true],
      ["https://t.me/ivanov_forge", true],
      ["не телеграм совсем", false]
    ])("%s -> valid=%s", (value, expected) => {
      const result = masterProfileInputSchema.safeParse({ ...validProfile(), contactTelegram: value });
      expect(result.success).toBe(expected);
    });
  });

  describe("contactPhone", () => {
    it.each([
      ["+7 900 123-45-67", true],
      ["+-+-+-", false]
    ])("%s -> valid=%s", (value, expected) => {
      const result = masterProfileInputSchema.safeParse({
        ...validProfile(),
        contactTelegram: undefined,
        contactPhone: value
      });
      expect(result.success).toBe(expected);
    });
  });

  describe("contactWebsite", () => {
    it.each([
      ["https://example.com", true],
      ["javascript:alert(1)", false],
      ["example.com", false] // без схемы http(s) — не парсится как абсолютный URL
    ])("%s -> valid=%s", (value, expected) => {
      const result = masterProfileInputSchema.safeParse({
        ...validProfile(),
        contactTelegram: undefined,
        contactWebsite: value
      });
      expect(result.success).toBe(expected);
    });
  });

  describe("contactEmail", () => {
    it.each([
      ["master@example.com", true],
      ["not-an-email", false],
      [`${"a".repeat(195)}@example.com`, false] // > 200 символов
    ])("%s -> valid=%s", (value, expected) => {
      const result = masterProfileInputSchema.safeParse({
        ...validProfile(),
        contactTelegram: undefined,
        contactEmail: value
      });
      expect(result.success).toBe(expected);
    });
  });

  describe("craftSince", () => {
    it.each([
      [1980, true],
      [currentYear, true],
      [1979, false],
      [currentYear + 1, false],
      [null, true],
      [undefined, true]
    ])("%s -> valid=%s", (value, expected) => {
      const result = masterProfileInputSchema.safeParse({ ...validProfile(), craftSince: value });
      expect(result.success).toBe(expected);
    });
  });

  describe("specializations", () => {
    it("1 специализация — ок", () => {
      const result = masterProfileInputSchema.safeParse({ ...validProfile(), specializations: ["vessels"] });
      expect(result.success).toBe(true);
    });

    it("4 специализации (максимум) — ок", () => {
      const result = masterProfileInputSchema.safeParse({
        ...validProfile(),
        specializations: masterSpecializationKeys.slice(0, 4)
      });
      expect(result.success).toBe(true);
    });

    it("0 специализаций — reject", () => {
      const result = masterProfileInputSchema.safeParse({ ...validProfile(), specializations: [] });
      expect(result.success).toBe(false);
    });

    it("5 специализаций — reject (максимум 4)", () => {
      const result = masterProfileInputSchema.safeParse({
        ...validProfile(),
        specializations: masterSpecializationKeys.slice(0, 5)
      });
      expect(result.success).toBe(false);
    });

    it("дубликаты — reject", () => {
      const result = masterProfileInputSchema.safeParse({
        ...validProfile(),
        specializations: ["vessels", "vessels"]
      });
      expect(result.success).toBe(false);
    });

    it("неизвестный ключ специализации — reject", () => {
      const result = masterProfileInputSchema.safeParse({
        ...validProfile(),
        specializations: ["unknown-key"]
      });
      expect(result.success).toBe(false);
    });
  });

  describe("требование ≥1 контакта", () => {
    it("все контакты пустые/не заданы — reject", () => {
      const result = masterProfileInputSchema.safeParse({
        ...validProfile(),
        contactTelegram: undefined
      });
      expect(result.success).toBe(false);
    });

    it("все контакты — пустые строки — reject", () => {
      const result = masterProfileInputSchema.safeParse({
        ...validProfile(),
        contactTelegram: "",
        contactPhone: "",
        contactEmail: "",
        contactWebsite: ""
      });
      expect(result.success).toBe(false);
    });

    it("ровно один заполненный контакт (телефон) — ок", () => {
      const result = masterProfileInputSchema.safeParse({
        ...validProfile(),
        contactTelegram: undefined,
        contactPhone: "+7 900 123-45-67"
      });
      expect(result.success).toBe(true);
    });
  });

  describe("трансформ '' -> undefined", () => {
    it("пустая строка в необязательном контакте становится undefined в выходных данных", () => {
      const result = masterProfileInputSchema.safeParse({
        ...validProfile(),
        contactTelegram: "@ivanov_forge",
        contactPhone: "",
        contactEmail: "",
        contactWebsite: ""
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.contactPhone).toBeUndefined();
        expect(result.data.contactEmail).toBeUndefined();
        expect(result.data.contactWebsite).toBeUndefined();
      }
    });
  });

  describe("максимальные длины полей", () => {
    it.each([
      ["displayName", "a".repeat(120), true],
      ["displayName", "a".repeat(121), false],
      ["displayName", "ab", false], // < min 3
      ["city", "a".repeat(120), true],
      ["city", "a".repeat(121), false],
      ["city", "a", false], // < min 2
      ["summary", "a".repeat(200), true],
      ["summary", "a".repeat(201), false],
      ["about", "a".repeat(5000), true],
      ["about", "a".repeat(5001), false]
    ] as const)("%s длиной %d символов -> valid=%s", (field, value, expected) => {
      const result = masterProfileInputSchema.safeParse({ ...validProfile(), [field]: value });
      expect(result.success).toBe(expected);
    });
  });
});

describe("masterItemInputSchema", () => {
  it.each([
    ["a".repeat(160), true],
    ["a".repeat(161), false],
    ["ab", false] // < min 3
  ])("title длиной %d символов -> valid=%s", (value, expected) => {
    const result = masterItemInputSchema.safeParse({ title: value });
    expect(result.success).toBe(expected);
  });

  it.each([
    ["a".repeat(2000), true],
    ["a".repeat(2001), false]
  ])("description длиной %d символов -> valid=%s", (value, expected) => {
    const result = masterItemInputSchema.safeParse({ title: "Изделие", description: value });
    expect(result.success).toBe(expected);
  });

  it.each([
    ["a".repeat(80), true],
    ["a".repeat(81), false]
  ])("priceNote длиной %d символов -> valid=%s", (value, expected) => {
    const result = masterItemInputSchema.safeParse({ title: "Изделие", priceNote: value });
    expect(result.success).toBe(expected);
  });

  it("priceNote: пустая строка становится undefined", () => {
    const result = masterItemInputSchema.safeParse({ title: "Изделие", priceNote: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceNote).toBeUndefined();
    }
  });

  it("description по умолчанию — пустая строка, если не задан", () => {
    const result = masterItemInputSchema.safeParse({ title: "Изделие" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("");
    }
  });

  it("title короче 3 символов — reject", () => {
    const result = masterItemInputSchema.safeParse({ title: "ab" });
    expect(result.success).toBe(false);
  });
});
