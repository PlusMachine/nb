"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Options = {
  /** Текущее значение из URL (источник истины, приходит от родителя). */
  value: string;
  /** Строит href для нового значения поиска (остальные фильтры — из замыкания вызывающей стороны). */
  buildHref: (value: string) => string;
  debounceMs?: number;
  navigate?: (href: string) => void;
};

const isCurrentHref = (href: string) => {
  const target = new URL(href, window.location.href);
  return target.pathname === window.location.pathname && target.search === window.location.search;
};

/**
 * Общий debounce для поисковых полей, управляемых через URL: локальный
 * `inputValue` сохраняет последнее намерение пользователя, пока сервер
 * подтверждает предыдущий запрос. Новый ввод отменяет прежнее намерение,
 * включая очистку до завершения поиска. Поздний ответ не восстанавливает текст.
 * `isPending` отслеживает подтверждение значения и URL. Если результаты
 * загружаются отдельно, вызывающая сторона также показывает их ожидание.
 */
export function useDebouncedUrlSearch({ value, buildHref, debounceMs = 250, navigate }: Options) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const navigationKey = searchParams?.toString() ?? "";
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const [inputValue, setLocalValue] = useState(value);
  const latestInputRef = useRef(value);
  const editedRef = useRef(false);
  const isFocusedRef = useRef(false);
  const requestedRef = useRef<string | null>(null);

  const setInputValue = useCallback((next: SetStateAction<string>) => {
    const resolved = typeof next === "function" ? next(latestInputRef.current) : next;
    latestInputRef.current = resolved;
    editedRef.current = true;
    setLocalValue(resolved);
  }, []);

  useEffect(() => {
    const handleBack = () => {
      editedRef.current = false;
      requestedRef.current = null;
      setPendingValue(null);
    };
    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, []);

  useEffect(() => {
    if (value.trim() === latestInputRef.current.trim() && isCurrentHref(buildHref(value.trim()))) {
      editedRef.current = false;
      requestedRef.current = null;
      setPendingValue(null);
      if (!isFocusedRef.current) {
        latestInputRef.current = value;
        setLocalValue(value);
      }
    } else if (!editedRef.current) {
      latestInputRef.current = value;
      setLocalValue(value);
    }
  }, [value, navigationKey, buildHref]);

  useEffect(() => {
    const trimmedLocal = inputValue.trim();
    const trimmedExternal = value.trim();
    if (!editedRef.current || (
      trimmedLocal === trimmedExternal
      && isCurrentHref(buildHref(trimmedLocal))
      && (requestedRef.current === null || requestedRef.current === trimmedLocal)
    )) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (!editedRef.current || latestInputRef.current.trim() !== trimmedLocal) return;
      requestedRef.current = trimmedLocal;
      setPendingValue(trimmedLocal);
      const href = buildHref(trimmedLocal);
      if (navigate) {
        navigate(href);
      } else {
        router.replace(href, { scroll: false });
      }
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [inputValue, value, buildHref, debounceMs, router, navigationKey, navigate]);

  const onFocus = useCallback(() => {
    isFocusedRef.current = true;
  }, []);

  const onBlur = useCallback(() => {
    isFocusedRef.current = false;
    if (!editedRef.current) {
      latestInputRef.current = value;
      setLocalValue(value);
    }
  }, [value]);

  return { inputValue, setInputValue, isPending: pendingValue !== null, onFocus, onBlur };
}
