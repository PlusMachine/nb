import { describe, expect, it } from "vitest";

import { normalizePhone } from "@nb/auth";

describe("normalizePhone", () => {
  it("приводит разные форматы российского номера к E.164", () => {
    expect(normalizePhone("+7 999 123-45-67")).toBe("+79991234567");
    expect(normalizePhone("8 (999) 123 45 67")).toBe("+79991234567");
    expect(normalizePhone("79991234567")).toBe("+79991234567");
    expect(normalizePhone("89991234567")).toBe("+79991234567");
  });

  it("достраивает код страны для 10 цифр без префикса", () => {
    expect(normalizePhone("9991234567")).toBe("+79991234567");
  });

  it("отвергает мусор и номера неверной длины", () => {
    expect(() => normalizePhone("12345")).toThrow("INVALID_PHONE");
    expect(() => normalizePhone("не телефон")).toThrow("INVALID_PHONE");
    expect(() => normalizePhone("+1 202 555 0143")).toThrow("INVALID_PHONE");
    expect(() => normalizePhone("123456789012")).toThrow("INVALID_PHONE");
  });
});
