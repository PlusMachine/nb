import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertEgressUrlAllowed, lanTransport, pairDeviceOverLan } from "./transport";

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
      // Точная форма успешного ответа прошивки (bf_comms.c h_recipe): {"ok":true,"slot":N}.
      return { ok: true, status: 200, json: async () => ({ ok: true, slot: 3 }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const transport = lanTransport("http://192.168.1.50");
    // без слота — прошивка автовыбирает первый свободный записываемый слот: без query
    const a = await transport.putRecipe({} as never);
    expect(a).toEqual({ slot: 3 });
    expect(urls[0]).toBe("http://192.168.1.50/recipe");

    // с целевым слотом — device-first push «на плату»
    await transport.putRecipe({} as never, 3);
    expect(urls[1]).toBe("http://192.168.1.50/recipe?slot=3");
  });

  it("устройство отклоняет рецепт с HTTP 200 (ok:false, без slot) — putRecipe ДОЛЖЕН бросить, не вернуть slot:0", async () => {
    // Сверка контракта (пакет 4-B): реальная прошивка (h_recipe) НЕ ставит статус
    // ошибки на отказ (нет свободного слота / невалидный ?slot=) — 200 OK с телом
    // {"ok":false,"error":N}. Раньше putRecipe тихо читал отсутствующий json.slot
    // как 0 — а слот 0 на реальном железе ВСТРОЕННЫЙ ROM-рецепт (см. transport.ts).
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, error: -101 }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const transport = lanTransport("http://192.168.1.50");
    await expect(transport.putRecipe({} as never)).rejects.toThrow(/отклонило/);
  });
});

describe("lanTransport.listLogs / readLog (P3)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BREWFORGE_LAN_TRANSPORT_DISABLED", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("listLogs разбирает точный ответ bf_log_list (голый массив)", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        { name: "brew-1719499990.jsonl", startTs: 1719499990, sizeBytes: 4096, recipeName: "IPA" },
      ],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const transport = lanTransport("http://192.168.1.50");
    const files = await transport.listLogs?.();
    expect(files).toEqual([
      { name: "brew-1719499990.jsonl", startTs: 1719499990, sizeBytes: 4096, recipeName: "IPA" },
    ]);
  });

  it("listLogs на сетевой ошибке/404 отдаёт пустой список, не бросает", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 })),
    );
    const transport = lanTransport("http://192.168.1.50");
    expect(await transport.listLogs?.()).toEqual([]);
  });

  it("readLog запрашивает ?name= и отдаёт сырой текст .jsonl", async () => {
    const urls: string[] = [];
    const jsonl = '{"t":"s","ts":1,"up":1,"st":5,"sp":67,"tp":66,"hd":80,"ho":true,"pu":true,"fm":0}\n';
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return { ok: true, status: 200, text: async () => jsonl };
      }),
    );
    const transport = lanTransport("http://192.168.1.50");
    const content = await transport.readLog?.("brew-1719499990.jsonl");
    expect(content).toBe(jsonl);
    expect(urls[0]).toBe("http://192.168.1.50/log?name=brew-1719499990.jsonl");
  });

  it("readLog на 404 отдаёт null (файл вытеснен ретеншном/не существует)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    const transport = lanTransport("http://192.168.1.50");
    expect(await transport.readLog?.("nope.jsonl")).toBeNull();
  });
});

describe("lanTransport.getConfig", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BREWFORGE_LAN_TRANSPORT_DISABLED", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fetch кидает (устройство офлайн) → getConfig отдаёт null, не бросает (F3/F4)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const transport = lanTransport("http://192.168.1.50");
    await expect(transport.getConfig()).resolves.toBeNull();
  });
});

describe("lanTransport.putConfig", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BREWFORGE_LAN_TRANSPORT_DISABLED", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fetch кидает (устройство офлайн/таймаут) → putConfig бросает известный код DEVICE_UNREACHABLE, а не сырое исключение (B2)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const transport = lanTransport("http://192.168.1.50");
    await expect(transport.putConfig({})).rejects.toThrow("DEVICE_UNREACHABLE");
  });

  it("устройство ответило не-2xx (напр. отказ валидации) → putConfig бросает HTTP-статус, НЕ DEVICE_UNREACHABLE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 400 })),
    );
    const transport = lanTransport("http://192.168.1.50");
    await expect(transport.putConfig({})).rejects.toThrow("HTTP 400");
  });
});

describe("pairDeviceOverLan (P4)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BREWFORGE_LAN_TRANSPORT_DISABLED", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("happy path: POST /pair {token} → {ok:true}", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body?: string }) => {
        calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }),
    );

    const result = await pairDeviceOverLan("http://192.168.1.50", "bfd_abc123");
    expect(result).toEqual({ ok: true });
    expect(calls[0]?.url).toBe("http://192.168.1.50/pair");
    expect(calls[0]?.body).toEqual({ token: "bfd_abc123" });
  });

  it("409 ALREADY_PAIRED — устройство уже сопряжено (кем-то ещё/этим же владельцем ранее)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ ok: false, reason: "ALREADY_PAIRED" }) })),
    );
    const result = await pairDeviceOverLan("http://192.168.1.50", "bfd_abc123");
    expect(result).toEqual({ ok: false, reason: "ALREADY_PAIRED" });
  });

  it("сетевая ошибка (устройство offline/недостижимо) → UNREACHABLE, не бросает", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const result = await pairDeviceOverLan("http://192.168.1.50", "bfd_abc123");
    expect(result).toEqual({ ok: false, reason: "UNREACHABLE" });
  });

  it("SSRF-гард применяется к /pair (публичный хост блокируется) — тоже UNREACHABLE, не бросает наружу", async () => {
    // pairDeviceOverLan оборачивает assertEgressUrlAllowed в try/catch — вызывающий
    // (claimDevice) не должен падать 500 на «пользователь ввёл странный localUrl».
    const result = await pairDeviceOverLan("http://example.com", "bfd_abc123");
    expect(result).toEqual({ ok: false, reason: "UNREACHABLE" });
  });

  it("устройство отклонило (не 409, не 2xx) → REJECTED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ ok: false, reason: "BAD_TOKEN" }) })),
    );
    const result = await pairDeviceOverLan("http://192.168.1.50", "bfd_abc123");
    expect(result).toEqual({ ok: false, reason: "REJECTED" });
  });
});
