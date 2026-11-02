import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseServerEnv, type ServerEnv } from "@nb/shared";

const mocks = vi.hoisted(() => ({
  env: {} as ServerEnv,
  send: vi.fn(), close: vi.fn(), transport: vi.fn(), issue: vi.fn(), log: vi.fn()
}));
vi.mock("@/lib/env", () => ({ getServerEnv: () => mocks.env }));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.transport } }));
vi.mock("@nb/auth", () => ({ issueVerification: mocks.issue, assertRateLimit: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/lib/anti-abuse", () => ({ verifyCaptchaHook: async () => true, assertIpRateLimit: vi.fn(), clientIpFrom: () => null }));

import { getAuthEmailAvailability } from "@/lib/auth-email";
import { POST as otp } from "@/app/api/auth/otp/route";
import { POST as magic } from "@/app/api/auth/magic/route";
import { POST as password } from "@/app/api/auth/password/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env = parseServerEnv({ SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_SECURE: "false", APP_URL: "https://nb.example.test" });
  mocks.transport.mockReturnValue({ sendMail: mocks.send, close: mocks.close });
  mocks.send.mockResolvedValue({ accepted: ["owner@mail.ru"] });
  mocks.issue.mockImplementation(async ({ email }: { email: string }) => ({ email, rawToken: "123456", expiresInMinutes: 10 }));
});

const flows = [
  { route: otp, endpoint: "otp", action: "request", subject: "Код для входа", content: "123456" },
  { route: magic, endpoint: "magic", action: "request", subject: "Вход в", content: "/api/auth/magic?email=" },
  { route: password, endpoint: "password", action: "request-reset", subject: "Сброс пароля", content: "flow=reset" }
];
const request = (endpoint: string, action: string) => new Request(`https://nb.example.test/api/auth/${endpoint}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, email: "owner@mail.ru", consent: true })
});

describe("доставка писем аутентификации", () => {
  it.each(flows)("$endpoint: успех только после приёма письма SMTP", async ({ route, endpoint, action, subject, content }) => {
    let accept: (value: { accepted: string[] }) => void = () => {};
    mocks.send.mockReturnValueOnce(new Promise(resolve => { accept = resolve; }));
    let complete = false;
    const pending = route(request(endpoint, action)).then(response => { complete = true; return response; });
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
    expect(complete).toBe(false);
    expect(mocks.send.mock.calls[0][0].subject).toContain(subject);
    expect(mocks.send.mock.calls[0][0].text).toContain(content);
    expect(mocks.send.mock.calls[0][0].html).toContain(content);
    accept({ accepted: ["owner@mail.ru"] });
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, delivery: "smtp" });
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each(flows)("$endpoint: ошибка SMTP не превращается в успешный ответ", async ({ route, endpoint, action }) => {
    mocks.send.mockRejectedValueOnce(new Error("SMTP private account detail"));
    const response = await route(request(endpoint, action));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "EMAIL_SEND_FAILED" });
  });

  it("отказ получателю не считается успешной доставкой", async () => {
    mocks.send.mockResolvedValueOnce({ accepted: [] });
    expect((await otp(request("otp", "request"))).status).toBe(503);
  });

  it("не выдаёт токен и не сообщает об отправке без SMTP", async () => {
    mocks.env.SMTP_HOST = undefined;
    expect(getAuthEmailAvailability()).toBe("disabled");
    const response = await otp(request("otp", "request"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "EMAIL_NOT_CONFIGURED" });
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("log включается явно и возвращает отдельный тип результата", async () => {
    mocks.env.EMAIL_PROVIDER = "log";
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const response = await otp(request("otp", "request"));
      expect(await response.json()).toEqual({ ok: true, delivery: "log" });
      expect(mocks.send).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it("production запрещает log даже при заданном SMTP", async () => {
    mocks.env.EMAIL_PROVIDER = "log";
    mocks.env.NODE_ENV = "production";
    expect(getAuthEmailAvailability()).toBe("disabled");
    expect((await otp(request("otp", "request"))).status).toBe(503);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("false не превращается в true при разборе SMTP_SECURE, production требует STARTTLS", async () => {
    expect(mocks.env.SMTP_SECURE).toBe(false);
    mocks.env.NODE_ENV = "production";
    await otp(request("otp", "request"));
    expect(mocks.transport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false, requireTLS: true }));
  });
});
