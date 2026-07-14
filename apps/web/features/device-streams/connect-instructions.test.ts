import { describe, expect, it } from "vitest";

import { instructionForKind, kindsWithDedicatedInstructions } from "./connect-instructions";

describe("instructionForKind", () => {
  it("каждый вид визарда имеет непустой текст", () => {
    for (const kind of kindsWithDedicatedInstructions) {
      expect(instructionForKind(kind).length).toBeGreaterThan(0);
    }
  });

  it("виды с выделенной инструкцией отличаются от «other» (кроме самого other — это и есть общий текст)", () => {
    const fallback = instructionForKind("other");
    for (const kind of kindsWithDedicatedInstructions) {
      if (kind === "other") continue;
      expect(instructionForKind(kind)).not.toBe(fallback);
    }
  });

  it("Tilt упоминает Bluetooth/телефон рядом с ферментером (§5 F1)", () => {
    expect(instructionForKind("tilt")).toMatch(/Bluetooth|рядом с ферментером/);
  });

  it("неизвестный/отсутствующий вид → общий текст (other)", () => {
    expect(instructionForKind("something-new")).toBe(instructionForKind("other"));
    expect(instructionForKind(null)).toBe(instructionForKind("other"));
  });
});
