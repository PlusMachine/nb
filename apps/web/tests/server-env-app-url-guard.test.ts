import { describe, expect, it } from "vitest";

import { assertProductionAppUrl, parseServerEnv } from "@nb/shared";

// Гвард нарочно живёт НЕ в parseServerEnv: парсер вызывается eagerly любым
// импортёром @nb/db (в т.ч. apps/bridge без APP_URL), а требование боевого
// APP_URL — обязанность веб-рантайма (apps/web/lib/env.ts).
describe("assertProductionAppUrl — гвард APP_URL в production", () => {
  const envWith = (overrides: Record<string, string>) => parseServerEnv({ ...overrides });

  it("кидает, если NODE_ENV=production, а APP_URL смотрит на localhost", () => {
    expect(() =>
      assertProductionAppUrl(envWith({ NODE_ENV: "production", APP_URL: "http://localhost:3000" }))
    ).toThrow(/APP_URL/);
  });

  it("кидает и для 127.0.0.1", () => {
    expect(() =>
      assertProductionAppUrl(envWith({ NODE_ENV: "production", APP_URL: "http://127.0.0.1:3000" }))
    ).toThrow(/APP_URL/);
  });

  it("не кидает в production с реальным доменом", () => {
    expect(() =>
      assertProductionAppUrl(envWith({ NODE_ENV: "production", APP_URL: "https://nb.example.com" }))
    ).not.toThrow();
  });

  it("не кидает в development с дефолтным localhost APP_URL", () => {
    expect(() =>
      assertProductionAppUrl(envWith({ NODE_ENV: "development", APP_URL: "http://localhost:3000" }))
    ).not.toThrow();
  });

  it("не кидает без явного NODE_ENV (дефолт development)", () => {
    expect(() => assertProductionAppUrl(parseServerEnv({}))).not.toThrow();
  });

  it("parseServerEnv сам по себе НЕ кидает в production+localhost (сценарий apps/bridge)", () => {
    expect(() => parseServerEnv({ NODE_ENV: "production", APP_URL: "http://localhost:3000" })).not.toThrow();
  });
});
