"use client";

import { beerStyleFixtures, getBeerStyleById, getBjcpStyleDisplayName, searchBeerStyles } from "@nb/brewing-core";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { Popover } from "@nb/ui";

const noStyleOptionId = "none";

// Чистая логика ArrowUp/ArrowDown-навигации по combobox-списку — вынесена из
// компонента, чтобы не тащить в тест Radix Popover (Portal в vitest-окружении
// "node" ничего не рендерит, см. tests/consume-preview-dialog.test.tsx).
export function nextComboboxIndex(current: number, key: "ArrowDown" | "ArrowUp", length: number): number {
  if (length <= 0) {
    return 0;
  }

  return key === "ArrowDown" ? Math.min(current + 1, length - 1) : Math.max(current - 1, 0);
}

// index 0 — «вне BJCP стиля» (null), index N — styleIds[N-1]; undefined = индекс вне диапазона.
export function resolveStyleSelection(index: number, styleIds: string[]): string | null | undefined {
  if (index === 0) {
    return null;
  }

  return styleIds[index - 1];
}

// Дефолтный активный индекс при смене поискового запроса: если запрос непустой и
// что-то нашлось — сразу целимся в первый найденный стиль (индекс 1), а не в
// «вне BJCP стиля» (индекс 0), иначе Enter сразу после ввода запроса сбрасывает
// стиль вместо выбора первого результата. При пустом запросе — прежний дефолт 0.
export function defaultActiveIndex(trimmedQuery: string, resultCount: number): number {
  return trimmedQuery && resultCount > 0 ? 1 : 0;
}

export function StylePicker({
  value,
  onChange,
  className,
  id = "recipe-style"
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  id?: string;
}) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const labelId = `${id}-label`;
  const listboxId = `${id}-listbox`;
  const selectedStyle = useMemo(
    () => getBeerStyleById(value),
    [value]
  );
  const trimmedQuery = query.trim();
  const filteredStyles = useMemo(() => {
    const normalized = trimmedQuery.toLowerCase();
    if (!normalized) {
      return beerStyleFixtures;
    }

    return searchBeerStyles(normalized);
  }, [trimmedQuery]);

  // Плоский список опций для клавиатурной навигации: индекс 0 — «вне стиля», дальше найденные стили.
  const optionIds = useMemo(
    () => [noStyleOptionId, ...filteredStyles.map((style) => style.bjcpId ?? style.id)],
    [filteredStyles]
  );

  useEffect(() => {
    setActiveIndex(defaultActiveIndex(trimmedQuery, filteredStyles.length));
  }, [trimmedQuery, filteredStyles.length]);

  // Дефолт без фиксированной min-w — реальный рендер уже переопределяет её через
  // className ("min-w-0"), а фиксированная ширина в дефолте опасна при
  // переиспользовании компонента в узких контейнерах (мобайл).
  return (
    <div className={`relative ${className ?? "shrink-0"}`}>
      <label id={labelId} htmlFor={id} className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Стиль BJCP
      </label>
      <Popover
        align="start"
        contentClassName="max-w-md"
        onOpenChange={(open) => {
          if (open) {
            requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }));
          }
        }}
        trigger={({ open }) => (
          <button
            id={id}
            type="button"
            aria-labelledby={`${labelId} ${id}`}
            aria-expanded={open}
            className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 text-left text-sm text-foreground shadow-sm"
          >
            <span className={`truncate ${selectedStyle ? "text-foreground" : "text-muted-foreground"}`}>
              {selectedStyle ? getBjcpStyleDisplayName(selectedStyle) : "Выбрать стиль"}
            </span>
            <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {selectedStyle?.bjcpId ?? "BJCP"}
            </span>
          </button>
        )}
      >
        {({ close }) => {
          const selectNoStyle = () => {
            onChange("");
            setQuery("");
            close();
          };

          const selectStyle = (style: (typeof filteredStyles)[number]) => {
            onChange(style.id);
            setQuery("");
            close();
          };

          const selectByIndex = (index: number) => {
            const resolved = resolveStyleSelection(index, filteredStyles.map((style) => style.id));
            if (resolved === undefined) {
              return;
            }

            if (resolved === null) {
              selectNoStyle();
              return;
            }

            const style = filteredStyles.find((candidate) => candidate.id === resolved);
            if (style) {
              selectStyle(style);
            }
          };

          return (
            <div className="w-[min(420px,calc(100vw-2.5rem))]">
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найти стиль по коду, семейству или названию"
                className="h-10 w-full rounded-xl border border-border px-3 text-sm text-foreground"
                role="combobox"
                aria-expanded="true"
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-activedescendant={`style-option-${optionIds[activeIndex]}`}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((index) => nextComboboxIndex(index, "ArrowDown", optionIds.length));
                    return;
                  }

                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex((index) => nextComboboxIndex(index, "ArrowUp", optionIds.length));
                    return;
                  }

                  if (event.key === "Enter") {
                    event.preventDefault();
                    selectByIndex(activeIndex);
                    return;
                  }

                  if (event.key === "Escape") {
                    close();
                  }
                }}
              />
              <div id={listboxId} role="listbox" className="mt-2 max-h-80 overflow-y-auto">
                <button
                  id="style-option-none"
                  type="button"
                  role="option"
                  aria-selected={activeIndex === 0}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={selectNoStyle}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-accent ${activeIndex === 0 ? "bg-accent" : !selectedStyle ? "bg-muted text-foreground" : "text-foreground"}`}
                >
                  <span>Пиво вне BJCP стиля</span>
                  {!selectedStyle ? <span className="text-[11px] text-muted-foreground">активно</span> : null}
                </button>

                {filteredStyles.length ? (
                  filteredStyles.map((style, index) => {
                    const styleCode = style.styleKey ?? style.bjcpId;
                    const styleFamily = style.familyRu ?? style.family;
                    const subtitle = [styleCode, style.name, styleFamily].filter(Boolean).join(" • ");
                    const optionIndex = index + 1;
                    const isActive = activeIndex === optionIndex;

                    return (
                      <button
                        key={style.id}
                        id={`style-option-${style.bjcpId ?? style.id}`}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => selectStyle(style)}
                        className={`mt-1 flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-accent ${isActive ? "bg-accent" : value === style.id ? "bg-muted" : ""}`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{getBjcpStyleDisplayName(style)}</div>
                          <div className="text-xs text-muted-foreground">
                            {subtitle}
                          </div>
                        </div>
                        {value === style.id ? <span className="text-[11px] text-muted-foreground">выбран</span> : null}
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-4 text-sm text-muted-foreground">Ничего не найдено.</div>
                )}
              </div>
            </div>
          );
        }}
      </Popover>
    </div>
  );
}
