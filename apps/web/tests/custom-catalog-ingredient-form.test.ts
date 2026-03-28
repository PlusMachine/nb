import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: mocks.back,
    push: mocks.push,
    refresh: mocks.refresh
  })
}));

import { CustomCatalogIngredientForm } from "../components/ingredients/custom-catalog-ingredient-form";

describe("custom catalog ingredient form", () => {
  it("renders a user-facing fermentable flow without admin display fields", () => {
    const html = renderToStaticMarkup(React.createElement(CustomCatalogIngredientForm, {
      mode: "create",
      initial: {
        category: "fermentable",
        subtype: "malt",
        displayName: "",
        aliases: []
      },
      submitLabel: "Сохранить",
      onSubmit: async () => ({ ok: true, message: "ok" })
    }));

    expect(html).toContain("Солод");
    expect(html).toContain("Сбраживаемое");
    expect(html).toContain("обязательно");
    expect(html).toContain("необязательно");
    expect(html).toContain("Единица по умолчанию");
    expect(html).toContain("Белок, %");
    expect(html).toContain("Тип солода");
    expect(html).toContain("Не указано");
    expect(html).toContain("Макс. засыпь, %");
    expect(html).not.toContain("Тип ферментируемого");
    expect(html).not.toContain("Display mode");
    expect(html).not.toContain("Display override");
    expect(html).not.toContain("Secondary override");
    expect(html).not.toContain("Скрывать вторичное название в RU UI");
    expect(html).not.toContain("Код / артикул");
    expect(html).not.toContain("Алиасы");
    expect(html).not.toContain("`name_ru`");
    expect(html).not.toContain("`name_en`");
  });

  it("keeps user-facing subtype selector for water treatment", () => {
    const html = renderToStaticMarkup(React.createElement(CustomCatalogIngredientForm, {
      mode: "create",
      initial: {
        category: "water_treatment",
        subtype: "acid",
        displayName: ""
      },
      submitLabel: "Сохранить",
      onSubmit: async () => ({ ok: true, message: "ok" })
    }));

    expect(html).toContain("Тип средства");
    expect(html).toContain("Кислота");
    expect(html).toContain("Концентрация / дозировка");
  });
});
