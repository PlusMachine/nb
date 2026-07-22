import { describe, expect, it } from "vitest";

import type { PackVariantInput } from "../features/shopping/pack-rounding";
import { resolvePackSuggestion } from "../features/shopping/pack-rounding";

const variant = (overrides: Partial<PackVariantInput> & { id: string }): PackVariantInput => ({
  stockContentAmount: null,
  stockContentUnit: null,
  isDefaultForStock: false,
  position: 0,
  ...overrides
});

describe("resolvePackSuggestion — выбор фасовки", () => {
  it("default побеждает не-наименьшую фасовку", () => {
    const result = resolvePackSuggestion(
      { quantity: 37, unit: "g" },
      [
        variant({ id: "v100", stockContentAmount: 100, stockContentUnit: "g", isDefaultForStock: true, position: 1 }),
        variant({ id: "v50", stockContentAmount: 50, stockContentUnit: "g", position: 0 })
      ]
    );

    expect(result).toEqual({
      count: 1,
      packLabel: "пачка 100 г",
      totalQuantity: 100,
      totalUnit: "g"
    });
  });

  it("без default — наименьшая фасовка, покрывающая нехватку одной штукой", () => {
    const result = resolvePackSuggestion(
      { quantity: 37, unit: "g" },
      [
        variant({ id: "v50", stockContentAmount: 50, stockContentUnit: "g", position: 0 }),
        variant({ id: "v100", stockContentAmount: 100, stockContentUnit: "g", position: 1 })
      ]
    );

    expect(result).toEqual({
      count: 1,
      packLabel: "пачка 50 г",
      totalQuantity: 50,
      totalUnit: "g"
    });
  });

  it("ни одна фасовка не покрывает нехватку одной штукой — берём наименьшую и добираем count", () => {
    const result = resolvePackSuggestion(
      { quantity: 150, unit: "g" },
      [
        variant({ id: "v50", stockContentAmount: 50, stockContentUnit: "g", position: 0 }),
        variant({ id: "v100", stockContentAmount: 100, stockContentUnit: "g", position: 1 })
      ]
    );

    expect(result).toEqual({
      count: 3,
      packLabel: "3 пачки по 50 г",
      totalQuantity: 150,
      totalUnit: "g"
    });
  });

  it("default меньше нехватки — считает count > 1", () => {
    const result = resolvePackSuggestion(
      { quantity: 120, unit: "g" },
      [
        variant({ id: "v100", stockContentAmount: 100, stockContentUnit: "g", isDefaultForStock: true, position: 0 }),
        variant({ id: "v50", stockContentAmount: 50, stockContentUnit: "g", position: 1 })
      ]
    );

    expect(result).toEqual({
      count: 2,
      packLabel: "2 пачки по 100 г",
      totalQuantity: 200,
      totalUnit: "g"
    });
  });

  it("несколько default — побеждает вариант с меньшим position", () => {
    const result = resolvePackSuggestion(
      { quantity: 37, unit: "g" },
      [
        variant({ id: "v100", stockContentAmount: 100, stockContentUnit: "g", isDefaultForStock: true, position: 5 }),
        variant({ id: "v200", stockContentAmount: 200, stockContentUnit: "g", isDefaultForStock: true, position: 1 })
      ]
    );

    expect(result?.packLabel).toBe("пачка 200 г");
    expect(result?.totalQuantity).toBe(200);
  });
});

describe("resolvePackSuggestion — ceil и эпсилон", () => {
  it("101 г при пачке 50 г → 3 пачки (ceil)", () => {
    const result = resolvePackSuggestion(
      { quantity: 101, unit: "g" },
      [variant({ id: "v50", stockContentAmount: 50, stockContentUnit: "g", position: 0 })]
    );

    expect(result?.count).toBe(3);
    expect(result?.totalQuantity).toBe(150);
  });

  it("плавающий шум чуть выше кратного не даёт лишнюю пачку", () => {
    const result = resolvePackSuggestion(
      { quantity: 100.0000000001, unit: "g" },
      [variant({ id: "v50", stockContentAmount: 50, stockContentUnit: "g", position: 0 })]
    );

    expect(result?.count).toBe(2);
    expect(result?.totalQuantity).toBe(100);
  });
});

describe("resolvePackSuggestion — вырожденный случай (фасовка ≈ 1 кг/л)", () => {
  it("нужно 4.2 кг при фасовке 1 кг — просто итог, без слова «пачка»", () => {
    const result = resolvePackSuggestion(
      { quantity: 4.2, unit: "kg" },
      [variant({ id: "v1kg", stockContentAmount: 1, stockContentUnit: "kg", isDefaultForStock: true, position: 0 })]
    );

    expect(result).toEqual({
      count: 5,
      packLabel: "5 кг",
      totalQuantity: 5,
      totalUnit: "kg"
    });
  });
});

describe("resolvePackSuggestion — кросс-единицы фасовки", () => {
  it("фасовка задана в кг, нехватка в граммах — конвертируется корректно", () => {
    const result = resolvePackSuggestion(
      { quantity: 37, unit: "g" },
      [variant({ id: "v0.1kg", stockContentAmount: 0.1, stockContentUnit: "kg", position: 0 })]
    );

    expect(result).toEqual({
      count: 1,
      packLabel: "пачка 100 г",
      totalQuantity: 100,
      totalUnit: "g"
    });
  });
});

describe("resolvePackSuggestion — размерность нехватки", () => {
  it("нехватка в 'pack' — null (не дублировать механику «дрожжи 1 пачка»)", () => {
    const result = resolvePackSuggestion(
      { quantity: 1, unit: "pack" },
      [variant({ id: "v50", stockContentAmount: 50, stockContentUnit: "g", position: 0 })]
    );

    expect(result).toBeNull();
  });

  it("нехватка в 'item' — null", () => {
    const result = resolvePackSuggestion(
      { quantity: 3, unit: "item" },
      [variant({ id: "v6", stockContentAmount: 6, stockContentUnit: "item", position: 0 })]
    );

    expect(result).toBeNull();
  });

  it("несводимая размерность варианта (только объём при нехватке в весе) — null", () => {
    const result = resolvePackSuggestion(
      { quantity: 37, unit: "g" },
      [variant({ id: "vml", stockContentAmount: 50, stockContentUnit: "ml", position: 0 })]
    );

    expect(result).toBeNull();
  });
});

describe("resolvePackSuggestion — битые/пустые варианты", () => {
  it("пустой массив вариантов — null", () => {
    expect(resolvePackSuggestion({ quantity: 37, unit: "g" }, [])).toBeNull();
  });

  it("все варианты битые (amount null, непарсящаяся единица) — null", () => {
    const result = resolvePackSuggestion(
      { quantity: 37, unit: "g" },
      [
        variant({ id: "vnoamount", stockContentAmount: null, stockContentUnit: "g", position: 0 }),
        variant({ id: "vbadunit", stockContentAmount: 50, stockContentUnit: "коробка", position: 1 })
      ]
    );

    expect(result).toBeNull();
  });

  it("часть вариантов битая — работает по валидным", () => {
    const result = resolvePackSuggestion(
      { quantity: 37, unit: "g" },
      [
        variant({ id: "vbad", stockContentAmount: 0, stockContentUnit: "g", position: 0 }),
        variant({ id: "vgood", stockContentAmount: 50, stockContentUnit: "g", position: 1 })
      ]
    );

    expect(result?.packLabel).toBe("пачка 50 г");
  });
});

describe("resolvePackSuggestion — плюрализация «пачка/пачки/пачек»", () => {
  it("count 1 → «пачка»", () => {
    const result = resolvePackSuggestion(
      { quantity: 50, unit: "g" },
      [variant({ id: "v50", stockContentAmount: 50, stockContentUnit: "g", position: 0 })]
    );

    expect(result?.packLabel).toBe("пачка 50 г");
  });

  it("count 2 → «пачки»", () => {
    const result = resolvePackSuggestion(
      { quantity: 100, unit: "g" },
      [variant({ id: "v50", stockContentAmount: 50, stockContentUnit: "g", position: 0 })]
    );

    expect(result?.packLabel).toBe("2 пачки по 50 г");
  });

  it("count 5 → «пачек»", () => {
    const result = resolvePackSuggestion(
      { quantity: 250, unit: "g" },
      [variant({ id: "v50", stockContentAmount: 50, stockContentUnit: "g", position: 0 })]
    );

    expect(result?.packLabel).toBe("5 пачек по 50 г");
  });
});

describe("resolvePackSuggestion — некорректная нехватка", () => {
  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])("quantity=%p → null", (quantity) => {
    const result = resolvePackSuggestion(
      { quantity, unit: "g" },
      [variant({ id: "v50", stockContentAmount: 50, stockContentUnit: "g", position: 0 })]
    );

    expect(result).toBeNull();
  });
});
