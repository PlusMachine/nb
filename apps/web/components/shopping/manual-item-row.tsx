"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { Checkbox, useToast } from "@nb/ui";

import { NumericInput } from "@/components/shared/numeric-input";
import { parseDecimalInput } from "@/features/forms/numeric-validation";
import { formatInventoryQuantityInputValue } from "@/features/inventory/display";
import { inventoryUnitLabels, inventoryUnits, type InventoryUnit } from "@/features/inventory/units";
import {
  deleteManualShoppingItemAction,
  toggleManualShoppingItemAction,
  updateManualShoppingItemAction
} from "@/features/shopping/actions";
import type { ShoppingManualItemDto } from "@/features/shopping/contracts";

type Props = {
  item: ShoppingManualItemDto;
};

/**
 * П1: строка ручной позиции («Своё») — чекбокс «куплено» · имя (ссылка на
 * каталог, если привязана) · количество · редактировать/удалить.
 *
 * Каждая строка ведёт собственный оптимистичный стейт (канон —
 * ingredient-favorite-toggle.tsx: локальный стейт + rollback при ошибке,
 * НЕ useOptimistic). Удаление — БЕЗ ConfirmActionDialog (осознанное
 * исключение: позиция списка покупок — копеечная сущность, подтверждение
 * здесь — трение): оптимистичное скрытие строки + rollback с тостом при
 * ошибке. Переключение чекбокса — молча (в магазине связь плохая, тост
 * лишний), редактирование — инлайн, ошибки инлайн.
 */
export function ManualItemRow({ item }: Props) {
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

  // Ревалидация страницы после мутации ЛЮБОЙ другой строки (router.refresh())
  // приносит сюда тот же массив manualItems, включая ещё-не-подтверждённый
  // payload этой строки — если в этот момент здесь идёт свой pending-переход
  // (тоггл/удаление/редактирование), синхронизация с прилетевшим item затрёт
  // оптимистичный стейт устаревшими данными. Ждём завершения pending и
  // досинхронизируемся уже после него.
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

    // NumericInput нормализует запятую только по blur — Enter из поля не
    // проходит через blur, так что сырая «1,5» долетела бы до сервера как
    // нераспарсиваемая строка. Парсим сами: невалидное значение — локальная
    // ошибка без похода на сервер, валидное — шлём числом.
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

    // Сабмитим по Enter только из полей ввода (имя/количество/единица) — не
    // перехватываем его у кнопок «Сохранить»/«Отмена»: preventDefault здесь
    // глушил нативную активацию кнопки Enter'ом, из-за чего Enter на «Отмена»
    // сохранял вместо отмены.
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
    <li className="flex items-center gap-3 py-2.5">
      <label className="relative -m-3 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
        <Checkbox
          checked={currentItem.checked}
          disabled={isTogglePending}
          onCheckedChange={handleToggle}
          aria-label={`Отметить купленным: ${currentItem.name}`}
        />
      </label>
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
        <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{currentItem.quantityLabel}</span>
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
