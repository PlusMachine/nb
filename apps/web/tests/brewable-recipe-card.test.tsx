import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Кнопка «Сварить» клиентская (useState + BrewPickerDialog c server actions) —
// мокаем, чтобы карточку можно было отрендерить статикой.
vi.mock("../components/recipes/brew-from-stock-button", () => ({
  BrewFromStockButton: () => <button type="button">Сварить</button>
}));

import { HomeInventory } from "../components/home/home-inventory";
import { BrewabilityBadgePill } from "../components/recipes/brewability-badge-pill";
import { BrewableRecipeCard, BrewableRecipesSection } from "../components/recipes/brewable-recipes-section";
import type { BrewableRecipeDto } from "../features/recipes/contracts";

const dto = (over: Partial<BrewableRecipeDto> = {}): BrewableRecipeDto => ({
  recipeId: "r-1",
  slug: "my-ipa",
  title: "My IPA",
  matchPercent: 100,
  label: "ready",
  totalLines: 3,
  coveredLines: 3,
  missingCount: 0,
  missingNames: [],
  styleName: "American IPA",
  styleCode: "21A",
  styleHref: "/bjcp/21a",
  colorSrm: 6,
  heroImage: null,
  styleImageUrl: null,
  ...over
});

describe("BrewableRecipeCard — бейдж готовности (A3)", () => {
  it("говорит «Хватает всего», когда покрыты все строки", () => {
    const html = renderToStaticMarkup(<BrewableRecipeCard recipe={dto()} />);
    expect(html).toContain("Хватает всего");
    expect(html).not.toContain("Почти хватает");
    expect(html).toContain("Сварить");
  });

  it("регресс A3: при количественной нехватке говорит «Почти хватает», а не «Хватает всего»", () => {
    // солода 1 кг из 4: тип есть (missingCount 0), но строка partial →
    // coveredLines < totalLines, matchPercent 69
    const html = renderToStaticMarkup(
      <BrewableRecipeCard recipe={dto({ coveredLines: 2, matchPercent: 69 })} />
    );
    expect(html).toContain("Почти хватает");
    expect(html).not.toContain("Хватает всего");
    // рецепт остаётся варибельным — кнопка на месте
    expect(html).toContain("Сварить");
  });

  it("при отсутствующем ингредиенте показывает статистику покрытия вместо плашки", () => {
    const html = renderToStaticMarkup(
      <BrewableRecipeCard
        recipe={dto({ coveredLines: 2, missingCount: 1, missingNames: ["Каскад"], matchPercent: 60, label: "almost" })}
      />
    );
    expect(html).not.toContain("Хватает всего");
    expect(html).not.toContain("Почти хватает");
    expect(html).toContain("есть:");
    expect(html).toContain("2 из 3");
    expect(html).toContain("Каскад");
  });
});

describe("BrewabilityBadgePill — единственный источник текстов бейджа", () => {
  it("ready + qtyShort → «Почти хватает»", () => {
    const html = renderToStaticMarkup(
      <BrewabilityBadgePill badge={{ tier: "ready", missing: 0, qtyShort: true }} />
    );
    expect(html).toContain("Почти хватает");
  });

  it("ready → «Хватает всего»", () => {
    const html = renderToStaticMarkup(
      <BrewabilityBadgePill badge={{ tier: "ready", missing: 0, qtyShort: false }} />
    );
    expect(html).toContain("Хватает всего");
  });

  it("almost → «Не хватает N»", () => {
    const html = renderToStaticMarkup(
      <BrewabilityBadgePill badge={{ tier: "almost", missing: 2, qtyShort: false }} />
    );
    expect(html).toContain("Не хватает 2");
  });

  it("hidden → ничего не рендерит", () => {
    const html = renderToStaticMarkup(
      <BrewabilityBadgePill badge={{ tier: "hidden", missing: 3, qtyShort: false }} />
    );
    expect(html).toBe("");
  });

  // Н8: макет склада на главной раньше литералил тексты бейджа у себя — при
  // переименовании поверхности разъезжались. Теперь он рендерит тот же пилл.
  it("макет склада на главной рендерит тексты бейджа из пилла", () => {
    const html = renderToStaticMarkup(<HomeInventory />);
    expect(html).toContain("Хватает всего");
    expect(html).toContain("Не хватает 1");
  });
});

// Н7: заголовок секции не должен противоречить бейджам внутри — в секцию попадают
// и «Почти хватает» (дашборд), и «Не хватает N» («Мой склад»).
describe("BrewableRecipesSection — заголовок", () => {
  it("называется «Рецепты под ваш склад», а не обещает «Можно сварить»", () => {
    const html = renderToStaticMarkup(
      <BrewableRecipesSection recipes={[dto({ coveredLines: 2, matchPercent: 69 })]} />
    );
    expect(html).toContain("Рецепты под ваш склад");
    expect(html).not.toContain("Можно сварить");
  });
});
