"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { updateInventoryInlineAction } from "@/app/(app)/app/ingredients/actions";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import {
  buildInventoryDisplayInput,
  inventoryConsumeFractions,
  resolveInventoryConsumeContext,
  resolveInventoryConsumeState,
  resolveInventoryRemainingInUnit,
  type InventoryAdjustDirection
} from "@/features/inventory/consume";
import {
  formatInventoryQuantityForDisplay,
  formatInventoryQuantityInputValue
} from "@/features/inventory/display";
import { resolveIngredientDisplayNames } from "@/features/ingredients/presentation";
import {
  getInventoryUnitInputStep,
  inventoryUnitLabels,
  inventoryUnitShortLabels,
  type InventoryUnit
} from "@/features/inventory/units";

type Props = {
  item: InventoryListItemDto;
  onAction?: () => void;
  defaultMode?: InventoryAdjustDirection;
  renderTrigger?: (open: () => void) => React.ReactNode;
};

export function InventoryConsumeControl({ item, onAction, defaultMode = "consume", renderTrigger }: Props) {
  const context = useMemo(() => resolveInventoryConsumeContext(item), [item]);
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<InventoryAdjustDirection>(defaultMode);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<InventoryUnit>(context.defaultUnit);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const remainingLabel = useMemo(
    () => formatInventoryQuantityForDisplay(buildInventoryDisplayInput(item)),
    [item]
  );
  const { primaryName } = useMemo(() => resolveIngredientDisplayNames(item.source), [item.source]);

  const isConsume = direction === "consume";
  const parsedAmount = Number(amount.replace(",", "."));
  const state = resolveInventoryConsumeState({ item, context, amount: parsedAmount, unit, direction });
  const hasInput = amount.trim().length > 0;
  const canSubmit = hasInput && !state.error && !isPending;

  const getUnitLabel = (option: InventoryUnit) => {
    if (option !== "pack" || !context.packEquivalent) {
      return inventoryUnitLabels[option];
    }

    return `пачка ${formatInventoryQuantityInputValue(context.packEquivalent.normalizedQuantity, context.packEquivalent.normalizedUnit)}${context.packEquivalent.normalizedUnit}`;
  };

  const resetInputs = () => {
    setAmount("");
    setUnit(context.defaultUnit);
    setFeedback(null);
  };

  const openSheet = () => {
    setDirection(defaultMode);
    resetInputs();
    setOpen(true);
  };

  const switchDirection = (next: InventoryAdjustDirection) => {
    if (next === direction) {
      return;
    }

    setDirection(next);
    resetInputs();
  };

  const closeSheet = () => {
    setOpen(false);
    setFeedback(null);
  };

  const fillFraction = (fraction: number) => {
    const remainingInUnit = resolveInventoryRemainingInUnit(item, unit, context.packEquivalent);
    if (remainingInUnit == null) {
      return;
    }

    setFeedback(null);
    setAmount(formatInventoryQuantityInputValue(remainingInUnit * fraction, unit));
  };

  const usePack = () => {
    if (!context.packEquivalent) {
      return;
    }

    setFeedback(null);
    setUnit("pack");
    setAmount("1");
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSheet();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open]);

  const submit = () => {
    if (!canSubmit) {
      return;
    }

    startTransition(async () => {
      const result = await updateInventoryInlineAction({
        inventoryItemId: item.id,
        enteredQuantity: state.submitQuantity,
        enteredUnit: state.submitUnit
      });

      if (result.ok) {
        setOpen(false);
        setFeedback(null);
        onAction?.();
        return;
      }

      setFeedback(result.message);
    });
  };

  const previewValue = hasInput && !state.error
    ? `${formatInventoryQuantityInputValue(state.newRemainingDisplay.quantity, state.newRemainingDisplay.unit)} ${inventoryUnitShortLabels[state.newRemainingDisplay.unit]}`
    : null;

  const segmentClassName = (active: boolean) => (
    `flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
      active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
    }`
  );

  const sheet = open ? (
    <div
      className="animate-modal-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-zinc-950/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Изменить количество: ${primaryName}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          closeSheet();
        }
      }}
    >
      <div className="animate-modal-content relative z-[101] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/[0.06] sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">
            {isConsume ? "Сколько использовали?" : "Сколько докупили?"}
          </h2>
          <button
            type="button"
            onClick={closeSheet}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Закрыть"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex gap-1 rounded-xl bg-zinc-100 p-1">
            <button type="button" onClick={() => switchDirection("consume")} className={segmentClassName(isConsume)}>
              − Списал
            </button>
            <button type="button" onClick={() => switchDirection("restock")} className={segmentClassName(!isConsume)}>
              + Докупил
            </button>
          </div>

          <p className="text-sm text-zinc-500">
            <span className="font-medium text-zinc-900">{primaryName}</span>
            {" · осталось "}
            <span className="tabular-nums">{remainingLabel}</span>
          </p>

          {(isConsume || context.packEquivalent) ? (
            <div className="flex flex-wrap gap-1.5">
              {context.packEquivalent ? (
                <button
                  type="button"
                  onClick={usePack}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                >
                  1 пачка
                </button>
              ) : null}
              {isConsume ? (
                <>
                  {inventoryConsumeFractions.map((fraction) => (
                    <button
                      key={fraction.value}
                      type="button"
                      onClick={() => fillFraction(fraction.value)}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                    >
                      {fraction.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => fillFraction(1)}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                  >
                    Всё
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step={getInventoryUnitInputStep(unit)}
              value={amount}
              autoFocus
              onChange={(event) => {
                setAmount(event.target.value);
                setFeedback(null);
              }}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm tabular-nums transition-colors focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              inputMode="decimal"
              aria-label={isConsume ? "Количество использованного" : "Количество докупленного"}
              placeholder="0"
            />
            <select
              value={unit}
              onChange={(event) => {
                setUnit(event.target.value as InventoryUnit);
                setFeedback(null);
              }}
              className="rounded-xl border border-zinc-200 bg-white py-2.5 pl-3 pr-8 text-sm transition-colors focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              aria-label="Единица измерения"
            >
              {context.allowedUnits.map((option) => <option key={option} value={option}>{getUnitLabel(option)}</option>)}
            </select>
          </div>

          {hasInput && state.error ? (
            <p className="text-xs text-red-600">{state.error}</p>
          ) : previewValue ? (
            <p className="text-sm text-zinc-500">
              {isConsume ? "Останется: " : "Станет: "}
              <span className="font-semibold tabular-nums text-zinc-900">{previewValue}</span>
              {state.willEmpty ? <span className="ml-1 text-rose-500">(закончится)</span> : null}
            </p>
          ) : null}

          {feedback ? <p className="text-xs text-red-600">{feedback}</p> : null}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white transition-all hover:bg-zinc-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Сохраняем..." : isConsume ? "Списать" : "Пополнить"}
            </button>
            <button
              type="button"
              onClick={closeSheet}
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-50"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  return (
    <>
      {renderTrigger ? renderTrigger(openSheet) : (
        <button
          type="button"
          onClick={openSheet}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
        >
          Изменить
        </button>
      )}
      {sheet && mounted ? createPortal(sheet, document.body) : null}
    </>
  );
}
