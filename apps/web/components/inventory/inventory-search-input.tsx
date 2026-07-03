"use client";

import React, { useRef } from "react";
import { Search, X } from "lucide-react";

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
};

/**
 * Поиск по складу — обычная строка с живой фильтрацией списка под ней.
 * Намеренно НЕ используем IngredientPicker с async-дропдауном: список ниже уже
 * и есть результат запроса, а всплывающие подсказки лишь дублировали бы его
 * и перекрывали. Дебаунс и запись в URL — на стороне тулбара (useDebouncedUrlSearch).
 */
export function InventorySearchInput({
  value,
  onValueChange,
  placeholder = "Поиск ингредиентов..."
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onValueChange("");
          }
        }}
        placeholder={placeholder}
        aria-label="Поиск по складу"
        autoComplete="off"
        className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-9 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onValueChange("");
            inputRef.current?.focus();
          }}
          aria-label="Очистить поиск"
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
