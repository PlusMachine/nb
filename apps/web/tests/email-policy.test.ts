import { describe, expect, it } from "vitest";

import { assertRussianEmailDomain, isRussianEmailDomain } from "@/lib/email-policy";

describe("isRussianEmailDomain", () => {
  it("разрешает российские доменные зоны и известных провайдеров", () => {
    expect(isRussianEmailDomain("user@example.ru")).toBe(true);
    expect(isRussianEmailDomain("user@почта.рф")).toBe(true);
    expect(isRussianEmailDomain("user@yandex.ru")).toBe(true);
    expect(isRussianEmailDomain("user@mail.ru")).toBe(true);
    expect(isRussianEmailDomain("user@yandex.com")).toBe(true);
    expect(isRussianEmailDomain("user@list.ru")).toBe(true);
  });

  it("отклоняет иностранные почтовые сервисы", () => {
    expect(isRussianEmailDomain("user@gmail.com")).toBe(false);
    expect(isRussianEmailDomain("user@outlook.com")).toBe(false);
    expect(isRussianEmailDomain("user@proton.me")).toBe(false);
    expect(isRussianEmailDomain("no-at-symbol")).toBe(false);
  });
});

describe("assertRussianEmailDomain", () => {
  it("вне production не ограничивает домен (dev не мешает)", () => {
    // NODE_ENV в тестах = 'test', поэтому гард отключён и не бросает на gmail.
    expect(() => assertRussianEmailDomain("user@gmail.com")).not.toThrow();
  });
});
