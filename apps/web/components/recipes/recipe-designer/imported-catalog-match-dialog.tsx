"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PackageSearch, Search } from "lucide-react";
import { Button, Dialog, DialogCloseButton, DialogHeader } from "@nb/ui";

import type { IngredientCategory, IngredientSuggestionItem, IngredientType } from "@/features/ingredients/contracts";
import { isConfidentImportMatch } from "./imported-catalog-match";

export type ImportedMatchLine = {
  localId: string;
  name: string;
  type: IngredientType;
  category: IngredientCategory;
  categoryLabel: string;
  amountLabel: string;
  candidates: IngredientSuggestionItem[];
};

const candidateSecondaryLine = (item: IngredientSuggestionItem) => {
  const parts = [
    item.brand ?? item.brandName ?? item.producer ?? null,
    item.countryName ?? item.country ?? null
  ].filter((part): part is string => Boolean(part && part.trim()));
  return parts.join(" · ");
};

const dedupeById = (items: IngredientSuggestionItem[]) => {
  const seen = new Set<string>();
  const out: IngredientSuggestionItem[] = [];
  for (const item of items) {
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
};

/**
 * Пакетное сопоставление импортированных (name-only) позиций рецепта с каталогом.
 * Автоподбор предвыбирает кандидата ТОЛЬКО при уверенном совпадении имени (см.
 * `isConfidentImportMatch`); всё остальное — на ручной выбор. Если предложенное
 * не устраивает или нужного нет в подсказках — по каждой строке есть инлайн-поиск
 * по всему каталогу (тот же путь `/api/ingredients/search`, что и ручной пикер).
 * По «Применить» отдаёт наверх localId → выбранный элемент; применение идёт через
 * тот же `applySelection`, что и ручной пикер.
 */
export function ImportedCatalogMatchDialog({
  open,
  pending,
  lines,
  onApply,
  onClose
}: {
  open: boolean;
  pending: boolean;
  lines: ImportedMatchLine[];
  onApply: (selections: Record<string, IngredientSuggestionItem>) => void;
  onClose: () => void;
}) {
  // null = «оставить импортированным». Ключ всегда присутствует после инициализации.
  const [selection, setSelection] = useState<Record<string, IngredientSuggestionItem | null>>({});
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});
  const [manualQuery, setManualQuery] = useState<Record<string, string>>({});
  const [manualResults, setManualResults] = useState<Record<string, IngredientSuggestionItem[]>>({});
  const [manualLoading, setManualLoading] = useState<Record<string, boolean>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // При каждом открытии предвыбираем уверенный матч (или «оставить») и сбрасываем ручной поиск.
  useEffect(() => {
    if (!open) {
      return;
    }
    const next: Record<string, IngredientSuggestionItem | null> = {};
    for (const line of lines) {
      next[line.localId] = line.candidates.find((candidate) => isConfidentImportMatch(line.name, candidate)) ?? null;
    }
    setSelection(next);
    setManualOpen({});
    setManualQuery({});
    setManualResults({});
    setManualLoading({});
  }, [open, lines]);

  const matchedCount = useMemo(
    () => lines.filter((line) => selection[line.localId]).length,
    [lines, selection]
  );

  const runManualSearch = (line: ImportedMatchLine, query: string) => {
    setManualQuery((prev) => ({ ...prev, [line.localId]: query }));
    clearTimeout(debounceTimers.current[line.localId]);
    if (query.trim().length < 2) {
      setManualResults((prev) => ({ ...prev, [line.localId]: [] }));
      setManualLoading((prev) => ({ ...prev, [line.localId]: false }));
      return;
    }
    setManualLoading((prev) => ({ ...prev, [line.localId]: true }));
    debounceTimers.current[line.localId] = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.trim(), type: line.type, category: line.category, limit: "6" });
        const response = await fetch(`/api/ingredients/search?${params.toString()}`);
        const data = await response.json();
        const items = Array.isArray(data?.items) ? (data.items as IngredientSuggestionItem[]) : [];
        setManualResults((prev) => ({ ...prev, [line.localId]: items }));
      } catch {
        setManualResults((prev) => ({ ...prev, [line.localId]: [] }));
      } finally {
        setManualLoading((prev) => ({ ...prev, [line.localId]: false }));
      }
    }, 300);
  };

  const handleApply = () => {
    const result: Record<string, IngredientSuggestionItem> = {};
    for (const line of lines) {
      const chosen = selection[line.localId];
      if (chosen) {
        result[line.localId] = chosen;
      }
    }
    onApply(result);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      title="Сопоставить с каталогом"
      hideTitle
      size="lg"
    >
      <DialogHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground">
            <PackageSearch className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Сопоставить импортированное с каталогом</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Проверьте подобранные аналоги. Не то — выберите другой вариант или найдите вручную в каталоге.
            </p>
          </div>
        </div>
        <DialogCloseButton />
      </DialogHeader>

      <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
        {lines.map((line) => {
          const selected = selection[line.localId] ?? null;
          const hasConfident = line.candidates.some((candidate) => isConfidentImportMatch(line.name, candidate));
          // Список опций: авто-кандидаты + найденные вручную + сам выбранный (чтобы
          // ручной выбор не пропал, когда результаты поиска сменятся). Без дублей.
          const options = dedupeById([
            ...line.candidates,
            ...(manualResults[line.localId] ?? []),
            ...(selected ? [selected] : [])
          ]);
          const manualIsOpen = manualOpen[line.localId] ?? false;

          return (
            <div key={line.localId} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-semibold text-foreground">{line.name}</span>
                <span className="text-xs text-muted-foreground">{line.categoryLabel} · {line.amountLabel}</span>
              </div>

              {!pending && line.candidates.length > 0 && !hasConfident ? (
                <p className="mt-1.5 text-xs text-warning-subtle-foreground">Точного совпадения нет — выберите вручную.</p>
              ) : null}

              <div className="mt-2 space-y-1.5">
                {options.length === 0 ? (
                  pending ? (
                    <p className="text-xs text-muted-foreground">Подбираем аналоги из каталога…</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">В каталоге ничего не нашлось — позиция останется импортированной или найдите вручную.</p>
                  )
                ) : (
                  options.map((candidate) => {
                    const active = selected?.id === candidate.id;
                    const secondary = candidateSecondaryLine(candidate);
                    return (
                      <label
                        key={candidate.id}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-2.5 py-2 text-sm ${active ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted/50"}`}
                      >
                        <input
                          type="radio"
                          name={`match-${line.localId}`}
                          checked={active}
                          onChange={() => setSelection((prev) => ({ ...prev, [line.localId]: candidate }))}
                          className="mt-1"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-foreground">{candidate.displayName}</span>
                          {secondary ? <span className="mt-0.5 block text-xs text-muted-foreground">{secondary}</span> : null}
                        </span>
                      </label>
                    );
                  })
                )}

                <label
                  className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-sm ${selected === null ? "border-foreground bg-muted" : "border-border bg-card hover:bg-muted/50"}`}
                >
                  <input
                    type="radio"
                    name={`match-${line.localId}`}
                    checked={selected === null}
                    onChange={() => setSelection((prev) => ({ ...prev, [line.localId]: null }))}
                  />
                  <span className="text-muted-foreground">Оставить как импортированное</span>
                </label>
              </div>

              {manualIsOpen ? (
                <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    type="text"
                    autoFocus
                    value={manualQuery[line.localId] ?? ""}
                    onChange={(event) => runManualSearch(line, event.target.value)}
                    placeholder="Найти ингредиент в каталоге…"
                    className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  {manualLoading[line.localId] ? <span className="shrink-0 text-xs text-muted-foreground">…</span> : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setManualOpen((prev) => ({ ...prev, [line.localId]: true }))}
                  className="mt-2 text-xs font-medium text-foreground underline decoration-dotted underline-offset-2 hover:text-foreground/80"
                >
                  Не то? Найти в каталоге вручную
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border p-4">
        <span className="text-xs text-muted-foreground">Привяжется {matchedCount} из {lines.length}</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClose}>Отмена</Button>
          <Button type="button" size="sm" disabled={pending || matchedCount === 0} onClick={handleApply}>
            {pending ? "Применяем..." : "Применить"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
