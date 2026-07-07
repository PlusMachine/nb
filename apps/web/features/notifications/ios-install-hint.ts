// =============================================================================
//  features/notifications/ios-install-hint.ts
//  PWA-рефактор (P4): web-push на iOS работает только у установленного на
//  экран «Домой» PWA (iOS 16.4+) — в обычной вкладке Safari PushManager
//  отсутствует, и usePushSubscription молча даёт state "unsupported". Эти
//  хелперы отличают такой случай (iOS + не standalone) от честного
//  "unsupported" на других платформах, чтобы показать подсказку вместо тишины.
//
//  Оба хелпера — чистые функции с параметрами по умолчанию: значения по
//  умолчанию читают navigator/window под guard'ами, поэтому вызов без
//  аргументов SSR-безопасен (Node без DOM), а тесты подставляют свои
//  ua/platform/maxTouchPoints без моков DOM.
// =============================================================================

function defaultUserAgent(): string {
  return typeof navigator !== "undefined" ? navigator.userAgent : "";
}

function defaultPlatform(): string {
  return typeof navigator !== "undefined" ? navigator.platform : "";
}

function defaultMaxTouchPoints(): number {
  return typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0;
}

/**
 * iOS/iPadOS-браузер: классический UA (`iPad|iPhone|iPod`) либо iPadOS,
 * который с версии 13 маскируется под Mac (`platform === "MacIntel"`), но
 * выдаёт себя тачскрином (`maxTouchPoints > 1` — у настоящего Mac его нет).
 */
export function isIosBrowser(
  ua: string = defaultUserAgent(),
  platform: string = defaultPlatform(),
  maxTouchPoints: number = defaultMaxTouchPoints()
): boolean {
  const isAppleTouchUa = /iPad|iPhone|iPod/.test(ua);
  const isIpadOsDisguisedAsMac = platform === "MacIntel" && maxTouchPoints > 1;
  return isAppleTouchUa || isIpadOsDisguisedAsMac;
}

/** Приложение открыто как установленный PWA (standalone), а не вкладка браузера. */
export function isStandaloneDisplay(): boolean {
  const displayModeStandalone =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const iosNavigatorStandalone =
    typeof navigator !== "undefined" && (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(displayModeStandalone) || iosNavigatorStandalone;
}
