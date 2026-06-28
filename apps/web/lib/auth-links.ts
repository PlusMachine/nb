// Якоря регистрации: уводим анонима на вход, сохраняя адрес возврата (?next=),
// чтобы после успешного входа вернуть его ровно туда, где он нажал «Сохранить»/
// «Оценить» — момент максимальной мотивации не теряется.

/** Клиентский редирект на /login с текущим адресом в ?next=. */
export const redirectToLoginWithNext = (): void => {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
};

/**
 * Валидация next: пропускаем только локальный путь, чтобы исключить открытый
 * редирект на внешний хост. Иначе — fallback (по умолчанию рабочая зона).
 */
export const resolveSafeNextPath = (next: string | null | undefined, fallback = "/app"): string => {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
};
