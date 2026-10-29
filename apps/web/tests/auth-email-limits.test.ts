import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  limits: new Map<string, number>(),
  verify: vi.fn(async () => { throw new Error("INVALID_TOKEN"); }),
  login: vi.fn(async () => { throw new Error("INVALID_CREDENTIALS"); }),
  issue: vi.fn(async ({ email }: { email: string }) => ({ email, rawToken: "secret" })),
  reset: vi.fn(async () => ({ session: { rawToken: "new-session", expiresAt: new Date() } })),
  cookies: { set: vi.fn(), delete: vi.fn() }
}));
vi.mock("next/headers", () => ({ cookies: async () => mocks.cookies, headers: async () => new Headers() }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ APP_URL: "https://example.test" }) }));
vi.mock("@/lib/sms", () => ({ sendSms: vi.fn() }));
vi.mock("@nb/auth", () => ({
  assertRateLimit: async (key: string, action: string, limit: number) => {
    const name = `${key}:${action}`;
    const count = (mocks.limits.get(name) ?? 0) + 1;
    mocks.limits.set(name, count);
    if (count > limit) throw new Error("RATE_LIMITED");
  },
  createPasswordSession: mocks.login,
  consumeVerification: mocks.verify,
  issueVerification: mocks.issue,
  resetPasswordWithVerification: mocks.reset
}));
import { passwordLogin, verifyEmailOtp, startEmailOtp, startMagicLink, requestPasswordReset, resetPassword } from "@/lib/auth";

beforeEach(() => { mocks.limits.clear(); vi.clearAllMocks(); });

describe("единый email для лимитов", () => {
  it("подтвержденное восстановление не зависит от исчерпанного лимита подбора пароля", async () => {
    mocks.limits.set("owner@mail.ru:password_login", 100);
    await resetPassword("owner@mail.ru", "valid-reset-token", "new password chosen by owner");
    expect(mocks.reset).toHaveBeenCalled();
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.cookies.set).toHaveBeenCalledWith("nb_session", "new-session", expect.objectContaining({ httpOnly: true }));
  });
  it.each([
    { action: passwordLogin, error: "INVALID_CREDENTIALS" },
    { action: verifyEmailOtp, error: "INVALID_TOKEN" }
  ])("пробелы и регистр не дают новых попыток входа", async ({ action, error }) => {
    for (let i = 0; i < 10; i++) await expect(action("owner@mail.ru", "bad")).rejects.toThrow(error);
    for (const email of [" owner@mail.ru", "owner@mail.ru ", "  OWNER@MAIL.RU  "]) {
      await expect(action(email, "bad")).rejects.toThrow("RATE_LIMITED");
    }
  });

  it.each([
    { action: startEmailOtp, limit: 5 },
    { action: startMagicLink, limit: 5 },
    { action: requestPasswordReset, limit: 3 }
  ])("пробелы не обходят лимит отправки кодов и ссылок", async ({ action, limit }) => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      for (let i = 0; i < limit; i++) await action("owner@mail.ru");
      await expect(action("  OWNER@MAIL.RU  ")).rejects.toThrow("RATE_LIMITED");
    } finally { vi.restoreAllMocks(); }
  });
});
