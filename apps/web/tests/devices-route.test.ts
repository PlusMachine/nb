import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие GET /api/devices: роут аутентифицируется через getSessionUser (не
// requireUser — тот отвечает редиректом, а не 401, см. П11) — по образцу
// tests/masters-upload-route.test.ts (правило «тесты роутов обязаны мокать @nb/auth»).

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  listUserDevices: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/features/devices/service", () => ({ listUserDevices: mocks.listUserDevices }));

import { GET } from "../app/api/devices/route";

const USER = { id: "user-1", role: "user" as const };

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.getSessionUser.mockResolvedValue(USER);
  mocks.listUserDevices.mockResolvedValue([]);
});

describe("GET /api/devices", () => {
  it("отвечает 401 без сессии (не редиректом на /login)", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await GET();
    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(data.error).toBe("AUTH");
    expect(mocks.listUserDevices).not.toHaveBeenCalled();
  });

  it("возвращает список устройств залогиненного пользователя", async () => {
    const devices = [{ id: "device-1" }];
    mocks.listUserDevices.mockResolvedValue(devices);

    const response = await GET();
    const data = (await response.json()) as { devices: unknown };

    expect(response.status).toBe(200);
    expect(data.devices).toEqual(devices);
    expect(mocks.listUserDevices).toHaveBeenCalledWith(USER.id);
  });
});
