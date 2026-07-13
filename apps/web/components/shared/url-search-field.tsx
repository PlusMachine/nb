"use client";

import React, { useCallback } from "react";
import { Loader2 } from "lucide-react";

import { Input } from "@nb/ui";
import { useDebouncedUrlSearch } from "@/components/shared/use-debounced-url-search";

type Props = {
  id: string;
  label: string;
  value: string;
  basePath: string;
  /**
   * Остальные фильтры раздела: попадут в query как есть. Пустые значения
   * отбрасываются, номер страницы сюда не передают — новый поиск всегда
   * возвращает на первую.
   */
  params?: Record<string, string | undefined>;
  placeholder?: string;
  className?: string;
};

/**
 * Поисковое поле, управляемое через URL: значение уезжает в query с дебаунсом
 * (router.replace), список перерисовывает сервер. Один и тот же контрол во всех
 * разделах админки — чтобы поиск везде вёл себя одинаково.
 */
export function UrlSearchField({
  id,
  label,
  value,
  basePath,
  params,
  placeholder,
  className = ""
}: Props) {
  // Объект params прилетает новым на каждый рендер, поэтому в зависимостях
  // держим его сериализацию: иначе buildHref менялся бы каждый рендер и
  // перезапускал дебаунс-таймер внутри useDebouncedUrlSearch.
  const paramsKey = JSON.stringify(params ?? {});

  const buildHref = useCallback((nextValue: string) => {
    const searchParams = new URLSearchParams();
    const trimmed = nextValue.trim();

    if (trimmed) {
      searchParams.set("q", trimmed);
    }

    const restored = JSON.parse(paramsKey) as Record<string, string | undefined>;
    for (const [key, entry] of Object.entries(restored)) {
      if (entry) {
        searchParams.set(key, entry);
      }
    }

    const query = searchParams.toString();
    return query ? `${basePath}?${query}` : basePath;
  }, [basePath, paramsKey]);

  const { inputValue, setInputValue, isPending, onFocus, onBlur } = useDebouncedUrlSearch({
    value,
    buildHref
  });

  return (
    <div className={`grid gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      <div className="relative">
        <Input
          id={id}
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          className="pr-10"
        />
        {isPending ? (
          <span role="status" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="sr-only">Обновляем список…</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
