"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Package, Pencil, Trash2 } from "lucide-react";
import { Checkbox, useToast } from "@nb/ui";

import { NumericInput } from "@/components/shared/numeric-input";
import { categoryIconBg, categoryIcons } from "@/components/recipes/recipe-designer/helpers";
import { parseDecimalInput } from "@/features/forms/numeric-validation";
import { formatInventoryQuantityInputValue } from "@/features/inventory/display";
import { inventoryUnitLabels, inventoryUnits, type InventoryUnit } from "@/features/inventory/units";
import {
  deleteManualShoppingItemAction,
  toggleManualShoppingItemAction,
  updateManualShoppingItemAction
} from "@/features/shopping/actions";
import type { ShoppingManualItemDto } from "@/features/shopping/contracts";

/**
 * v4 (лаборатория): строка ручной позиции внутри ЕДИНОГО списка (вместо
 * отдельной секции «Своё») — та же мутационная логика, что и у боевого
 * ManualItemRow (components/shopping/manual-item-row.tsx: те же серверные
 * экшены toggle/update/delete, тот же оптимистичный стейт-паттерн), но своя
 * разметка с иконкой категории слева — боевой компонент возвращает СВОЙ
 * <li>, вложить в него ещё один <li> с иконкой нельзя (невалидный HTML), а
 * менять боевой файл ради лаборатории не стоит. Логика мутаций НЕ
 * продублирована — экшены те же самые импортированные функции.
 */
export function ShoppingLabManualItemRow({ item }: { item: ShoppingManualItemDto }) {
  const router = useRouter();
  const { show } = useToast();

  const [currentItem, setCurrentItem] = useState(item);
  const [isDeleted, setIsDeleted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnit, setEditUnit] = useState<InventoryUnit | "">("");
  const [editError, setEditError] = useState<string | null>(null);

  const [isTogglePending, startToggleTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [isEditPending, startEditTransition] = useTransition();

  const nameInputRef = useRef<HTMLInputElement>(null);
  const isMutationPending = isTogglePending || isDeletePending || isEditPending;

  useEffect(() => {
    if (isMutationPending) {
      return;
    }
    setCurrentItem(item);
  }, [item, isMutationPending]);

  useEffect(() => {
    if (isEditing) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditing]);

  if (isDeleted) {
    return null;
  }

  const startEditing = () => {
    setEditName(currentItem.name);
    setEditQuantity(
      currentItem.quantity != null
        ? formatInventoryQuantityInputValue(currentItem.quantity, currentItem.unit ?? undefined)
        : ""
    );
    setEditUnit(currentItem.unit ?? "");
    setEditError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditError(null);
  };

  const submitEdit = () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError("Введите название.");
      return;
    }

    const hasQuantity = editQuantity.trim() !== "";
    const hasUnit = editUnit !== "";
    if (hasQuantity !== hasUnit) {
      setEditError("Количество и единица указываются вместе.");
      return;
    }

    let parsedQuantity: number | null = null;
    if (hasQuantity) {
      const parsed = parseDecimalInput(editQuantity);
      if (parsed == null || !Number.isFinite(parsed)) {
        setEditError("Введите число.");
        return;
      }
      parsedQuantity = parsed;
    }

    setEditError(null);
    startEditTransition(async () => {
      const result = await updateManualShoppingItemAction(currentItem.id, {
        name: trimmedName,
        quantity: hasQuantity ? parsedQuantity : null,
        unit: hasUnit ? editUnit : null
      });

      if (!result.ok) {
        setEditError(result.fieldErrors?.name ?? result.fieldErrors?.quantity ?? result.message);
        return;
      }

      setCurrentItem(result.item);
      setIsEditing(false);
      router.refresh();
    });
  };

  const handleEditKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
      return;
    }
    if (
      event.key === "Enter" &&
      (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
    ) {
      event.preventDefault();
      submitEdit();
    }
  };

  const handleToggle = (nextChecked: boolean) => {
    const previous = currentItem;
    setCurrentItem({ ...currentItem, checked: nextChecked });

    startToggleTransition(async () => {
      const result = await toggleManualShoppingItemAction(currentItem.id, nextChecked);

      if (!result.ok) {
        setCurrentItem(previous);
        return;
      }

      setCurrentItem(result.item);
      router.refresh();
    });
  };

  const handleDelete = () => {
    setIsDeleted(true);

    startDeleteTransition(async () => {
      const result = await deleteManualShoppingItemAction(currentItem.id);

      if (!result.ok) {
        setIsDeleted(false);
        show({ title: result.message, tone: "danger" });
        return;
      }

      router.refresh();
    });
  };

  const CategoryIcon = currentItem.category ? categoryIcons[currentItem.category] : Package;
  const iconBg = currentItem.category ? categoryIconBg[currentItem.category] : "bg-muted text-muted-foreground";

  if (isEditing) {
    return (
      <li className="flex flex-col gap-1.5 py-2.5" onKeyDown={handleEditKeyDown}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={nameInputRef}
            type="text"
            value={editName}
            onChange={(event) => {
              setEditName(event.target.value);
              setEditError(null);
            }}
            className="min-w-[9rem] flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[15px] text-foreground transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Название"
          />
          <NumericInput
            value={editQuantity}
            onChange={(event) => {
              setEditQuantity(event.target.value);
              setEditError(null);
            }}
            className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-right text-sm tabular-nums transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Количество"
          />
          <select
            value={editUnit}
            onChange={(event) => {
              setEditUnit(event.target.value as InventoryUnit | "");
              setEditError(null);
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
            onClick={submitEdit}
            disabled={isEditPending}
            className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-60"
          >
            Сохранить
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            disabled={isEditPending}
            className="rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            Отмена
          </button>
        </div>
        {editError ? <p role="alert" className="text-xs text-destructive">{editError}</p> : null}
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 py-2.5">
      <label className="relative -m-3 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
        <Checkbox
          checked={currentItem.checked}
          disabled={isTogglePending}
          onCheckedChange={handleToggle}
          aria-label={`Отметить купленным: ${currentItem.name}`}
        />
      </label>
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconBg}`} aria-hidden>
        <CategoryIcon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-[15px] font-medium leading-snug ${
            currentItem.checked ? "text-muted-foreground line-through" : "text-foreground"
          }`}
        >
          {currentItem.catalogHref ? (
            <Link href={currentItem.catalogHref} className="transition-colors hover:text-muted-foreground">
              {currentItem.name}
            </Link>
          ) : (
            currentItem.name
          )}
        </p>
      </div>
      {currentItem.quantityLabel ? (
        <span className="shrink-0 pt-0.5 text-sm font-bold tabular-nums text-foreground">{currentItem.quantityLabel}</span>
      ) : null}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={startEditing}
          aria-label="Изменить позицию"
          className="relative rounded-lg p-2 text-muted-foreground before:absolute before:-inset-2 before:content-[''] transition-colors hover:bg-muted hover:text-foreground"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeletePending}
          aria-label="Удалить позицию"
          className="relative rounded-lg p-2 text-muted-foreground before:absolute before:-inset-2 before:content-[''] transition-colors hover:bg-destructive-subtle hover:text-destructive disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
