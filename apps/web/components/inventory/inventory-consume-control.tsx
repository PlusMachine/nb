"use client";

import React, { useMemo, useState, useTransition } from "react";

import { Button, Dialog, DialogCloseButton } from "@nb/ui";
import { updateInventoryInlineAction } from "@/app/(app)/app/ingredients/actions";
import { NumericInput } from "@/components/shared/numeric-input";
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
      active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
    }`
  );

  const sheet = (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeSheet();
      }}
      title={`Изменить количество: ${primaryName}`}
      hideTitle
      size="md"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold text-foreground">
          {isConsume ? "Сколько использовали?" : "Сколько докупили?"}
        </h2>
        <DialogCloseButton />
      </div>

      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          <button type="button" onClick={() => switchDirection("consume")} className={segmentClassName(isConsume)}>
            − Списал
          </button>
          <button type="button" onClick={() => switchDirection("restock")} className={segmentClassName(!isConsume)}>
            + Докупил
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{primaryName}</span>
          {" · осталось "}
          <span className="tabular-nums">{remainingLabel}</span>
        </p>

        {(isConsume || context.packEquivalent) ? (
          <div className="flex flex-wrap gap-1.5">
            {context.packEquivalent ? (
              <button
                type="button"
                onClick={usePack}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted"
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
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted"
                  >
                    {fraction.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => fillFraction(1)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted"
                >
                  Всё
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <NumericInput
            min={0}
            step={getInventoryUnitInputStep(unit)}
            value={amount}
            autoFocus
            onChange={(event) => {
              setAmount(event.target.value);
              setFeedback(null);
            }}
            className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-base tabular-nums transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
            aria-label={isConsume ? "Количество использованного" : "Количество докупленного"}
            placeholder="0"
          />
          <select
            value={unit}
            onChange={(event) => {
              setUnit(event.target.value as InventoryUnit);
              setFeedback(null);
            }}
            className="rounded-xl border border-border bg-card py-2.5 pl-3 pr-8 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Единица измерения"
          >
            {context.allowedUnits.map((option) => <option key={option} value={option}>{getUnitLabel(option)}</option>)}
          </select>
        </div>

        {hasInput && state.error ? (
          <p role="alert" className="text-xs text-destructive">{state.error}</p>
        ) : previewValue ? (
          <p className="text-sm text-muted-foreground">
            {isConsume ? "Останется: " : "Станет: "}
            <span className="font-semibold tabular-nums text-foreground">{previewValue}</span>
            {state.willEmpty ? <span className="ml-1 text-destructive">(закончится)</span> : null}
          </p>
        ) : null}

        {feedback ? <p role="alert" className="text-xs text-destructive">{feedback}</p> : null}

        <div className="flex gap-2 pt-1">
          <Button type="submit" size="md" className="flex-1" disabled={!canSubmit}>
            {isPending ? "Сохраняем..." : isConsume ? "Списать" : "Пополнить"}
          </Button>
          <Button type="button" variant="outline" size="md" onClick={closeSheet}>
            Отмена
          </Button>
        </div>
      </form>
    </Dialog>
  );

  return (
    <>
      {renderTrigger ? renderTrigger(openSheet) : (
        <button
          type="button"
          onClick={openSheet}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted"
        >
          {defaultMode === "restock" ? "Пополнить" : "Списать"}
        </button>
      )}
      {sheet}
    </>
  );
}
