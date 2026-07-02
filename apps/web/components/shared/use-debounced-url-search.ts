"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Options = {
  /** Текущее значение из URL (источник истины, приходит от родителя). */
  value: string;
  /** Строит href для нового значения поиска (остальные фильтры — из замыкания вызывающей стороны). */
  buildHref: (value: string) => string;
  debounceMs?: number;
};

/**
 * Общий debounce для поисковых полей, управляемых через URL: локальный
 * `inputValue` синхронизируется с внешним `value`, пока поле не в фокусе (чтобы
 * не перетирать ввод пользователя посреди набора текста), а изменения с
 * задержкой `debounceMs` уезжают в URL через `router.replace` внутри
 * `startTransition` (не добавляют записи в историю, не блокируют ввод).
 *
 * `onFocus`/`onBlur` — опциональные хендлеры для реального `<input>`; если их не
 * повесить, синхронизация с внешним `value` происходит всегда (как было в
 * инвентаре/рецептах до обобщения).
 */
export function useDebouncedUrlSearch({ value, buildHref, debounceMs = 250 }: Options) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [inputValue, setInputValue] = useState(value);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (isFocusedRef.current) {
      return;
    }

    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const trimmedLocal = inputValue.trim();
    const trimmedExternal = value.trim();
    if (trimmedLocal === trimmedExternal) {
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        router.replace(buildHref(trimmedLocal), { scroll: false });
      });
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [inputValue, value, buildHref, debounceMs, router]);

  const onFocus = useCallback(() => {
    isFocusedRef.current = true;
  }, []);

  const onBlur = useCallback(() => {
    isFocusedRef.current = false;
  }, []);

  return { inputValue, setInputValue, isPending, onFocus, onBlur };
}
