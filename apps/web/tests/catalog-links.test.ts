import { describe, expect, it } from "vitest";

import {
  buildIngredientCatalogActionHref,
  buildIngredientNameActionHref
} from "../features/ingredients/catalog-links";

describe("buildIngredientCatalogActionHref", () => {
  it("builds a bare deeplink without amount", () => {
    expect(buildIngredientCatalogActionHref("/app/ingredients", "catalog", "cat-1")).toBe(
      "/app/ingredients?addSource=catalog&addId=cat-1"
    );
  });

  it("appends addQty/addUnit when a valid amount is given", () => {
    expect(buildIngredientCatalogActionHref("/app/ingredients", "custom", "cust-1", { quantity: 50, unit: "g" })).toBe(
      "/app/ingredients?addSource=custom&addId=cust-1&addQty=50&addUnit=g"
    );
  });

  it("omits amount when quantity is zero/invalid or unit is missing", () => {
    expect(buildIngredientCatalogActionHref("/app/ingredients", "catalog", "cat-1", { quantity: 0, unit: "g" })).toBe(
      "/app/ingredients?addSource=catalog&addId=cat-1"
    );
    expect(buildIngredientCatalogActionHref("/app/ingredients", "catalog", "cat-1", { quantity: 50, unit: "" })).toBe(
      "/app/ingredients?addSource=catalog&addId=cat-1"
    );
  });
});

// П3: строка-нехватка без каталожной/кастомной привязки (живёт только именем
// из снапшота) — deeplink несёт имя вместо id, открывает форму «Добавить свой».
describe("buildIngredientNameActionHref", () => {
  it("builds a bare deeplink with just the (trimmed, encoded) name", () => {
    expect(buildIngredientNameActionHref("/app/ingredients", "  Молочная кислота 88%  ")).toBe(
      "/app/ingredients?addName=%D0%9C%D0%BE%D0%BB%D0%BE%D1%87%D0%BD%D0%B0%D1%8F%20%D0%BA%D0%B8%D1%81%D0%BB%D0%BE%D1%82%D0%B0%2088%25"
    );
  });

  it("appends addQty/addUnit when a valid amount is given", () => {
    expect(buildIngredientNameActionHref("/app/ingredients", "Кориандр", { quantity: 10, unit: "g" })).toBe(
      "/app/ingredients?addName=%D0%9A%D0%BE%D1%80%D0%B8%D0%B0%D0%BD%D0%B4%D1%80&addQty=10&addUnit=g"
    );
  });

  it("omits amount when quantity is zero/invalid or unit is missing", () => {
    expect(buildIngredientNameActionHref("/app/ingredients", "Кориандр", { quantity: 0, unit: "g" })).toBe(
      "/app/ingredients?addName=%D0%9A%D0%BE%D1%80%D0%B8%D0%B0%D0%BD%D0%B4%D1%80"
    );
    expect(buildIngredientNameActionHref("/app/ingredients", "Кориандр", { quantity: 10, unit: "" })).toBe(
      "/app/ingredients?addName=%D0%9A%D0%BE%D1%80%D0%B8%D0%B0%D0%BD%D0%B4%D1%80"
    );
  });

  it("appends addCategory when a category is given", () => {
    expect(buildIngredientNameActionHref("/app/ingredients", "Кориандр", null, "consumable")).toBe(
      "/app/ingredients?addName=%D0%9A%D0%BE%D1%80%D0%B8%D0%B0%D0%BD%D0%B4%D1%80&addCategory=consumable"
    );
  });

  it("combines amount and category in the expected order", () => {
    expect(buildIngredientNameActionHref("/app/ingredients", "Кориандр", { quantity: 10, unit: "g" }, "consumable")).toBe(
      "/app/ingredients?addName=%D0%9A%D0%BE%D1%80%D0%B8%D0%B0%D0%BD%D0%B4%D1%80&addQty=10&addUnit=g&addCategory=consumable"
    );
  });
});
