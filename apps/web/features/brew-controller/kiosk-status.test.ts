import { describe, expect, it } from "vitest";

import { kioskOfflineBanner, wakeLockHintMessage } from "./kiosk-status";

describe("kioskOfflineBanner", () => {
  it("свежая телеметрия (не устарела, conn=online) → баннера нет", () => {
    expect(
      kioskOfflineBanner({ conn: "online", isStale: false, lastFrameAtMs: 1_000, nowMs: 2_000 }),
    ).toBeNull();
  });

  it("conn=offline → красный «Прибор офлайн», даже если isStale=false", () => {
    const banner = kioskOfflineBanner({ conn: "offline", isStale: false, lastFrameAtMs: null, nowMs: 1_000 });
    expect(banner).toEqual({ tone: "red", title: "Прибор офлайн", detail: "" });
  });

  it("isStale=true (conn≠offline) → амбер «Данные устарели»", () => {
    const banner = kioskOfflineBanner({ conn: "online", isStale: true, lastFrameAtMs: null, nowMs: 1_000 });
    expect(banner).toEqual({ tone: "amber", title: "Данные устарели", detail: "" });
  });

  it("conn=offline перевешивает isStale (обрыв связи важнее устаревания)", () => {
    const banner = kioskOfflineBanner({ conn: "offline", isStale: true, lastFrameAtMs: null, nowMs: 1_000 });
    expect(banner?.title).toBe("Прибор офлайн");
  });

  it("conn=error/connecting без isStale → баннера нет (совпадает с noFreshTelemetry дока)", () => {
    expect(
      kioskOfflineBanner({ conn: "error", isStale: false, lastFrameAtMs: null, nowMs: 1_000 }),
    ).toBeNull();
    expect(
      kioskOfflineBanner({ conn: "connecting", isStale: false, lastFrameAtMs: null, nowMs: 1_000 }),
    ).toBeNull();
  });

  it("lastFrameAtMs известен → detail с относительным временем последнего кадра", () => {
    const now = 10 * 60_000; // t=10 мин
    const lastFrame = now - 5 * 60_000; // кадр 5 мин назад
    const banner = kioskOfflineBanner({ conn: "offline", isStale: false, lastFrameAtMs: lastFrame, nowMs: now });
    expect(banner?.detail).toBe("последний кадр 5 мин назад");
  });

  it("lastFrameAtMs=null (кадра не было ни разу) → detail пустой, без вранья о времени", () => {
    const banner = kioskOfflineBanner({ conn: "offline", isStale: false, lastFrameAtMs: null, nowMs: 1_000 });
    expect(banner?.detail).toBe("");
  });
});

describe("wakeLockHintMessage", () => {
  it("engaged=true → сообщает, что экран не будет гаснуть", () => {
    expect(wakeLockHintMessage(true)).toBe("Экран не будет гаснуть, пока открыт киоск");
  });

  it("engaged=false → честная подсказка про настройки устройства (LAN/no-support, §9)", () => {
    expect(wakeLockHintMessage(false)).toBe("Включите «не гасить экран» в настройках устройства");
  });
});
