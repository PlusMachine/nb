import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  login: vi.fn(), signup: vi.fn(), reset: vi.fn(), requestReset: vi.fn(),
  captcha: vi.fn(async () => true), limit: vi.fn()
}));
vi.mock("@/lib/auth", () => ({
  passwordLogin: mocks.login, passwordSignup: mocks.signup,
  resetPassword: mocks.reset, requestPasswordReset: mocks.requestReset
}));
vi.mock("@/lib/anti-abuse", () => ({
  verifyCaptchaHook: mocks.captcha, assertIpRateLimit: mocks.limit, clientIpFrom: () => null
}));
import { POST } from "@/app/api/auth/password/route";

const request = (body: unknown) => new Request("https://example.test/api/auth/password", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
});

beforeEach(() => { vi.clearAllMocks(); });

describe("password API input boundary", () => {
  it.each([
    null, [], "text", {},
    { action: "signup", email: "owner@mail.ru", password: { toString: "password" }, consent: true },
    { action: "login", email: "owner@mail.ru", password: 12345 },
    { action: "signup", email: "broken-email", password: "valid long password", consent: true },
    { action: "signup", email: "owner@mail.ru", password: "x".repeat(257), consent: true }
  ])("rejects malformed input before authentication", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_REQUEST" });
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.signup).not.toHaveBeenCalled();
    expect(mocks.captcha).not.toHaveBeenCalled();
  });

  it("returns a controlled response for broken JSON", async () => {
    const response = await POST(new Request("https://example.test/api/auth/password", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_REQUEST" });
  });

  it("passes an intact password and trimmed email to the login service", async () => {
    const response = await POST(request({ action: "login", email: " owner@mail.ru ", password: " trailing and leading spaces " }));
    expect(response.status).toBe(200);
    expect(mocks.login).toHaveBeenCalledWith("owner@mail.ru", " trailing and leading spaces ");
  });

  it("surfaces the password policy error without creating a successful response", async () => {
    mocks.signup.mockRejectedValueOnce(new Error("INVALID_PASSWORD"));
    const response = await POST(request({ action: "signup", email: "owner@mail.ru", password: "short", consent: true }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_PASSWORD" });
  });
});
