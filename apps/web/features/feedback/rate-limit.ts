// Простой in-memory rate-limit для отправки обратной связи. Runtime у нас —
// один модульный монолит (не serverless-россыпь), поэтому Map в памяти процесса
// достаточно для базовой защиты от спама/флуда. При переезде на несколько
// инстансов вынести в общий стор (Redis) — пока избыточно.
const WINDOW_MS = 10 * 60 * 1000; // 10 минут
const MAX_PER_WINDOW = 5;

const hitsByKey = new Map<string, number[]>();

export const checkFeedbackRateLimit = (key: string): boolean => {
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
