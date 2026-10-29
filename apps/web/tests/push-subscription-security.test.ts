import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "owner" }) }));
vi.mock("@/features/notifications/service", () => ({ saveSubscription: mocks.save }));
import { POST } from "@/app/api/notifications/subscribe/route";

beforeEach(() => { vi.clearAllMocks(); });
const request = (endpoint: string) => new Request("https://example.test/api/notifications/subscribe", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ endpoint, keys: { p256dh: "public-key", auth: "auth-key" } })
});

describe("push subscription boundary", () => {
  it.each([
    "https://127.0.0.1/internal", "https://169.254.169.254/metadata", "http://fcm.googleapis.com/push",
    "https://fcm.googleapis.com.attacker.test/push", "https://attacker.test/push"
  ])("does not save unsupported endpoint %s", async endpoint => {
    const response = await POST(request(endpoint));
    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("saves a valid browser subscription", async () => {
    const response = await POST(request("https://web.push.apple.com/opaque-token"));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith("owner", expect.objectContaining({ endpoint: "https://web.push.apple.com/opaque-token" }));
  });
});
