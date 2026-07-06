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
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
        className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onValueChange("");
            inputRef.current?.focus();
          }}
          aria-label="Очистить поиск"
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
