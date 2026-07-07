import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams()
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams
}));

import { useIsKiosk } from "../lib/use-is-kiosk";
import { resolveShowConsentBanner } from "../components/legal/consent-provider";

function KioskProbe() {
  const isKiosk = useIsKiosk();
  return React.createElement("span", { "data-kiosk": isKiosk ? "1" : "0" });
}

describe("useIsKiosk", () => {
  it("возвращает true при ?kiosk=1", () => {
    mocks.searchParams = new URLSearchParams("kiosk=1");
    const html = renderToStaticMarkup(React.createElement(KioskProbe));
    expect(html).toContain('data-kiosk="1"');
  });

  it("возвращает false без параметра kiosk", () => {
    mocks.searchParams = new URLSearchParams();
    const html = renderToStaticMarkup(React.createElement(KioskProbe));
    expect(html).toContain('data-kiosk="0"');
  });

  it("возвращает false при kiosk с другим значением", () => {
    mocks.searchParams = new URLSearchParams("kiosk=true");
    const html = renderToStaticMarkup(React.createElement(KioskProbe));
    expect(html).toContain('data-kiosk="0"');
  });
});

// ConsentProvider решает mounted внутри useEffect (не исполняется при
// renderToStaticMarkup в node-окружении без DOM), поэтому правило «в киоске баннер
// не показываем» проверяем через вынесенную чистую функцию resolveShowConsentBanner.
describe("resolveShowConsentBanner", () => {
  it("не показывает баннер в киоск-режиме даже без сохранённого согласия", () => {
    expect(resolveShowConsentBanner({ mounted: true, isKiosk: true, consent: null, forceOpen: false })).toBe(false);
  });

  it("показывает баннер вне киоска при отсутствии согласия", () => {
    expect(resolveShowConsentBanner({ mounted: true, isKiosk: false, consent: null, forceOpen: false })).toBe(true);
  });

  it("не показывает баннер до монтирования (гидратация ещё не прошла)", () => {
    expect(resolveShowConsentBanner({ mounted: false, isKiosk: false, consent: null, forceOpen: false })).toBe(false);
  });

  it("не показывает баннер при уже сохранённом согласии без reopen", () => {
    expect(resolveShowConsentBanner({ mounted: true, isKiosk: false, consent: "all", forceOpen: false })).toBe(false);
  });

  it("показывает баннер повторно при reopen, даже если согласие уже сохранено", () => {
    expect(resolveShowConsentBanner({ mounted: true, isKiosk: false, consent: "all", forceOpen: true })).toBe(true);
  });

  it("киоск подавляет баннер, даже если вызван reopen", () => {
    expect(resolveShowConsentBanner({ mounted: true, isKiosk: true, consent: "all", forceOpen: true })).toBe(false);
  });
});
