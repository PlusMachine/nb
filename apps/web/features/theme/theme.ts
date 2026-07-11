/**
 * Пользовательская тема оформления. Хранится в cookie `nb_theme`
 * (по образцу `nb_my_recipes_view`): сервер читает её в app/layout.tsx и ставит
 * класс/скрипт до пейнта, поэтому вспышки светлого (FOUC) нет.
 */
export const THEME_COOKIE = "nb_theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 год

export type ThemePreference = "light" | "dark" | "system";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_THEME_PREFERENCE;
}

/** meta theme-color под каждую тему (строка состояния браузера/PWA). */
export const THEME_COLOR = { light: "#f4f4f6", dark: "#09090b" } as const;

/**
 * Инлайн-скрипт: до первого пейнта ставит класс `.dark` на <html> по cookie
 * (или системной теме, если режим `system`) и синхронизирует `color-scheme`.
 * Читает cookie сам, поэтому корректирует и режим `system`, который сервер
 * заранее не знает. Вставляется как есть в <script> в layout.tsx.
 */
export const themeInitScript = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]+)/);var t=m?decodeURIComponent(m[1]):'system';var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
