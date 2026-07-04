// Согласие на cookie и возрастная отметка 18+. Клиентобезопасный модуль (без
// next/headers): чтение/запись на клиенте через document.cookie. Серверная часть
// (root layout) при желании может прочитать те же значения через cookies(), но по
// умолчанию баннер решает всё на клиенте после гидратации — чтобы не переводить весь
// сайт в динамический рендеринг ради одной плашки.

export const COOKIE_CONSENT_COOKIE = "nb_cookie_consent";
export const AGE_NOTICE_COOKIE = "nb_age_ok";

// Версия формата значения cookie согласия. Сменить → у всех снова спросят согласие
// (например, если добавили новую категорию cookie).
export const COOKIE_CONSENT_VERSION = "1";
const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60; // 180 дней
const AGE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60; // 1 год

// "all" — согласие в т.ч. на аналитические cookie (PostHog); "necessary" — только
// строго необходимые (сессия, вход, защита). Аналитика включается ТОЛЬКО при "all".
export type CookieConsent = "all" | "necessary";

// Значение cookie: `${версия}:${выбор}`, напр. "1:all". Версия-разделитель нужна,
// чтобы устаревший формат трактовался как «согласия нет» и баннер показался снова.
export const serializeCookieConsent = (choice: CookieConsent): string => `${COOKIE_CONSENT_VERSION}:${choice}`;

export const parseCookieConsent = (raw: string | undefined | null): CookieConsent | null => {
  if (!raw) return null;
  const [version, choice] = raw.split(":");
  if (version !== COOKIE_CONSENT_VERSION) return null;
  return choice === "all" || choice === "necessary" ? choice : null;
};

export const analyticsAllowed = (consent: CookieConsent | null): boolean => consent === "all";

const readCookie = (name: string): string | undefined => {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
};

const writeCookie = (name: string, value: string, maxAgeSeconds: number) => {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
};

export const readClientConsent = (): CookieConsent | null => parseCookieConsent(readCookie(COOKIE_CONSENT_COOKIE));

export const writeClientConsent = (choice: CookieConsent) =>
  writeCookie(COOKIE_CONSENT_COOKIE, serializeCookieConsent(choice), CONSENT_MAX_AGE_SECONDS);

export const readClientAgeAck = (): boolean => readCookie(AGE_NOTICE_COOKIE) === "1";

export const writeClientAgeAck = () => writeCookie(AGE_NOTICE_COOKIE, "1", AGE_MAX_AGE_SECONDS);
