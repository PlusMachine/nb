// =============================================================================
//  features/pwa/device-local-console.ts
//  Обнаружимость локального пульта прибора (PWA refactor P5): встроенный веб-UI
//  прошивки (`http://<localUrl>/ui`) живёт в LAN прибора и работает без
//  интернета — в отличие от нашего облачного пульта. Пульт устройства при
//  каждой загрузке (см. device-console.tsx) запоминает адрес в localStorage,
//  чтобы офлайн-страница могла предложить прямую ссылку на него.
//
//  Контракт: ключ и форму записи читает app/offline/offline-console-list.tsx
//  через обычный импорт (клиентский компонент офлайн-страницы) — менять форму
//  без учёта того компонента нельзя.
// =============================================================================

/** Ключ localStorage с запомненными адресами приборов. */
export const DEVICE_LOCAL_URLS_STORAGE_KEY = "nb_device_local_urls";

/** url — device.localUrl как есть (без /ui, см. localConsoleUrl). */
export type DeviceLocalConsoleEntry = {
  id: string;
  name: string;
  url: string;
};

/** Кап на число запомненных приборов — офлайн-подсказке больше не нужно. */
const MAX_ENTRIES = 8;

/**
 * Апсертит прибор в localStorage: самые свежие — в начале списка, лишние за
 * капом отбрасываются. SSR-безопасно (no-op без window) и не роняет рендер в
 * приватном режиме браузера — localStorage там кидает, ловим и молчим.
 */
export function rememberDeviceLocalConsole(entry: DeviceLocalConsoleEntry): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(DEVICE_LOCAL_URLS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const existing = Array.isArray(parsed) ? (parsed as DeviceLocalConsoleEntry[]) : [];
    const rest = existing.filter((item) => item && item.id !== entry.id);
    const next = [entry, ...rest].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(DEVICE_LOCAL_URLS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // приватный режим / квота — это лишь best-effort кэш для офлайн-страницы
  }
}

/** Локальный адрес прибора (`device.localUrl`) → ссылка на встроенный `/ui` прошивки. */
export function localConsoleUrl(localUrl: string): string {
  return `${localUrl.replace(/\/+$/, "")}/ui`;
}
