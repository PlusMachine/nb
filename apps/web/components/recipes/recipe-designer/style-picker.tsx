"use client";

import { beerStyleFixtures, getBeerStyleById, getBjcpStyleDisplayName, searchBeerStyles } from "@nb/brewing-core";
import React, { useMemo, useRef, useState } from "react";

import { Popover } from "@nb/ui";

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
  const labelId = `${id}-label`;
  const selectedStyle = useMemo(
    () => getBeerStyleById(value),
    [value]
  );
  const filteredStyles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return beerStyleFixtures;
    }

    return searchBeerStyles(normalized);
  }, [query]);

  return (
    <div className={`relative ${className ?? "min-w-[280px] shrink-0"}`}>
      <label id={labelId} htmlFor={id} className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Стиль BJCP
      </label>
      <Popover
        align="start"
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
            className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 text-left text-sm text-zinc-900 shadow-sm"
          >
            <span className={`truncate ${selectedStyle ? "text-zinc-900" : "text-zinc-500"}`}>
              {selectedStyle ? getBjcpStyleDisplayName(selectedStyle) : "Выбрать стиль"}
            </span>
            <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400">
              {selectedStyle?.bjcpId ?? "BJCP"}
            </span>
          </button>
        )}
      >
        {({ close }) => (
          <div className="w-[min(420px,calc(100vw-2.5rem))]">
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти стиль по коду, семейству или названию"
              className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900"
            />
            <div className="mt-2 max-h-80 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setQuery("");
                  close();
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-zinc-50 ${!selectedStyle ? "bg-zinc-50 text-zinc-900" : "text-zinc-700"}`}
              >
                <span>Пиво вне BJCP стиля</span>
                {!selectedStyle ? <span className="text-[11px] text-zinc-500">активно</span> : null}
              </button>

              {filteredStyles.length ? (
                filteredStyles.map((style) => {
                  const styleCode = style.styleKey ?? style.bjcpId;
                  const styleFamily = style.familyRu ?? style.family;
                  const subtitle = [styleCode, style.name, styleFamily].filter(Boolean).join(" • ");

                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => {
                        onChange(style.id);
                        setQuery("");
                        close();
                      }}
                      className={`mt-1 flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-zinc-50 ${value === style.id ? "bg-zinc-50" : ""}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">{getBjcpStyleDisplayName(style)}</div>
                        <div className="text-xs text-zinc-500">
                          {subtitle}
                        </div>
                      </div>
                      {value === style.id ? <span className="text-[11px] text-zinc-500">выбран</span> : null}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-sm text-zinc-500">Ничего не найдено.</div>
              )}
            </div>
          </div>
        )}
      </Popover>
    </div>
  );
}
