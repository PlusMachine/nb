import { describe, expect, it } from "vitest";

import { isIosBrowser } from "@/features/notifications/ios-install-hint";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_CLASSIC_UA =
  "Mozilla/5.0 (iPad; CPU OS 13_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const DESKTOP_MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const DESKTOP_WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
// iPadOS 13+ по умолчанию шлёт десктопный UA (Macintosh), но выдаёт себя тачскрином.
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

describe("isIosBrowser", () => {
  it("распознаёт iPhone по UA", () => {
    expect(isIosBrowser(IPHONE_UA, "iPhone", 5)).toBe(true);
  });

  it("распознаёт iPad с классическим UA (iOS < 13)", () => {
    expect(isIosBrowser(IPAD_CLASSIC_UA, "iPad", 5)).toBe(true);
  });

  it("распознаёт iPadOS, маскирующийся под Mac (platform=MacIntel + тачскрин)", () => {
    expect(isIosBrowser(IPAD_DESKTOP_UA, "MacIntel", 5)).toBe(true);
  });

  it("не путает настоящий Mac (platform=MacIntel, но без тачскрина) с iPad", () => {
    expect(isIosBrowser(DESKTOP_MAC_UA, "MacIntel", 0)).toBe(false);
  });

  it("не срабатывает на Android", () => {
    expect(isIosBrowser(ANDROID_UA, "Linux armv8l", 5)).toBe(false);
  });

  it("не срабатывает на десктопном Windows", () => {
    expect(isIosBrowser(DESKTOP_WINDOWS_UA, "Win32", 0)).toBe(false);
  });

  it("без аргументов (SSR/Node, нет navigator) не падает и возвращает false", () => {
    expect(isIosBrowser()).toBe(false);
  });
});
