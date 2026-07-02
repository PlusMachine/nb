// =============================================================================
//  lib/error-handling.ts
//  Единая конвенция результата server actions. Многие actions уже вручную
//  повторяют форму `{ok:true,...} | {ok:false,message,code}` (см.
//  `RecipeSaveActionResult` в app/(public)/recipes/save-actions.ts) — этот
//  файл только даёт ОБЩИЙ тип + хелпер для НОВОГО кода. Существующие actions
//  массово не переписываем: миграция — по мере правки конкретного файла.
// =============================================================================

/** Итог server action: успех с данными (+опц. сообщение) либо явная ошибка. */
export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; message: string; code?: string };

export type ToActionResultOptions = {
  /** Известные доменные коды ошибок (обычно `error.message`) → текст для UI. */
  knownErrors?: Record<string, string>;
  /** Текст для неизвестных ошибок (код не входит в `knownErrors`). */
  fallbackMessage: string;
  /** Сообщение, которое кладётся в успешный результат (например, тост). */
  successMessage?: string;
};

/**
 * Оборачивает выполнение действия в try/catch и приводит результат к
 * {@link ActionResult}. Код ошибки берётся из `error.message` (соглашение
 * доменных сервисов — бросать `Error("KNOWN_CODE")`); если код есть в
 * `knownErrors` — отдаём его текст, иначе `fallbackMessage`. Неизвестные
 * ошибки не логируются здесь намеренно — вызывающая сторона решает, нужен ли
 * `console.error`/Sentry для конкретного action.
 */
export async function toActionResult<T>(
  fn: () => Promise<T>,
  options: ToActionResultOptions
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: options.successMessage };
  } catch (error) {
    const code = error instanceof Error ? error.message : undefined;
    const message = (code && options.knownErrors?.[code]) || options.fallbackMessage;
    return { ok: false, message, code };
  }
}
