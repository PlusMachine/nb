import { getBjcpCatalogData } from "@nb/content";
import { beforeAll, describe, expect, it } from "vitest";

import {
  getBjcpCatalogResults,
  getStyleFermentationLabel,
  parseBjcpCatalogState
} from "../features/content/bjcp-catalog";

describe("BJCP fermentation labels and filters", () => {
  let catalog: Awaited<ReturnType<typeof getBjcpCatalogData>>;
  beforeAll(async () => { catalog = await getBjcpCatalogData(); });

  const style = (id: string) => {
    const found = catalog.styles.find((item) => item.bjcpId === id);
    if (!found) throw new Error(`Missing BJCP style ${id}`);
    return found;
  };

  const filteredIds = (group: "fermentation" | "character", value: string) => {
    const state = parseBjcpCatalogState(new URLSearchParams(), catalog);
    state.filters[group] = [value as typeof state.filters[typeof group][number]];
    return getBjcpCatalogResults(state, catalog).styles.map((item) => item.bjcpId);
  };

  it("does not confuse cold conditioning with bottom fermentation", () => {
    for (const id of ["5B", "7B"]) {
      expect(style(id).tags).toContain("lagered");
      expect(getStyleFermentationLabel(style(id))).toBe("Верховое");
      expect(filteredIds("fermentation", "ale")).toContain(id);
      expect(filteredIds("fermentation", "lager")).not.toContain(id);
    }
    expect(getStyleFermentationLabel(style("19B"))).toBe("Низовое");
  });

  it.each(["1C", "1D", "9C", "24C"])("allows either yeast type for %s", (id) => {
    expect(getStyleFermentationLabel(style(id))).toBe("Верховое или низовое");
    expect(filteredIds("fermentation", "ale")).toContain(id);
    expect(filteredIds("fermentation", "lager")).toContain(id);
  });

  it.each(["X1", "X2"])("uses the documented ale classification when source tags omit fermentation for %s", (id) => {
    expect(style(id).tags).not.toContain("top-fermented");
    expect(getStyleFermentationLabel(style(id))).toBe("Верховое");
    expect(filteredIds("fermentation", "ale")).toContain(id);
  });

  it.each(["23D", "28A", "28B", "28C"])("recognizes wild or mixed fermentation for %s", (id) => {
    expect(getStyleFermentationLabel(style(id))).toBe("Смешанное или дикое");
    expect(filteredIds("fermentation", "mixed")).toContain(id);
  });

  it("does not invent an ale classification for an unspecified base recipe", () => {
    expect(getStyleFermentationLabel(style("29A"))).toBe("Зависит от рецепта");
    expect(filteredIds("fermentation", "ale")).not.toContain("29A");
    expect(filteredIds("fermentation", "lager")).not.toContain("29A");
    expect(getStyleFermentationLabel({ ...style("29A"), tags: undefined, badgesRu: [] })).toBe("Не указано");
  });

  it("keeps quick filters consistent with yeast type and acidity", () => {
    const state = parseBjcpCatalogState(new URLSearchParams("chips=lager"), catalog);
    const lagers = getBjcpCatalogResults(state, catalog).styles.map((item) => item.bjcpId);
    expect(lagers).not.toContain("5B");
    expect(lagers).not.toContain("7B");
    expect(lagers).toContain("19B");
    state.chips = ["sour"];
    const sour = getBjcpCatalogResults(state, catalog).styles.map((item) => item.bjcpId);
    expect(sour).toContain("28B");
    expect(sour).not.toContain("28A");
    expect(filteredIds("character", "sour")).not.toContain("28A");
  });

  it("keeps wood aging searchable and does not equate dark color with roasted flavor", () => {
    expect(filteredIds("character", "wood_aged")).toEqual(expect.arrayContaining(["33A", "33B"]));
    expect(filteredIds("character", "roasty")).not.toContain("8A");
    expect(filteredIds("character", "roasty")).toContain("15B");
  });
});
