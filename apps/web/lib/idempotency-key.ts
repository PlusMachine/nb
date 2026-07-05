/**
 * Ключ идемпотентности для клиентских «намерений» (создать партию варки и т.п.):
 * генерируется один раз на намерение, стабилен между ретраями, поэтому двойной
 * клик/повторный сабмит/гонка вкладок ловятся сервером (unique-индекс) и не
 * плодят дубли. Формат — UUID (проходит серверную zod-валидацию `.uuid()`).
 *
 * В secure-context (localhost/https) берём crypto.randomUUID; фолбэк на редкий
 * случай его отсутствия даёт валидный по формату UUID.
 */
export const newIdempotencyKey = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
        (Number(char) ^ ((Math.random() * 16) >> (Number(char) / 4))).toString(16)
      );
