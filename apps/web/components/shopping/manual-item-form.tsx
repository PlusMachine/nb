"use client";

import { useRef, useState, useTransition } from "react";
import type { KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@nb/ui";

import { NumericInput } from "@/components/shared/numeric-input";
import { parseDecimalInput } from "@/features/forms/numeric-validation";
import { inventoryUnitLabels, inventoryUnits, type InventoryUnit } from "@/features/inventory/units";
import { addManualShoppingItemAction } from "@/features/shopping/actions";

type Variant = "listFooter" | "emptyState";

type Props = {
  variant?: Variant;
};

const collapsedButtonClassName: Record<Variant, string> = {
  listFooter: "inline-flex items-center gap-1.5 rounded-lg py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
  emptyState: "inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-border hover:bg-muted"
};

/**
 * П1: форма добавления ручной позиции («Своё»). Свёрнута — кнопка «Добавить
 * позицию»; раскрыта — инлайн-строка на месте списка (без модалки и без
 * URL-параметра): имя + количество + единица (оба опциональны, но парой).
 * После успеха форма остаётся раскрытой (частый сценарий «добавить
 * несколько»), поля очищаются, фокус возвращается в имя.
 */
export function ManualItemForm({ variant = "listFooter" }: Props) {
  const { show } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<InventoryUnit | "">("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const openForm = () => {
    setError(null);
    setExpanded(true);
    requestAnimationFrame(() => nameInputRef.current?.focus());
  };

  const closeForm = () => {
    setExpanded(false);
    setName("");
    setQuantity("");
    setUnit("");
    setError(null);
  };

  const submit = () => {
    // Кнопка «Добавить» дизейблена во время isPending, но Enter из поля имени
    // шёл сюда напрямую (см. handleKeyDown) в обход disabled — двойной Enter
    // до ответа сервера отправлял позицию дважды.
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

    // NumericInput нормализует запятую только по blur — Enter из поля не
    // проходит через blur, так что сырая «1,5» долетела бы до сервера как
    // нераспарсиваемая строка. Парсим сами: невалидное значение — локальная
    // ошибка без похода на сервер, валидное — шлём числом.
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
        unit: hasUnit ? unit : null
      });

      if (!result.ok) {
        if (result.code === "RATE_LIMITED" || result.code === "QUOTA_REACHED") {
          show({ title: result.message, tone: "danger" });
          return;
        }
        setError(result.fieldErrors?.name ?? result.fieldErrors?.quantity ?? result.message);
        return;
      }

      setName("");
      setQuantity("");
      setUnit("");
      setError(null);
      nameInputRef.current?.focus();
    });
  };

  // Esc закрывает форму целиком; Enter сабмитит только из поля имени (как и
  // задумано — количество/единица подтверждаются кнопкой «Добавить»).
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeForm();
      return;
    }

    if (event.key === "Enter" && event.target === nameInputRef.current) {
      event.preventDefault();
      submit();
    }
  };

  if (!expanded) {
    return (
      <button type="button" onClick={openForm} className={collapsedButtonClassName[variant]}>
        <Plus className="h-4 w-4" aria-hidden />
        Добавить позицию
      </button>
    );
  }

  return (
    <div
      className={variant === "emptyState" ? "mx-auto w-full max-w-sm text-left" : "w-full"}
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={nameInputRef}
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          placeholder="Название"
          className="min-w-[9rem] flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[15px] text-foreground transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <NumericInput
          value={quantity}
          onChange={(event) => {
            setQuantity(event.target.value);
            setError(null);
          }}
          placeholder="Кол-во"
          className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-right text-sm tabular-nums transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Количество"
        />
        <select
          value={unit}
          onChange={(event) => {
            setUnit(event.target.value as InventoryUnit | "");
            setError(null);
          }}
          className="rounded-lg border border-border bg-card py-1.5 pl-1.5 pr-6 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Единица измерения"
        >
          <option value="">—</option>
          {inventoryUnits.map((option) => (
            <option key={option} value={option}>{inventoryUnitLabels[option]}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-60"
        >
          Добавить
        </button>
        <button
          type="button"
          onClick={closeForm}
          disabled={isPending}
          className="rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
        >
          Отмена
        </button>
      </div>
      {error ? <p role="alert" className="mt-1.5 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
