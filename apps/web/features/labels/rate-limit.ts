// Публичный рендер наклеек (/api/labels/custom) доступен без логина, а каждый
// вызов — растеризация SVG, то есть CPU. Ограничиваем поток на IP тем же
// приёмом, что и обратная связь (features/feedback/rate-limit.ts): in-memory
// Map хватает, пока рантайм — один монолит.
const WINDOW_MS = 5 * 60 * 1000;
// Превью перерисовывается на правку полей (с дебаунсом), поэтому лимит щедрый:
// он про защиту от флуда, а не про экономию на пользователе.
const MAX_PER_WINDOW = 240;

const hitsByKey = new Map<string, number[]>();

export const checkLabelRenderRateLimit = (key: string): boolean => {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const recent = (hitsByKey.get(key) ?? []).filter((ts) => ts > cutoff);

  if (recent.length >= MAX_PER_WINDOW) {
    hitsByKey.set(key, recent);
    return false;
  }

  recent.push(now);
  hitsByKey.set(key, recent);
  return true;
};
