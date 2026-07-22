"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Dialog, DialogCloseButton, DialogFooter, DialogHeader, useToast } from "@nb/ui";

import { NumericInput } from "@/components/shared/numeric-input";
import { parseDecimalInput } from "@/features/forms/numeric-validation";
import { formatInventoryUnitLabel, type InventoryUnit } from "@/features/inventory/units";
import { transferCheckedToStockAction } from "@/features/shopping/actions";
import type { ShoppingListGroupDto, ShoppingManualItemDto } from "@/features/shopping/contracts";

// Строка, которую реально можно перенести на склад: отмечена И имеет
// каталожную/кастомную привязку (CHECK user_ingredients_source_linkage_chk не
// пропустит name-only позицию). `key` — стабильный идентификатор и React-key,
// и ключ записи в стейте количеств.
type TransferableRow = {
  key: string;
  name: string;
  unit: InventoryUnit;
  defaultQuantity: number;
} & (
  | { kind: "derived"; lineKey: string }
  | { kind: "manual"; id: string }
);

type UnresolvedRow = {
  key: string;
  name: string;
  addToStockHref: string | null;
};

export const deriveRows = (
  groups: ShoppingListGroupDto[],
  manualItems: ShoppingManualItemDto[]
): { transferable: TransferableRow[]; unresolved: UnresolvedRow[] } => {
  const transferable: TransferableRow[] = [];
  const unresolved: UnresolvedRow[] = [];

  for (const group of groups) {
    for (const line of group.items) {
      if (!line.checked) {
        continue;
      }
      if (line.hasStockLinkage) {
        transferable.push({
          key: `derived:${line.key}`,
          kind: "derived",
          lineKey: line.key,
          name: line.ingredientDisplayName,
          // Производные строки §3.2 всегда несут количество+единицу (в отличие
          // от §3.3-возможностей) — quantityToBuy/unit никогда не null здесь.
          unit: line.unit,
          // П4: при наличии предложенной фасовки предзаполняем фасовочным
          // итогом (totalQuantity уже в единице line.unit — так гарантирует
          // контракт resolvePackSuggestion), иначе — расчётной нехваткой.
          defaultQuantity: line.packSuggestion?.totalQuantity ?? line.quantityToBuy
        });
      } else {
        unresolved.push({
          key: `derived:${line.key}`,
          name: line.ingredientDisplayName,
          addToStockHref: line.addToStockHref
        });
      }
    }
  }

  for (const item of manualItems) {
    if (!item.checked) {
      continue;
    }
    // ⚠ Ручная позиция может быть привязана к каталогу/своему ингредиенту, но
    // остаться БЕЗ количества (в П1 quantity/unit у ручной позиции — опциональная
    // пара, независимая от привязки). Предзаполнить нечем и единицу выбрать
    // здесь негде (в диалоге — только количество, единица — подпись) — такую
    // позицию тоже уводим в хвост «Добавьте вручную», где есть её deeplink.
    if (item.hasStockLinkage && item.quantity != null && item.unit != null) {
      transferable.push({
        key: `manual:${item.id}`,
        kind: "manual",
        id: item.id,
        name: item.name,
        unit: item.unit,
        defaultQuantity: item.quantity
      });
    } else {
      unresolved.push({
        key: `manual:${item.id}`,
        name: item.name,
        addToStockHref: item.addToStockHref
      });
    }
  }

  return { transferable, unresolved };
};

export function TransferLineRow({
  row,
  value,
  onChange
}: {
  row: TransferableRow;
  value: string;
  onChange: (value: string) => void;
}) {
  const parsedQuantity = parseDecimalInput(value);
  const unitLabel = formatInventoryUnitLabel(
    row.unit,
    parsedQuantity != null && Number.isFinite(parsedQuantity) ? parsedQuantity : row.defaultQuantity
  );

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{row.name}</span>
      <span className="flex shrink-0 items-center gap-2">
        <NumericInput
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-right text-sm tabular-nums transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label={`Количество: ${row.name}`}
        />
        <span className="w-10 shrink-0 text-sm text-muted-foreground">{unitLabel}</span>
      </span>
    </li>
  );
}

export function UnresolvedLineRow({ row }: { row: UnresolvedRow }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0 truncate text-sm text-foreground">{row.name}</span>
      {row.addToStockHref ? (
        <Link
          href={row.addToStockHref}
          className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Добавить свой
        </Link>
      ) : null}
    </li>
  );
}

const isValidQuantity = (value: string) => {
  const parsed = parseDecimalInput(value);
  return parsed != null && Number.isFinite(parsed) && parsed > 0;
};

/**
 * Диалог «Пополнить склад» (П2): предпросмотр отмеченных строк с
 * редактируемым количеством (предзаполнено фасовочным итогом при наличии
 * предложения П4, иначе — фактической нехваткой/количеством ручной позиции —
 * купил больше/меньше, поправил тут) + хвост «Добавьте вручную» для строк без
 * привязки. Подтверждение — один server action (transferCheckedToStockAction),
 * сервер сам решает, что реально переносимо (не доверяет присланной привязке).
 */
export function TransferDialog({
  open,
  onOpenChange,
  groups,
  manualItems
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: ShoppingListGroupDto[];
  manualItems: ShoppingManualItemDto[];
}) {
  const router = useRouter();
  const { show } = useToast();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { transferable, unresolved } = deriveRows(groups, manualItems);

  // Сброс количеств при каждом открытии — иначе повторное открытие диалога
  // (отметил ещё строк, снова нажал «Пополнить склад») показало бы протухшие
  // значения от предыдущего открытия.
  useEffect(() => {
    if (!open) {
      return;
    }

    setSubmitError(null);
    setQuantities(
      Object.fromEntries(transferable.map((row) => [row.key, String(row.defaultQuantity)]))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const allQuantitiesValid = transferable.every((row) => isValidQuantity(quantities[row.key] ?? ""));
  const confirmDisabled = isPending || transferable.length === 0 || !allQuantitiesValid;

  const submit = () => {
    if (confirmDisabled) {
      return;
    }

    setSubmitError(null);
    startTransition(async () => {
      const lines = transferable.map((row) => {
        const quantity = Number(parseDecimalInput(quantities[row.key] ?? ""));
        return row.kind === "derived"
          ? { kind: "derived" as const, lineKey: row.lineKey, quantity, unit: row.unit }
          : { kind: "manual" as const, id: row.id, quantity, unit: row.unit };
      });

      const result = await transferCheckedToStockAction({ lines });

      if (!result.ok) {
        setSubmitError(result.message);
        return;
      }

      onOpenChange(false);
      show({
        title: result.message,
        tone: "success",
        description: result.skippedCount > 0
          ? `Не перенесено: ${result.skippedCount} — отметки устарели.`
          : undefined,
        action: { label: "Запасы", onClick: () => router.push("/app/ingredients") }
      });
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Пополнить склад" hideTitle size="lg">
      <DialogHeader>
        <h3 className="text-base font-semibold text-foreground">Пополнить склад</h3>
        <DialogCloseButton />
      </DialogHeader>

      <div className="space-y-4 p-5">
        {transferable.length > 0 ? (
          <ul className="divide-y divide-border">
            {transferable.map((row) => (
              <TransferLineRow
                key={row.key}
                row={row}
                value={quantities[row.key] ?? ""}
                onChange={(value) => setQuantities((current) => ({ ...current, [row.key]: value }))}
              />
            ))}
          </ul>
        ) : null}

        {unresolved.length > 0 ? (
          <div className={transferable.length > 0 ? "border-t border-border pt-3" : ""}>
            <p className="text-xs font-medium text-muted-foreground">Добавьте вручную:</p>
            <ul className="mt-1 divide-y divide-border">
              {unresolved.map((row) => (
                <UnresolvedLineRow key={row.key} row={row} />
              ))}
            </ul>
          </div>
        ) : null}

        {submitError ? (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
          Отмена
        </Button>
        {transferable.length > 0 ? (
          <Button type="button" variant="primary" onClick={submit} disabled={confirmDisabled}>
            Добавить ({transferable.length})
          </Button>
        ) : null}
      </DialogFooter>
    </Dialog>
  );
}
