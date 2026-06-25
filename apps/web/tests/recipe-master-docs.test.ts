import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("recipe master docs", () => {
  it("documents the progressive FG estimate model", () => {
    const content = readFileSync(
      new URL("../../../docs/reference/recipes-editor.md", import.meta.url),
      "utf8"
    );

    // FG — прогноз, а не лабораторная величина.
    expect(content).toContain("не лабораторная плотность");
    expect(content).toContain("practical estimate, не лабораторная модель");

    // Прогрессивная модель: default -> yeast/attenuation -> manual override.
    expect(content).toContain("default_estimate");
    expect(content).toContain("manual_fg_override");
    expect(content).toContain("base attenuation");

    // Mash профиль участвует в FG, fermentation профиль — нет.
    expect(content).toContain("Участвует в FG через выбор главной паузы");
    expect(content).toContain("не используется как драйвер FG");

    // FG-контролы спрятаны, а не вынесены в постоянный блок шапки.
    expect(content).toContain("спрятаны под");

    // Фото пива — object storage + silent draft creation.
    expect(content).toContain("Фото пива");
    expect(content).toContain("Object storage");
    expect(content).toContain("silent draft creation");
  });
});
