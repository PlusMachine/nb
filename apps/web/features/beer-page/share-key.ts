import { createHmac, timingSafeEqual } from "node:crypto";

// Ссылка-секрет для страницы-презентации НЕопубликованного рецепта
// (/beer/<slug>?k=…). Ключ детерминированный — HMAC от id рецепта на серверном
// секрете: не требует колонки в БД, а перепечатанная через год наклейка ведёт
// на тот же URL. Обратная сторона — ключ нельзя отозвать, не сменив AUTH_SECRET;
// для MVP это осознанный размен.

const SHARE_KEY_LENGTH = 16;

const shareSecret = (): string =>
  // AUTH_SECRET обязателен в production (см. .env.example); фолбэк — только чтобы
  // dev без .env не падал, угадываемость ключей там не угроза.
  process.env.AUTH_SECRET || "nb-dev-share-secret";

/** Ключ доступа к странице пива непубличного рецепта (стабилен между печатями). */
export const buildBeerShareKey = (recipeId: string): string =>
  createHmac("sha256", shareSecret()).update(`beer-page:${recipeId}`).digest("base64url").slice(0, SHARE_KEY_LENGTH);

/** Проверка ключа из URL; сравнение за постоянное время. */
export const verifyBeerShareKey = (recipeId: string, key: string | null | undefined): boolean => {
  if (typeof key !== "string" || key.length !== SHARE_KEY_LENGTH) {
    return false;
  }
  const expected = Buffer.from(buildBeerShareKey(recipeId));
  const actual = Buffer.from(key);
  return actual.length === expected.length && timingSafeEqual(expected, actual);
};
