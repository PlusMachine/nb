// Факты бутылки из query-параметров QR-кода (?b=&n=&abv=): генератор наклеек
// зашивает в ссылку на /beer/<slug> дату розлива, номер партии и фактическую
// крепость конкретного розлива — этот модуль их читает и проверяет. Параметры
// приходят из URL, то есть недоверенные (подставить может кто угодно), а
// используются только для показа на странице — поэтому любой мусор молча
// превращаем в null, без ошибок и исключений.

export type BottleParamsQuery = {
  b?: string;
  n?: string;
  abv?: string;
};

export type BottleParams = {
  bottlingDate: string | null;
  batchNo: string | null;
  abv: number | null;
};

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/**
 * Строгая календарная дата YYYY-MM-DD. `Date.UTC` молча переносит «2026-02-30»
 * на март, поэтому конструктору не доверяем: собираем дату и сверяем обратно —
 * если год/месяц/день после сборки разошлись с исходными, значит был перенос
 * через границу месяца/года и дата не существует в календаре.
 */
const parseBottlingDate = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }
  const match = ISO_DATE_RE.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_YEAR || year > MAX_YEAR) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealCalendarDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isRealCalendarDate ? value : null;
};

const BATCH_NO_MAX_LENGTH = 16;

const parseBatchNo = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, BATCH_NO_MAX_LENGTH) : null;
};

// До 2 цифр целой части, опционально точка/запятая и до 2 цифр дробной —
// «5», «5.6», «12,34». Диапазон проверяем отдельно (0 исключён, 30 включён).
const ABV_RE = /^\d{1,2}([.,]\d{1,2})?$/;

const parseAbv = (value: string | undefined): number | null => {
  if (!value || !ABV_RE.test(value)) {
    return null;
  }
  const num = Number(value.replace(",", "."));
  return num > 0 && num <= 30 ? num : null;
};

/** Разбор и валидация фактов бутылки из searchParams страницы /beer/<slug>. */
export const parseBottleParams = (query: BottleParamsQuery): BottleParams => ({
  bottlingDate: parseBottlingDate(query.b),
  batchNo: parseBatchNo(query.n),
  abv: parseAbv(query.abv)
});
