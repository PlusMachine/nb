import { afterEach, describe, expect, it, vi } from "vitest";

import { isCloudTransportEnabled } from "./mqtt-client";

// =============================================================================
//  Включение облачного транспорта по env. Импорт mqtt-client НЕ подключается к
//  брокеру (соединение ленивое, только в publishCommandAwaitAck), поэтому тест
//  безопасен без сети.
// =============================================================================
describe("isCloudTransportEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("false без брокера", () => {
    vi.stubEnv("BREWFORGE_MQTT_URL", "");
    vi.stubEnv("MQTT_URL", "");
    expect(isCloudTransportEnabled()).toBe(false);
  });

  it("true при заданном BREWFORGE_MQTT_URL", () => {
    vi.stubEnv("BREWFORGE_MQTT_URL", "mqtt://localhost:1883");
    expect(isCloudTransportEnabled()).toBe(true);
  });
});
