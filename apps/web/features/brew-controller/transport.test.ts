import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertEgressUrlAllowed, lanTransport } from "./transport";

// =============================================================================
//  Юнит-тесты SSRF-егресс-гарда и «не-протекания» тела ответа в ошибке putRecipe.
//  Стиль зеркалит translator.test.ts (vitest, без БД/сети — fetch замокан).
//  Env правим через vi.stubEnv (NODE_ENV типизирован как readonly — прямое
//  присваивание не проходит tsc).
// =============================================================================

describe("assertEgressUrlAllowed", () => {
  beforeEach(() => {
    // База: не-production (как dev/симулятор), без kill-switch и opt-in.
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BREWFORGE_ALLOW_LOOPBACK_DEVICE", "");
    vi.stubEnv("BREWFORGE_LAN_TRANSPORT_DISABLED", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("разрешает приватные LAN-диапазоны (10/8, 172.16/12, 192.168/16)", () => {
    expect(() => assertEgressUrlAllowed("http://10.0.0.5/telemetry")).not.toThrow();
    expect(() => assertEgressUrlAllowed("http://172.16.4.2/cmd")).not.toThrow();
    expect(() => assertEgressUrlAllowed("http://172.31.255.255/recipe")).not.toThrow();
    expect(() => assertEgressUrlAllowed("http://192.168.1.42/recipe")).not.toThrow();
    expect(() => assertEgressUrlAllowed("https://192.168.0.1")).not.toThrow();
    // граница 172.16/12: 172.32 уже вне диапазона
    expect(() => assertEgressUrlAllowed("http://172.32.0.1/")).toThrow(/EGRESS/);
  });

  it("разрешает *.local (mDNS) и ULA fc00::/7", () => {
    expect(() => assertEgressUrlAllowed("http://brewforge.local/telemetry")).not.toThrow();
    expect(() => assertEgressUrlAllowed("http://[fd12:3456::1]/cmd")).not.toThrow();
  });

  it("разрешает loopback и localhost-СИМУЛЯТОР вне production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(() => assertEgressUrlAllowed("http://localhost:8080/telemetry")).not.toThrow();
    expect(() => assertEgressUrlAllowed("http://127.0.0.1:8080/cmd")).not.toThrow();
    expect(() => assertEgressUrlAllowed("http://[::1]:8080/recipe")).not.toThrow();
  });

  it("ВСЕГДА отклоняет cloud-metadata и link-local (169.254/16, fe80::/10)", () => {
    expect(() => assertEgressUrlAllowed("http://169.254.169.254/latest/meta-data/")).toThrow(/EGRESS/);
    expect(() => assertEgressUrlAllowed("http://169.254.1.1/")).toThrow(/EGRESS/);
    expect(() => assertEgressUrlAllowed("http://[fe80::1]/")).toThrow(/EGRESS/);
  });

  it("отклоняет unspecified 0.0.0.0 / :: и публичные адреса/имена", () => {
    expect(() => assertEgressUrlAllowed("http://0.0.0.0/")).toThrow(/EGRESS/);
    expect(() => assertEgressUrlAllowed("http://[::]/")).toThrow(/EGRESS/);
    expect(() => assertEgressUrlAllowed("http://8.8.8.8/")).toThrow(/EGRESS/);
    expect(() => assertEgressUrlAllowed("http://example.com/")).toThrow(/EGRESS/);
    // IPv4-mapped IPv6 не должен «протащить» приватный/metadata-адрес мимо политики
    expect(() => assertEgressUrlAllowed("http://[::ffff:169.254.169.254]/")).toThrow(/EGRESS/);
  });

  it("отклоняет не-http(s) схемы и кривой URL", () => {
    expect(() => assertEgressUrlAllowed("file:///etc/passwd")).toThrow(/EGRESS/);
    expect(() => assertEgressUrlAllowed("ftp://192.168.1.1/")).toThrow(/EGRESS/);
    expect(() => assertEgressUrlAllowed("gopher://192.168.1.1/")).toThrow(/EGRESS/);
    expect(() => assertEgressUrlAllowed("not a url")).toThrow(/EGRESS/);
  });

  it("в production отклоняет loopback без BREWFORGE_ALLOW_LOOPBACK_DEVICE", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertEgressUrlAllowed("http://127.0.0.1:8080/telemetry")).toThrow(/EGRESS/);
    expect(() => assertEgressUrlAllowed("http://localhost:8080/telemetry")).toThrow(/EGRESS/);
    expect(() => assertEgressUrlAllowed("http://[::1]:8080/cmd")).toThrow(/EGRESS/);
    // приватный LAN-адрес в проде по-прежнему разрешён (устройство в LAN)
    expect(() => assertEgressUrlAllowed("http://192.168.1.42/telemetry")).not.toThrow();
    // opt-in возвращает loopback (например, sim рядом с прод-сборкой)
    vi.stubEnv("BREWFORGE_ALLOW_LOOPBACK_DEVICE", "1");
    expect(() => assertEgressUrlAllowed("http://127.0.0.1:8080/telemetry")).not.toThrow();
  });

  it("kill-switch BREWFORGE_LAN_TRANSPORT_DISABLED запрещает ВЕСЬ LAN-транспорт", () => {
    vi.stubEnv("BREWFORGE_LAN_TRANSPORT_DISABLED", "1");
    expect(() => assertEgressUrlAllowed("http://192.168.1.42/telemetry")).toThrow(/EGRESS/);
    expect(() => assertEgressUrlAllowed("http://10.0.0.1/cmd")).toThrow(/EGRESS/);
    expect(() => assertEgressUrlAllowed("http://brewforge.local/cmd")).toThrow(/EGRESS/);
  });
});

describe("lanTransport.putRecipe", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BREWFORGE_LAN_TRANSPORT_DISABLED", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("не протекает тело ответа устройства в текст ошибки (info-leak / port-scan)", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      // эти методы НЕ должны читаться/попадать в ошибку
      text: async () => "SECRET_INTERNAL_DETAIL",
      json: async () => null,
    }));
    vi.stubGlobal("fetch", fetchMock);

    let message = "";
    try {
      // host из приватного LAN-диапазона → егресс-гард пропускает, ошибка от статуса
      await lanTransport("http://192.168.1.50").putRecipe({} as never);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/500/);
    expect(message).not.toMatch(/SECRET_INTERNAL_DETAIL/);
  });

  it("адресует целевой слот через ?slot=N (device-first push), без слота — базовый URL", async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ slot: 3 }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const transport = lanTransport("http://192.168.1.50");
    // без слота — прошивка берёт слот по умолчанию (batch-путь START_BREW): без query
    const a = await transport.putRecipe({} as never);
    expect(a).toEqual({ slot: 3 });
    expect(urls[0]).toBe("http://192.168.1.50/recipe");

    // с целевым слотом — device-first push «на плату»
    await transport.putRecipe({} as never, 3);
    expect(urls[1]).toBe("http://192.168.1.50/recipe?slot=3");
  });
});
