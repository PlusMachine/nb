import { describe, expect, it } from "vitest";

import { formatAbvShort } from "@/features/recipes/format";

describe("formatAbvShort", () => {
  it("форматирует дробное значение с точкой и знаком процента", () => {
    expect(formatAbvShort(5.8)).toBe("5.8 %");
  });

  it("форматирует целое значение с одним знаком после точки", () => {
    expect(formatAbvShort(4)).toBe("4.0 %");
  });

  it("возвращает прочерк для null", () => {
    expect(formatAbvShort(null)).toBe("—");
  });
});
