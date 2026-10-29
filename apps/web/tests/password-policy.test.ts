import { describe, expect, it } from "vitest";
import { assertNewPassword, isPasswordInputAllowed, normalizeEmail } from "@nb/shared";

describe("password policy", () => {
  it.each(["", "short", " ".repeat(20), "a".repeat(129), "😀".repeat(129)])("rejects invalid new passwords", (password) => {
    expect(() => assertNewPassword(password)).toThrow("INVALID_PASSWORD");
  });

  it.each(["a".repeat(15), "a".repeat(128), "😀".repeat(15), "😀".repeat(128), "  passphrase with spaces  "])("accepts bounded Unicode passwords and preserves spaces", (password) => {
    expect(() => assertNewPassword(password)).not.toThrow();
  });

  it("allows older short passwords for login, but caps the hashing input", () => {
    expect(isPasswordInputAllowed("old-password")).toBe(true);
    expect(isPasswordInputAllowed("")).toBe(false);
    expect(isPasswordInputAllowed("x".repeat(100_000))).toBe(false);
  });

  it("normalizes email identically for credentials and rate limits", () => {
    expect(normalizeEmail("  Owner@Mail.RU\t")).toBe("owner@mail.ru");
  });
});
