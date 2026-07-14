import { describe, expect, it } from "vitest";

import { buildIngestUrl, extractIntervalSeconds } from "./stream-device-core";

describe("buildIngestUrl", () => {
  it("составляет URL из APP_URL и токена", () => {
    expect(buildIngestUrl("https://nb.example", "abc123")).toBe("https://nb.example/api/ingest/abc123");
  });

  it("режет завершающий слэш APP_URL (иначе двойной слэш в пути)", () => {
    expect(buildIngestUrl("https://nb.example/", "abc123")).toBe("https://nb.example/api/ingest/abc123");
  });

  it("режет несколько завершающих слэшей", () => {
    expect(buildIngestUrl("https://nb.example//", "abc123")).toBe("https://nb.example/api/ingest/abc123");
  });

  it("работает с localhost:порт (dev)", () => {
    expect(buildIngestUrl("http://localhost:3000", "tok")).toBe("http://localhost:3000/api/ingest/tok");
  });
});

describe("extractIntervalSeconds", () => {
  it("читает число из payload.interval (iSpindel шлёт секунды)", () => {
    expect(extractIntervalSeconds({ interval: 900 })).toBe(900);
  });

  it("читает числовую строку терпимо", () => {
    expect(extractIntervalSeconds({ interval: "300" })).toBe(300);
  });

  it("null у мусорной строки", () => {
    expect(extractIntervalSeconds({ interval: "не число" })).toBeNull();
  });

  it("null у нуля/отрицательного значения (не может быть интервалом)", () => {
    expect(extractIntervalSeconds({ interval: 0 })).toBeNull();
    expect(extractIntervalSeconds({ interval: -5 })).toBeNull();
  });

  it("null при отсутствующем поле", () => {
    expect(extractIntervalSeconds({ name: "Floaty01" })).toBeNull();
  });

  it("null при payload не объекте (null/массив/примитив)", () => {
    expect(extractIntervalSeconds(null)).toBeNull();
    expect(extractIntervalSeconds(undefined)).toBeNull();
    expect(extractIntervalSeconds("interval:900")).toBeNull();
    expect(extractIntervalSeconds(42)).toBeNull();
  });
});
