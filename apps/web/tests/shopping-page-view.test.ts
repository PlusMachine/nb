import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ShoppingListView } from "../components/shopping/shopping-list-view";
import { InventoryTabs } from "../components/inventory/inventory-tabs";
import type {
  ShoppingListDto,
  ShoppingListGroupDto,
  ShoppingListSourceBrew,
  ShoppingOpportunityDto
} from "../features/shopping/contracts";

// --- фикстуры ----------------------------------------------------------------

const emptyGroups: ShoppingListGroupDto[] = [];

const oneGroup = (): ShoppingListGroupDto[] => [
  {
    category: "hop",
    label: "Хмель",
    items: [
      {
        key: "catalog:cat-citra|g",
        ingredientDisplayName: "Citra",
        category: "hop",
        quantityToBuy: 50,
        unit: "g",
        quantityLabel: "50 г",
        catalogHref: "/catalog/system/cat-citra",
        addToStockHref: "/app/ingredients?addSource=catalog&addId=cat-citra&addQty=50&addUnit=g",
        neededBy: [{ recipeTitle: "IPA рецепт", brewName: "Кухонная варка" }]
      }
    ]
  }
];

const plannedBrew = (overrides: Partial<ShoppingListSourceBrew> = {}): ShoppingListSourceBrew => ({
  brewBatchId: "bb-1",
  brewName: "Кухонная варка",
  recipeId: "r-1",
  recipeTitle: "IPA рецепт",
  plannedFor: new Date("2026-07-12T00:00:00Z"),
  missingCount: 1,
  ...overrides
});

// Возможность с двумя нехватками: одна полная (количество + «На склад»),
// вторая без suggestedAdd (только имя). Чип стиля — 21B.
const opportunityWithTwoLines = (overrides: Partial<ShoppingOpportunityDto> = {}): ShoppingOpportunityDto => ({
  recipeId: "r-9",
  slug: "wheat-summer",
  title: "Пшеничное летнее",
  recipeHref: "/recipes/wheat-summer",
  styleCode: "21B",
  styleName: "Specialty IPA",
  styleHref: "/bjcp/21b",
  heroImage: null,
  styleImageUrl: null,
  colorSrm: 6,
  missingCount: 2,
  lines: [
    {
      ingredientDisplayName: "US-05",
      quantityToBuy: 1,
      unit: "pack",
      quantityLabel: "1 пакет",
      catalogHref: "/catalog/system/cat-us05",
      addToStockHref: "/app/ingredients?addSource=catalog&addId=cat-us05&addQty=1&addUnit=pack"
    },
    {
      // Нехватка без валидного suggestedAdd — рендерится только именем.
      ingredientDisplayName: "кориандр",
      quantityToBuy: null,
      unit: null,
      quantityLabel: null,
      catalogHref: null,
      addToStockHref: null
    }
  ],
  collapsed: false,
  ...overrides
});

// Возможность с 3+ нехватками: в карточке всегда видны первые 2 строки,
// остальные — под стрелочкой «Ещё N позиций» (details внутри карточки).
const opportunityWithManyLines = (): ShoppingOpportunityDto =>
  opportunityWithTwoLines({
    recipeId: "r-11",
    slug: "stout-winter",
    title: "Зимний стаут",
    recipeHref: "/recipes/stout-winter",
    missingCount: 3,
    lines: [
      {
        ingredientDisplayName: "US-05",
        quantityToBuy: 1,
        unit: "pack",
        quantityLabel: "1 пакет",
        catalogHref: "/catalog/system/cat-us05",
        addToStockHref: "/app/ingredients?addSource=catalog&addId=cat-us05&addQty=1&addUnit=pack"
      },
      {
        ingredientDisplayName: "кориандр",
        quantityToBuy: null,
        unit: null,
        quantityLabel: null,
        catalogHref: null,
        addToStockHref: null
      },
      {
        ingredientDisplayName: "Солод Carafa",
        quantityToBuy: 500,
        unit: "g",
        quantityLabel: "500 г",
        catalogHref: "/catalog/system/cat-carafa",
        addToStockHref: "/app/ingredients?addSource=catalog&addId=cat-carafa&addQty=500&addUnit=g"
      }
    ]
  });

const collapsedOpportunity = (id: string, title: string): ShoppingOpportunityDto => ({
  recipeId: id,
  slug: `slug-${id}`,
  title,
  recipeHref: `/recipes/slug-${id}`,
  styleCode: null,
  styleName: null,
  styleHref: null,
  heroImage: null,
  styleImageUrl: null,
  colorSrm: null,
  missingCount: 3,
  lines: [
    {
      ingredientDisplayName: "Солод Pale Ale",
      quantityToBuy: 1,
      unit: "kg",
      quantityLabel: "1 кг",
      catalogHref: "/catalog/system/cat-pale",
      addToStockHref: "/app/ingredients?addSource=catalog&addId=cat-pale&addQty=1&addUnit=kg"
    }
  ],
  collapsed: true
});

const baseDto = (overrides: Partial<ShoppingListDto> = {}): ShoppingListDto => ({
  groups: emptyGroups,
  totalItems: 0,
  plannedBrews: [],
  opportunities: [],
  collapsedOpportunityCount: 0,
  emptyReason: "nothing_to_do",
  ...overrides
});

// React SSR вставляет комментарии-разделители `<!-- -->` между соседними
// текстовыми/числовыми JSX-выражениями (нужны для гидратации, на разметку не
// влияют) — вырезаем их, чтобы утверждения по тексту не зависели от разбивки
// на children.
const stripHydrationComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "");

const render = (list: ShoppingListDto) =>
  stripHydrationComments(renderToString(React.createElement(ShoppingListView, { list })));

// --- тесты ---------------------------------------------------------------

describe("ShoppingListView", () => {
  it("не тащит магазинную лексику и не рендерит собственный H1 (шапка — у страницы)", () => {
    const html = render(baseDto({ groups: oneGroup(), totalItems: 1, plannedBrews: [plannedBrew()], emptyReason: null }));

    expect(html).not.toContain("<h1");
    expect(html).not.toContain("Докупить");
    expect(html).not.toContain("К покупке");
    expect(html).not.toContain("Список покупок");
  });

  it("блок «Добавить на склад»: партии-источники строками сверху, ингредиенты ниже", () => {
    const html = render(
      baseDto({
        groups: oneGroup(),
        totalItems: 1,
        plannedBrews: [plannedBrew({ missingCount: 2 })],
        emptyReason: null
      })
    );

    expect(html).toContain("Добавить на склад");
    expect(html).toContain("Для запланированных партий:");
    expect(html).toContain("Кухонная варка");
    expect(html).toContain("12 июля");
    expect(html).toContain("2 позиции");
    expect(html).toContain('href="/app/brew-batches/bb-1"');
    expect(html).toContain("Хмель");
    expect(html).toContain("Citra");
  });

  it("при all_in_stock блок показывает success-строку вместо списка", () => {
    const html = render(
      baseDto({
        groups: emptyGroups,
        totalItems: 0,
        plannedBrews: [plannedBrew({ missingCount: 0 })],
        emptyReason: "all_in_stock"
      })
    );

    expect(html).toContain("Для запланированных партий:");
    expect(html).toContain("всё есть");
    expect(html).toContain("Всё нужное уже на складе");
  });

  it("карточка возможности: название-ссылка, чип стиля, блок «Не хватает» и строки нехваток", () => {
    const html = render(
      baseDto({
        opportunities: [opportunityWithTwoLines()],
        emptyReason: null
      })
    );

    expect(html).toContain("Почти хватает на:");
    expect(html).toContain("Пшеничное летнее");
    expect(html).toContain('href="/recipes/wheat-summer"');
    expect(html).toContain("21B");
    expect(html).toContain("Не хватает");
    expect(html).toContain("US-05");
    expect(html).toContain("1 пакет");
    expect(html).toContain("кориандр");
    // Нехватка без quantityLabel — только имя, без числа рядом.
    expect(html).not.toMatch(/кориандр[^<]*\d/);
    expect(html).toContain('href="/app/ingredients?addSource=catalog&amp;addId=cat-us05&amp;addQty=1&amp;addUnit=pack"');
    expect(html).not.toContain("Докупить");
    expect(html).not.toContain("Почти можно сварить");
  });

  it("в карточке видны только первые 2 нехватки, остальные — под «Ещё N позиций»", () => {
    const html = render(
      baseDto({
        opportunities: [opportunityWithManyLines()],
        emptyReason: null
      })
    );

    expect(html).toContain("US-05");
    expect(html).toContain("кориандр");
    expect(html).toContain("Ещё 1 позиция");
    // Третья строка рендерится (внутри details), но скрыта до раскрытия.
    expect(html).toContain("Солод Carafa");
    expect(html).toContain("<details");
  });

  it("карточка с ≤2 нехватками рендерится без раскрывашки", () => {
    const html = render(
      baseDto({
        opportunities: [opportunityWithTwoLines()],
        emptyReason: null
      })
    );

    expect(html).not.toContain("Ещё ");
    expect(html).not.toContain("<details");
  });

  it("не рендерит «На склад» для нехватки без addToStockHref", () => {
    const html = render(
      baseDto({
        opportunities: [opportunityWithTwoLines()],
        emptyReason: null
      })
    );

    // У второй нехватки (кориандр) addToStockHref===null — ссылка «На склад»
    // есть только у первой (US-05).
    const stockLinks = html.match(/На склад/g) ?? [];
    expect(stockLinks.length).toBe(1);
  });

  it("сворачивает collapsed-записи под «Ещё K рецептов» (со склонением)", () => {
    const html = render(
      baseDto({
        opportunities: [opportunityWithTwoLines(), collapsedOpportunity("r-10", "Свёрнутый рецепт")],
        collapsedOpportunityCount: 1,
        emptyReason: null
      })
    );

    expect(html).toContain("Ещё 1 рецепт");
    expect(html).toContain("Свёрнутый рецепт");
    expect(html).not.toContain("Остальные избранные");
  });

  it("показывает подводку про планирование варки при 0 партий и >0 возможностей", () => {
    const html = render(
      baseDto({
        opportunities: [opportunityWithTwoLines()],
        emptyReason: null,
        plannedBrews: []
      })
    );

    expect(html).toContain("Запланируйте варку — соберём точный список");
    expect(html).toContain('href="/app/recipes"');
    // Без блока «Добавить на склад» в этом сценарии.
    expect(html).not.toContain("Добавить на склад");
    expect(html).not.toContain("Для запланированных партий:");
  });

  it("не показывает подводку, когда есть запланированные партии", () => {
    const html = render(
      baseDto({
        groups: oneGroup(),
        totalItems: 1,
        plannedBrews: [plannedBrew()],
        opportunities: [opportunityWithTwoLines()],
        emptyReason: null
      })
    );

    expect(html).not.toContain("Запланируйте варку — соберём точный список");
  });

  it("рендерит полный EmptyState при nothing_to_do", () => {
    const html = render(baseDto({ emptyReason: "nothing_to_do" }));

    expect(html).toContain("Нехваток пока нет");
    expect(html).toContain("К рецептам");
    expect(html).toContain("Мои партии");
    expect(html).not.toContain("Почти хватает на:");
    expect(html).not.toContain("сколько докупить");
  });

  it("рендерит «Всё нужное уже на складе» + возможности при all_in_stock", () => {
    const html = render(
      baseDto({
        plannedBrews: [plannedBrew({ missingCount: 0 })],
        opportunities: [opportunityWithTwoLines()],
        emptyReason: "all_in_stock"
      })
    );

    expect(html).toContain("Всё нужное уже на складе");
    expect(html).toContain("Почти хватает на:");
    expect(html).not.toContain("Нехваток пока нет");
  });
});

describe("InventoryTabs", () => {
  const renderTabs = (active: "stock" | "missing", missingCount?: number) =>
    stripHydrationComments(renderToString(React.createElement(InventoryTabs, { active, missingCount })));

  it("рендерит оба таба со ссылками и помечает активный", () => {
    const html = renderTabs("missing", 3);

    expect(html).toContain("Запасы");
    expect(html).toContain("Чего не хватает");
    expect(html).toContain('href="/app/ingredients"');
    expect(html).toContain('href="/app/shopping"');
    // aria-current — на активном табе (missing), у «Запасов» его нет.
    const current = html.match(/aria-current="page"/g) ?? [];
    expect(current.length).toBe(1);
    expect(html).toMatch(/aria-current="page"[^>]*>Чего не хватает/);
  });

  it("показывает счётчик нехваток и прячет его при нуле", () => {
    expect(renderTabs("stock", 5)).toContain(">5<");
    expect(renderTabs("stock", 0)).not.toContain(">0<");
    expect(renderTabs("stock")).toContain("Чего не хватает");
  });
});
