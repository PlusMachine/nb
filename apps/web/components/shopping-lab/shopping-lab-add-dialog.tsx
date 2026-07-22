"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { Button, Dialog, DialogCloseButton, DialogFooter, DialogHeader, useToast } from "@nb/ui";

import { NumericInput } from "@/components/shared/numeric-input";
import { parseDecimalInput } from "@/features/forms/numeric-validation";
import { ingredientCategories, type IngredientCategory, type IngredientSuggestionItem } from "@/features/ingredients/contracts";
import { inventoryCategoryLabels } from "@/features/inventory/page-model";
import { inventoryUnitLabels, inventoryUnits, type InventoryUnit } from "@/features/inventory/units";
import { addManualShoppingItemAction } from "@/features/shopping/actions";

const validIngredientCategories = new Set<string>(ingredientCategories);

// Категория приходит с сервера уже типизированной, но это чужой JSON через
// fetch — на всякий случай сверяем с реальным списком ingredientCategories,
// а не доверяем типу вслепую (см. features/ingredients/contracts.ts).
const resolveValidCategory = (category?: IngredientCategory): IngredientCategory | null => (
  category && validIngredientCategories.has(category) ? category : null
);

const buildSuggestionSubtitle = (item: IngredientSuggestionItem): string | null => {
  const categoryLabel = item.category ? inventoryCategoryLabels[item.category] : null;
  const brandLabel = item.brand ?? item.manufacturer ?? item.producer ?? null;
  return [categoryLabel, brandLabel].filter((part): part is string => Boolean(part)).join(" · ") || null;
};

// Привязка выбранного результата автокомплита: source различает каталожный
// ингредиент (catalogId) от собственного (customId) пользователя — оба
// приходят из того же поиска (route грузит includeCustom=true по умолчанию),
// и submit обязан положить id в правильное поле схемы (addManualShoppingItemSchema
// запрещает заполнять оба разом). subtitle — снимок buildSuggestionSubtitle на
// момент выбора (для строки привязки под инпутом — в v1-форме этого поля не было).
type SelectedIngredientRef = {
  source: "catalog" | "custom";
  id: string;
  category: IngredientCategory | null;
  subtitle: string | null;
};

const AUTOCOMPLETE_MIN_QUERY_LENGTH = 2;
const AUTOCOMPLETE_DEBOUNCE_MS = 250;
const AUTOCOMPLETE_RESULT_LIMIT = 8;

/**
 * Черновик IA (лаборатория, /app/shopping-lab, v2): модалка добавления ручной
 * позиции — замена инлайн-формы v1 (ShoppingLabManualForm, удалена). Каркас —
 * паттерн склада (AddIngredientModal, components/inventory/add-ingredient-modal.tsx):
 * Dialog + DialogHeader с DialogCloseButton, тело в p-5. Без
 * ConfirmActionDialog-guard'а на закрытие — позиция списка покупок копеечная
 * сущность, терять нечего (в отличие от полноценной формы добавления на склад).
 *
 * Поле «Название» — тот же автокомплит, что был в v1-форме: одновременно и
 * строка поиска. Выбор из выпадашки подставляет имя и запоминает привязку
 * (catalogId/customId), дальнейшее ручное редактирование имени привязку
 * сбрасывает — предложенный текст больше не гарантированно тот же
 * ингредиент. Свободный текст без выбора — позиция без привязки (пустая
 * выдача ниже явно проговаривает это как опцию, не тупик).
 *
 * Автокомплит — лёгкий, напрямую на /api/ingredients/search (НЕ через
 * тяжёлый IngredientPicker): дебаунс+отмена запроса тем же приёмом, что и в
 * ingredient-picker.tsx (useEffect + setTimeout + AbortController в cleanup),
 * только держит зависимостью `searchQuery`, а не `name` — так подстановка
 * имени по выбору (которая тоже меняет `name`) не переоткрывает поиск: выбор
 * явно сбрасывает `searchQuery` в "", а не переустанавливает её.
 *
 * После успешного добавления модалка НЕ закрывается (сценарий «добавить
 * несколько», как AddIngredientModal): поля очищаются, фокус возвращается в
 * «Название», а под полями показывается статус-строка — живёт, пока
 * пользователь не начнёт следующий ввод (см. successMessage).
 */
export function ShoppingLabAddDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { show } = useToast();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<InventoryUnit | "">("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<IngredientSuggestionItem[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "done">("idle");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedRef, setSelectedRef] = useState<SelectedIngredientRef | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < AUTOCOMPLETE_MIN_QUERY_LENGTH) {
      setIsOpen(false);
      setSuggestions([]);
      setSearchStatus("idle");
      return;
    }

    // Открываем сразу (с индикатором «Ищем…»), сам запрос — только после
    // дебаунса: пользователь видит отклик мгновенно, сеть не бьётся на каждый символ.
    setIsOpen(true);
    setSearchStatus("loading");
    const controller = new AbortController();

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/ingredients/search?q=${encodeURIComponent(trimmed)}&limit=${AUTOCOMPLETE_RESULT_LIMIT}`,
            { signal: controller.signal }
          );
          if (controller.signal.aborted) {
            return;
          }
          if (!response.ok) {
            setSuggestions([]);
            setSearchStatus("done");
            return;
          }
          const data: unknown = await response.json();
          const items: IngredientSuggestionItem[] = Array.isArray(data)
            ? (data as IngredientSuggestionItem[])
            : ((data as { items?: IngredientSuggestionItem[] })?.items ?? []);
          setSuggestions(items);
          setHighlightedIndex(items.length > 0 ? 0 : -1);
          setSearchStatus("done");
        } catch {
          if (controller.signal.aborted) {
            return;
          }
          setSuggestions([]);
          setSearchStatus("done");
        }
      })();
    }, AUTOCOMPLETE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  // Клик вне поля/выпадашки закрывает только выпадашку, не модалку целиком.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  // Сброс при каждом закрытии (паттерн — TransferDialog: useEffect по open,
  // components/shopping/transfer-dialog.tsx) — следующее открытие обязано
  // начинать с чистой формы, а не с обрывков прошлой сессии добавления.
  useEffect(() => {
    if (open) {
      return;
    }
    setName("");
    setQuantity("");
    setUnit("");
    setError(null);
    setSuccessMessage(null);
    setSelectedRef(null);
    setSearchQuery("");
    setSuggestions([]);
    setSearchStatus("idle");
    setIsOpen(false);
  }, [open]);

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setName(value);
    setError(null);
    setSuccessMessage(null);
    // Правка имени руками после выбора — привязка больше не гарантированно
    // соответствует тексту, снимаем её.
    if (selectedRef) {
      setSelectedRef(null);
    }
    setSearchQuery(value);
  };

  const handleSelectSuggestion = (item: IngredientSuggestionItem) => {
    setName(item.displayName);
    setSelectedRef({
      source: item.source,
      id: item.id,
      category: resolveValidCategory(item.category),
      subtitle: buildSuggestionSubtitle(item)
    });
    setError(null);
    setSuccessMessage(null);
    // Сброс (не повторная простановка того же значения) — иначе эффект выше
    // тут же переоткрыл бы поиск по только что подставленному имени.
    setSearchQuery("");
  };

  const submit = () => {
    if (isPending) {
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Введите название.");
      return;
    }

    const hasQuantity = quantity.trim() !== "";
    const hasUnit = unit !== "";
    if (hasQuantity !== hasUnit) {
      setError("Количество и единица указываются вместе.");
      return;
    }

    let parsedQuantity: number | null = null;
    if (hasQuantity) {
      const parsed = parseDecimalInput(quantity);
      if (parsed == null || !Number.isFinite(parsed)) {
        setError("Введите число.");
        return;
      }
      parsedQuantity = parsed;
    }

    setError(null);
    startTransition(async () => {
      const result = await addManualShoppingItemAction({
        name: trimmedName,
        quantity: hasQuantity ? parsedQuantity : null,
        unit: hasUnit ? unit : null,
        category: selectedRef?.category ?? undefined,
        catalogId: selectedRef?.source === "catalog" ? selectedRef.id : undefined,
        customId: selectedRef?.source === "custom" ? selectedRef.id : undefined
      });

      if (!result.ok) {
        if (result.code === "RATE_LIMITED" || result.code === "QUOTA_REACHED") {
          show({ title: result.message, tone: "danger" });
          return;
        }
        setError(result.fieldErrors?.name ?? result.fieldErrors?.quantity ?? result.message);
        return;
      }

      // Модалка остаётся открытой (сценарий «добавить несколько») — очищаем
      // поля и показываем статус вместо закрытия, как AddIngredientModal
      // делает после успешного сохранения.
      setName("");
      setQuantity("");
      setUnit("");
      setError(null);
      setSelectedRef(null);
      setSearchQuery("");
      setSuccessMessage(`Добавлено в список: ${result.item.name}.`);
      nameInputRef.current?.focus();
    });
  };

  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && isOpen && suggestions.length > 0) {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp" && isOpen && suggestions.length > 0) {
      event.preventDefault();
      setHighlightedIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === "Enter") {
      // Выпадашка реально «открыта» для целей Enter только когда есть что
      // выбирать — при loading/пустой выдаче Enter должен вести себя как
      // обычно (сабмит формы свободным текстом), а не проваливаться в никуда.
      if (isOpen && suggestions.length > 0) {
        event.preventDefault();
        handleSelectSuggestion(suggestions[highlightedIndex >= 0 ? highlightedIndex : 0]);
        return;
      }
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      // Гасим только выпадашку, не должно долетать до закрытия модалки этим
      // же нажатием. ⚠ Radix закрывает Dialog по Escape через отдельный
      // capture-phase листенер на document (DismissableLayer), который
      // отрабатывает раньше этого bubble-обработчика — stopPropagation здесь
      // не гарантирует, что модалка не закроется тем же нажатием (в отличие
      // от v1-формы, где это был обычный div с onKeyDown, а не Dialog).
      // Оставлено ради консистентности с остальной портированной клавиатурной
      // логикой; полноценные два шага Esc потребовали бы прокинуть
      // onEscapeKeyDown через общий Dialog (packages/ui) — вне зоны правок.
      event.stopPropagation();
      setIsOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Добавить позицию" hideTitle size="sm">
      <DialogHeader>
        <h2 className="text-base font-semibold text-foreground">Добавить позицию</h2>
        <DialogCloseButton />
      </DialogHeader>

      <div className="space-y-4 p-5">
        <div>
          <label className="text-sm font-medium text-foreground">Название</label>
          <div ref={containerRef} className="relative mt-1.5">
            <input
              ref={nameInputRef}
              type="text"
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-autocomplete="list"
              autoComplete="off"
              autoFocus
              value={name}
              onChange={handleNameChange}
              onKeyDown={handleNameKeyDown}
              placeholder="Начните вводить название"
              className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[15px] text-foreground transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {selectedRef ? (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-success">
                <Check className="h-3 w-3 shrink-0" aria-hidden />
                {selectedRef.source === "custom" ? "Свой ингредиент" : "Из каталога"}
                {selectedRef.subtitle ? ` · ${selectedRef.subtitle}` : ""}
              </p>
            ) : null}
            {isOpen ? (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                {searchStatus === "loading" ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Ищем…</p>
                ) : suggestions.length > 0 ? (
                  <ul id={listboxId} role="listbox" className="max-h-64 overflow-auto py-1">
                    {suggestions.map((item, index) => {
                      const subtitle = buildSuggestionSubtitle(item);
                      return (
                        <li key={`${item.source}:${item.id}`}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={index === highlightedIndex}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => handleSelectSuggestion(item)}
                            className={`flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition-colors ${
                              index === highlightedIndex ? "bg-accent" : "hover:bg-accent"
                            }`}
                          >
                            <span className="truncate text-sm font-medium text-foreground">{item.displayName}</span>
                            {subtitle ? <span className="truncate text-xs text-muted-foreground">{subtitle}</span> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="px-3 py-2">
                    <p className="text-xs text-muted-foreground">Ничего не найдено</p>
                    <p className="mt-1 text-xs text-muted-foreground">Позиция добавится без привязки к каталогу.</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-foreground">Количество</label>
            <NumericInput
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
                setError(null);
                setSuccessMessage(null);
              }}
              className="mt-1.5 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[15px] tabular-nums text-foreground transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Количество"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Ед. изм.</label>
            <select
              value={unit}
              onChange={(event) => {
                setUnit(event.target.value as InventoryUnit | "");
                setError(null);
                setSuccessMessage(null);
              }}
              className="mt-1.5 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[15px] text-foreground transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Единица измерения"
            >
              <option value="">—</option>
              {inventoryUnits.map((option) => (
                <option key={option} value={option}>{inventoryUnitLabels[option]}</option>
              ))}
            </select>
          </div>
        </div>

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {successMessage ? <p role="status" className="text-sm font-medium text-success">{successMessage}</p> : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="primary" onClick={submit} disabled={isPending}>
          Добавить в список
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
