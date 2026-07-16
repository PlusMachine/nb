import { describe, expect, it } from "vitest";

import { isConfidentImportMatch, tokenizeImportMatchName } from "../components/recipes/recipe-designer/imported-catalog-match";

const candidate = (fields: { nameEn?: string | null; displayName?: string | null; nameRu?: string | null }) => ({
  nameEn: fields.nameEn ?? null,
  displayNameEn: null,
  displayName: fields.displayName ?? fields.nameRu ?? "",
  nameRu: fields.nameRu ?? null
});

describe("tokenizeImportMatchName", () => {
  it("нормализует регистр, пунктуацию и диакритику", () => {
    expect(tokenizeImportMatchName("Pale Ale Malt")).toEqual(["pale", "ale", "malt"]);
    expect(tokenizeImportMatchName("Crystal 40L")).toEqual(["crystal", "40l"]);
    expect(tokenizeImportMatchName("Hüll Melon")).toEqual(["hull", "melon"]);
  });
});

describe("isConfidentImportMatch — предвыбираем только совпадение имени целиком", () => {
  it("уверенно: точное и подмножество", () => {
    expect(isConfidentImportMatch("Vienna", candidate({ nameEn: "Vienna", nameRu: "Венский" }))).toBe(true);
    expect(isConfidentImportMatch("Pale Ale Malt", candidate({ nameEn: "BEST Pale Ale Malt", nameRu: "Пэйл Эль" }))).toBe(true);
    expect(isConfidentImportMatch("Crystal 40", candidate({ nameEn: "Crystal 40", nameRu: "Кристальный 40" }))).toBe(true);
    expect(isConfidentImportMatch("Munich Light", candidate({ nameEn: "Munich Light", nameRu: "Мюнхенский светлый" }))).toBe(true);
    expect(isConfidentImportMatch("Cascade", candidate({ nameEn: "Cascade", nameRu: "Каскад" }))).toBe(true);
    expect(isConfidentImportMatch("Wyeast 1318 London Ale III", candidate({ nameEn: "London Ale III 1318", nameRu: "Лондон Эль III 1318" }))).toBe(true);
  });

  it("НЕ уверенно: разные ингредиенты с общим словом (главный кейс)", () => {
    // Carapils (декстриновый) ≠ Cara Crystal (карамельный) — общий только «Cara».
    expect(isConfidentImportMatch("Carapils", candidate({ nameEn: "Cara Crystal", nameRu: "Кара Кристал" }))).toBe(false);
    expect(isConfidentImportMatch("Carafoam", candidate({ nameEn: "Cara Crystal", nameRu: "Кара Кристал" }))).toBe(false);
    // Разные солода, совпадает лишь «Malt» — не считаем совпадением.
    expect(isConfidentImportMatch("Wheat Malt", candidate({ nameEn: "Rye Malt", nameRu: "Ржаной солод" }))).toBe(false);
    // Аббревиатура-контракция: Caramunich ≠ Caramel Munich по токенам — лучше не автопредвыбирать.
    expect(isConfidentImportMatch("Caramunich II", candidate({ nameEn: "BEST Caramel Munich II", nameRu: "Карамельный Мюнхенский II" }))).toBe(false);
  });

  it("НЕ уверенно: нет английского имени, только кириллица — не гадаем", () => {
    expect(isConfidentImportMatch("Flaked Oats", candidate({ nameEn: null, nameRu: "Овсяные хлопья" }))).toBe(false);
  });

  it("пустые входы безопасны", () => {
    expect(isConfidentImportMatch("", candidate({ nameEn: "Vienna" }))).toBe(false);
    expect(isConfidentImportMatch("Vienna", null)).toBe(false);
  });
});
