import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "u-1", email: "brewer@example.com", displayName: "Brewer" })),
  listRecipesForAuthor: vi.fn(async () => [{}, {}, {}]),
  getInventorySummaries: vi.fn(async () => ({ totalItems: 5, inStockItems: 3, emptyItems: 2 }))
}));

vi.mock("../lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../features/recipes/service", () => ({ listRecipesForAuthor: mocks.listRecipesForAuthor }));
vi.mock("../features/inventory/service", () => ({ getInventorySummaries: mocks.getInventorySummaries }));

import AppZonePage from "../app/(app)/app/page";

describe("App dashboard", () => {
  it("greets the user and funnels into the core workflow with real counts", async () => {
    const html = renderToStaticMarkup(await AppZonePage());

    expect(html).toContain("Brewer");
    expect(html).toContain("Создать рецепт");
    expect(html).toContain('href="/app/recipes/new"');
    expect(html).toContain('href="/app/ingredients"');
    expect(html).toContain('href="/catalog"');
    // discover strip bridges back to public knowledge surfaces
    expect(html).toContain('href="/bjcp"');
    expect(html).toContain('href="/calculators"');
    expect(mocks.listRecipesForAuthor).toHaveBeenCalledWith("u-1");
  });
});
