import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("recipe master docs", () => {
  it("documents the progressive FG estimate model", () => {
    const content = readFileSync(
      new URL("../../../docs/recipe-master-current-implementation.md", import.meta.url),
      "utf8"
    );

    expect(content).toContain("FG / КП: модель прогноза");
    expect(content).toContain("FG в мастере рецептов — это прогноз");
    expect(content).toContain("default -> mash-adjusted -> yeast-adjusted -> manual override");
    expect(content).toContain("mash profile участвует в FG calculation");
    expect(content).toContain("yeast attenuation влияет на FG");
    expect(content).toContain("fermentation profile по-прежнему не используется как прямой драйвер FG");
    expect(content).toContain("practical estimate, не лабораторная модель");
    expect(content).toContain("FG должен оставаться обычным расчетным показателем, а не отдельным центром внимания.");
    expect(content).toContain("нет постоянного раскрытого блока `FG / КП` в шапке");
    expect(content).toContain("advanced controls открываются только по маленькой шестеренке / info icon у FG");
  });
});
