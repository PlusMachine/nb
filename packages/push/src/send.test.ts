import { createECDH, randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import https from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";

const state = vi.hoisted(() => ({
  subscriptions: [] as { id: string; endpoint: string; p256dh: string; auth: string }[],
  removed: [] as string[]
}));
vi.mock("@nb/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => state.subscriptions }) }),
    delete: () => ({ where: async (condition: { value: string }) => { state.removed.push(condition.value); } })
  },
  eq: (_column: unknown, value: string) => ({ value }),
  pushSubscriptions: { id: "id", userId: "userId" }
}));
import { sendPushToUser } from "./send";
import { pushAgent } from "./agent";

const vapid = webpush.generateVAPIDKeys();
const subscription = (endpoint: string, id = "subscription-1") => ({
  id, endpoint,
  p256dh: createECDH("prime256v1").generateKeys().toString("base64url"),
  auth: randomBytes(16).toString("base64url")
});

// Перехватываем реальную библиотеку на границе HTTPS: сеть не используется.
const interceptHttps = (statusCode = 201, headers = {}) => vi.spyOn(https, "request").mockImplementation((...args: unknown[]) => {
  const callback = args.find(arg => typeof arg === "function") as (response: IncomingMessage) => void;
  const request = new EventEmitter();
  Object.assign(request, {
    write: vi.fn(),
    end: () => {
      const response = Object.assign(new EventEmitter(), { statusCode, headers });
      callback(response as unknown as IncomingMessage);
      queueMicrotask(() => response.emit("end"));
    }
  });
  return request as ClientRequest;
});

beforeEach(() => {
  state.subscriptions = [];
  state.removed = [];
  vi.stubEnv("VAPID_PUBLIC_KEY", vapid.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privateKey);
  vi.stubEnv("VAPID_SUBJECT", "mailto:audit@example.test");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const payload = { title: "Test", body: "Test", tag: "test", url: "/app" };

describe("push delivery security", () => {
  it("blocks unsafe subscriptions already in the database before HTTPS", async () => {
    state.subscriptions = [subscription("https://127.0.0.1:8443/internal?private-token=SECRET")];
    const request = interceptHttps();
    await expect(sendPushToUser("owner", payload)).resolves.toBe(0);
    expect(request).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("SECRET");
  });

  it("continues delivering valid subscriptions after rejecting an unsafe one", async () => {
    state.subscriptions = [
      subscription("https://169.254.169.254/metadata", "bad"),
      subscription("https://fcm.googleapis.com/fcm/send/token", "good")
    ];
    const request = interceptHttps();
    await expect(sendPushToUser("owner", payload)).resolves.toBe(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      hostname: "fcm.googleapis.com", agent: pushAgent, timeout: 10_000
    }), expect.any(Function));
  });

  it("passes a canonical hostname to the legacy HTTP parser", async () => {
    state.subscriptions = [subscription("https://%66cm%2Egoogleapis.com/fcm/send/token")];
    const request = interceptHttps();
    await expect(sendPushToUser("owner", payload)).resolves.toBe(1);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ hostname: "fcm.googleapis.com", path: "/fcm/send/token" }), expect.any(Function));
  });

  it("does not follow a push-service redirect to an internal address", async () => {
    state.subscriptions = [subscription("https://fcm.googleapis.com/fcm/send/token")];
    const request = interceptHttps(302, { location: "https://127.0.0.1/private" });
    await expect(sendPushToUser("owner", payload)).resolves.toBe(0);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ hostname: "fcm.googleapis.com" }), expect.any(Function));
  });

  it("removes expired subscriptions on 410 as before", async () => {
    state.subscriptions = [subscription("https://fcm.googleapis.com/fcm/send/token")];
    interceptHttps(410);
    await expect(sendPushToUser("owner", payload)).resolves.toBe(0);
    expect(state.removed).toEqual(["subscription-1"]);
  });
});
