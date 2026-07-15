"use client";

// =============================================================================
//  features/brew-batches/components/consume-preview-dialog.tsx
//  Предпросмотр списания со склада на партию (Ф2): точное совпадение по
//  позиции склада vs кандидаты на замену той же match-group (см. отчёт
//  серверного исполнителя — previewBrewBatchInventoryAction/
//  consumeBrewBatchInventoryAction). Замена — всегда opt-in (чекбокс снят по
//  умолчанию), кроме дрожжей, которым замен не бывает вовсе (exact_only).
//
//  exact_short делится по exactClamps (см. contracts.ts, тот же предикат, что
//  и у consumeRecipeInventoryAllocations): true — кламп легален (спишем
//  остаток), false — сервер уронит ВСЮ транзакцию INSUFFICIENT_STOCK, поэтому
//  такой строке ОБЯЗАНА быть доступна та же замена, что и substitute_available
//  (см. ConsumeLineRow), а подтверждение блокируется, пока строка не разрешена
//  (getBlockingShortLines).
// =============================================================================
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Check, Loader2, X } from "lucide-react";

import { Button, Checkbox, Dialog, DialogCloseButton, DialogFooter, DialogHeader, Select } from "@nb/ui";
import {
  consumeBrewBatchInventoryAction,
  previewBrewBatchInventoryAction
} from "@/app/(app)/app/brew-batches/[id]/actions";
import type {
  BrewBatchConsumePlan,
  BrewBatchConsumePlanLine,
  BrewBatchConsumeSubstitution
} from "@/features/brew-batches/contracts";
import { pluralize } from "@/lib/pluralize";

export type ConsumeDialogResult = { ok: boolean; message: string };

export type SubstitutionSelection = { checked: boolean; inventoryItemId: string };
export type SubstitutionSelections = Record<string, SubstitutionSelection>;

// Строка предлагает замену (чекбокс + опционально select), когда она либо
// substitute_available (нет точного совпадения вовсе), либо exact_short с
// exactClamps=false (короткий exact, который сервер иначе уронит целиком).
const lineOffersSubstitution = (line: BrewBatchConsumePlanLine): boolean => (
  line.kind === "substitute_available" || (line.kind === "exact_short" && !line.exactClamps)
);

// Небольшой эпсилон на округления количеств (то же значение, что и на сервере,
// см. features/brew-batches/inventory.ts: CONSUME_EPSILON).
const OVERBOOK_EPSILON = 0.000001;

/**
 * Ф1: строки exact_short с exactClamps=false БЕЗ отмеченной замены — список
 * блокирует подтверждение (сервер всё равно уронит всю транзакцию
 * INSUFFICIENT_STOCK, честнее не пускать до сабмита вовсе).
 */
export const getBlockingShortLines = (
  lines: BrewBatchConsumePlanLine[],
  selections: SubstitutionSelections
): BrewBatchConsumePlanLine[] => (
  lines.filter((line) => (
    line.kind === "exact_short"
    && !line.exactClamps
    && !(selections[line.recipeIngredientId]?.checked ?? false)
  ))
);

export type OverbookedInventoryItem = {
  inventoryItemId: string;
  name: string;
  demandNormalized: number;
  availableQuantity: number;
};

/**
 * Ф3: гард двойного бронирования одной позиции склада. Считает спрос по
 * inventoryItemId среди строк, которые РЕАЛЬНО спишутся при текущем выборе
 * (exact/exact_short-без-клампа — по exact.inventoryItemId; отмеченные замены —
 * по выбранному кандидату), и сравнивает с остатком позиции. Presence-based
 * строки (exactClamps=true, дрожжи) в гард не входят — у них кламп легален и
 * единицы могут не совпадать с граммами. Чистая функция — тестируется без DOM,
 * сервер остаётся атомарным бэкстопом (изменений на сервере под этот гард не
 * требуется).
 */
export const computeOverbookedInventoryItems = (
  lines: BrewBatchConsumePlanLine[],
  selections: SubstitutionSelections
): OverbookedInventoryItem[] => {
  const demandByItem = new Map<string, { name: string; demand: number; availableQuantity: number }>();

  const addDemand = (inventoryItemId: string, name: string, availableQuantity: number, amount: number) => {
    const current = demandByItem.get(inventoryItemId) ?? { name, demand: 0, availableQuantity };
    current.demand += amount;
    demandByItem.set(inventoryItemId, current);
  };

  for (const line of lines) {
    if (line.exactClamps) {
      continue;
    }

    const selection = selections[line.recipeIngredientId];
    if (selection?.checked) {
      const candidate = line.substitutes.find((item) => item.inventoryItemId === selection.inventoryItemId);
      if (candidate) {
        addDemand(candidate.inventoryItemId, candidate.name, candidate.availableQuantity, line.requiredQuantityNormalized);
      }
      continue;
    }

    if ((line.kind === "exact" || line.kind === "exact_short") && line.exact) {
      addDemand(line.exact.inventoryItemId, line.exact.name, line.exact.availableQuantity, line.requiredQuantityNormalized);
    }
    // substitute_available без отмеченной замены и missing — не спишутся, в спрос не входят.
  }

  const overbooked: OverbookedInventoryItem[] = [];
  for (const [inventoryItemId, entry] of demandByItem) {
    if (entry.demand > entry.availableQuantity + OVERBOOK_EPSILON) {
      overbooked.push({
        inventoryItemId,
        name: entry.name,
        demandNormalized: entry.demand,
        availableQuantity: entry.availableQuantity
      });
    }
  }
  return overbooked;
};

export function ConsumeInventoryDialog({
  open,
  brewBatchId,
  onOpenChange,
  onConsumed
}: {
  open: boolean;
  brewBatchId: string;
  onOpenChange: (open: boolean) => void;
  onConsumed: (result: ConsumeDialogResult) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [plan, setPlan] = useState<BrewBatchConsumePlan | null>(null);
  const [selections, setSelections] = useState<SubstitutionSelections>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSubmitError(null);
    setPlan(null);
    setSelections({});

    void previewBrewBatchInventoryAction(brewBatchId).then(async (result) => {
      if (cancelled) return;
      if (!result.ok || !result.plan) {
        setLoadError(result.message || "Не удалось построить предпросмотр списания.");
        setLoading(false);
        return;
      }
      // Партии без строк рецепта нечего показывать в предпросмотре — списание
      // (пустой результат) выполняется так же, как до Ф2, без экрана подтверждения.
      if (result.plan.lines.length === 0) {
        const consumeResult = await consumeBrewBatchInventoryAction(brewBatchId);
        if (cancelled) return;
        onConsumed(consumeResult);
        onOpenChange(false);
        return;
      }
      const initial: SubstitutionSelections = {};
      for (const line of result.plan.lines) {
        if (lineOffersSubstitution(line) && line.substitutes.length > 0) {
          initial[line.recipeIngredientId] = {
            checked: false,
            inventoryItemId: line.substitutes[0].inventoryItemId
          };
        }
      }
      setSelections(initial);
      setPlan(result.plan);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, brewBatchId]);

  const toggleSubstitution = (recipeIngredientId: string) => {
    setSelections((prev) => ({
      ...prev,
      [recipeIngredientId]: { ...prev[recipeIngredientId], checked: !prev[recipeIngredientId]?.checked }
    }));
  };

  const chooseCandidate = (recipeIngredientId: string, inventoryItemId: string) => {
    setSelections((prev) => ({
      ...prev,
      [recipeIngredientId]: { checked: prev[recipeIngredientId]?.checked ?? false, inventoryItemId }
    }));
  };

  // exact/exact_short — каждая такая строка спишется ровно один раз (сама собой
  // или через отмеченную замену), считаем их через exactCount и НЕ прибавляем
  // повторно за чекбокс. substitute_available без exact-подбора в exactCount не
  // входит вовсе — считаем только отмеченные.
  const checkedSubstituteOnlyCount = plan
    ? plan.lines.filter((line) => line.kind === "substitute_available" && selections[line.recipeIngredientId]?.checked).length
    : 0;
  const selectedCount = (plan?.exactCount ?? 0) + checkedSubstituteOnlyCount;

  const blockingShortLines = plan ? getBlockingShortLines(plan.lines, selections) : [];
  const overbookedItems = plan ? computeOverbookedInventoryItems(plan.lines, selections) : [];
  const confirmDisabled = submitting
    || selectedCount === 0
    || blockingShortLines.length > 0
    || overbookedItems.length > 0;

  const confirm = async () => {
    if (!plan || submitting || confirmDisabled) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const substitutions: BrewBatchConsumeSubstitution[] = Object.entries(selections)
        .filter(([, selection]) => selection.checked)
        .map(([recipeIngredientId, selection]) => ({ recipeIngredientId, inventoryItemId: selection.inventoryItemId }));
      const result = await consumeBrewBatchInventoryAction(brewBatchId, substitutions);
      if (!result.ok) {
        setSubmitError(result.message);
        return;
      }
      onConsumed(result);
      onOpenChange(false);
    } catch {
      setSubmitError("Не удалось выполнить операцию.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) {
          onOpenChange(false);
        }
      }}
      title="Списать со склада"
      hideTitle
      size="lg"
    >
      <DialogHeader>
        <h3 className="text-base font-semibold text-foreground">Списать со склада</h3>
        <DialogCloseButton />
      </DialogHeader>

      <div className="space-y-3 p-5">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Считаем…
          </div>
        ) : loadError ? (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        ) : plan?.alreadyConsumed ? (
          <p className="text-sm text-muted-foreground">По этой партии уже списано.</p>
        ) : plan ? (
          <ul className="divide-y divide-border">
            {plan.lines.map((line) => (
              <ConsumeLineRow
                key={line.recipeIngredientId}
                line={line}
                selection={selections[line.recipeIngredientId]}
                onToggle={() => toggleSubstitution(line.recipeIngredientId)}
                onChooseCandidate={(inventoryItemId) => chooseCandidate(line.recipeIngredientId, inventoryItemId)}
              />
            ))}
          </ul>
        ) : null}

        {plan && !plan.alreadyConsumed && blockingShortLines.length > 0 ? (
          <p role="alert" className="text-sm text-destructive">
            Не хватает: {blockingShortLines.map((line) => line.displayName).join(", ")} — пополните склад или выберите замену.
          </p>
        ) : null}

        {plan && !plan.alreadyConsumed && overbookedItems.length > 0 ? (
          <p role="alert" className="text-sm text-destructive">
            На {overbookedItems.map((item) => `«${item.name}»`).join(", ")} не хватит на все выбранные строки.
          </p>
        ) : null}

        {submitError ? (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
          Отмена
        </Button>
        {plan && !plan.alreadyConsumed ? (
          <Button type="button" onClick={() => void confirm()} disabled={confirmDisabled}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Списать {selectedCount} {pluralize(selectedCount, ["позиция", "позиции", "позиций"])}
          </Button>
        ) : null}
      </DialogFooter>
    </Dialog>
  );
}

// Экспортирован для юнит-теста: окружение тестов без DOM (vitest environment
// "node", без jsdom) не может провести реальный клик/эффект внутри Dialog
// (Radix Portal ничего не рендерит при renderToStaticMarkup вне зависимости от
// open) — рендер-контракт каждого вида строки проверяется на этом under-компоненте
// напрямую, без прогона через async-загрузку плана в родителе.
export function ConsumeLineRow({
  line,
  selection,
  onToggle,
  onChooseCandidate
}: {
  line: BrewBatchConsumePlanLine;
  selection: SubstitutionSelection | undefined;
  onToggle: () => void;
  onChooseCandidate: (inventoryItemId: string) => void;
}) {
  if (line.kind === "exact") {
    return (
      <li className="flex items-center justify-between gap-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
          <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
          <span className="truncate">{line.displayName}</span>
        </span>
        <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">−{line.requiredLabel}</span>
      </li>
    );
  }

  if (line.kind === "exact_short") {
    // exactClamps=true (дрожжи) — кламп легален, сервер спишет остаток; замены у
    // presence-based категорий не бывает вовсе. exactClamps=false — короткий exact
    // роняет ВСЮ транзакцию, строке ОБЯЗАНА быть доступна та же замена, что и
    // substitute_available (см. lineOffersSubstitution/getBlockingShortLines).
    const offersSubstitution = !line.exactClamps && line.substitutes.length > 0;
    return (
      <li className="space-y-2 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
            <Check className="h-4 w-4 shrink-0 text-warning" aria-hidden />
            <span className="truncate">{line.displayName}</span>
          </span>
          <span className="shrink-0 text-sm font-medium tabular-nums text-warning">−{line.requiredLabel}</span>
          {line.exact ? (
            <p className="w-full pl-6 text-xs text-muted-foreground">
              На складе {line.exact.availableLabel} — {line.exactClamps ? "спишем остаток." : "не хватит."}
            </p>
          ) : null}
        </div>
        {offersSubstitution ? (
          <SubstitutionFields
            line={line}
            selection={selection}
            onToggle={onToggle}
            onChooseCandidate={onChooseCandidate}
            showCandidateName
          />
        ) : null}
      </li>
    );
  }

  if (line.kind === "substitute_available") {
    return (
      <li className="space-y-2 py-2.5">
        <SubstitutionHeader line={line} selection={selection} />
        <SubstitutionFields line={line} selection={selection} onToggle={onToggle} onChooseCandidate={onChooseCandidate} />
      </li>
    );
  }

  // kind === "missing"
  return (
    <li className="space-y-1 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <X className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <span className="truncate">{line.displayName}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">Нет на складе</span>
      </div>
      <p className="pl-6 text-xs">
        {line.catalogSearchHref ? (
          <>
            <Link href={line.catalogSearchHref} className="font-medium text-primary underline-offset-2 hover:underline">
              Найти в каталоге
            </Link>
            {" · "}
          </>
        ) : null}
        <Link href="/app/shopping" className="font-medium text-primary underline-offset-2 hover:underline">
          Чего не хватает
        </Link>
      </p>
    </li>
  );
}

// Заголовок строки-замены (только у substitute_available — у exact_short его
// заменяет собственная шапка с исходным именем строки и требуемым количеством).
function SubstitutionHeader({
  line,
  selection
}: {
  line: BrewBatchConsumePlanLine;
  selection: SubstitutionSelection | undefined;
}) {
  const candidateId = selection?.inventoryItemId ?? line.substitutes[0]?.inventoryItemId;
  const candidate = line.substitutes.find((item) => item.inventoryItemId === candidateId) ?? line.substitutes[0];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <ArrowLeftRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{candidate?.name}</span>
      </span>
      <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">−{line.requiredLabel}</span>
    </div>
  );
}

// Общий блок «чекбокс замены + опциональный select кандидата» — переиспользуется
// substitute_available (нет точного совпадения вовсе) и exact_short с
// exactClamps=false (короткий exact, который сервер иначе уронит целиком).
function SubstitutionFields({
  line,
  selection,
  onToggle,
  onChooseCandidate,
  showCandidateName = false
}: {
  line: BrewBatchConsumePlanLine;
  selection: SubstitutionSelection | undefined;
  onToggle: () => void;
  onChooseCandidate: (inventoryItemId: string) => void;
  /** exact_short: имя кандидата ещё нигде не показано (в отличие от
   *  substitute_available, где его несёт SubstitutionHeader) — показываем тут. */
  showCandidateName?: boolean;
}) {
  const checked = selection?.checked ?? false;
  const candidateId = selection?.inventoryItemId ?? line.substitutes[0]?.inventoryItemId;
  const candidate = line.substitutes.find((item) => item.inventoryItemId === candidateId) ?? line.substitutes[0];
  return (
    <>
      {showCandidateName && candidate ? (
        <p className="pl-6 text-xs text-muted-foreground">
          Заменить на <span className="font-medium text-foreground">{candidate.name}</span>
        </p>
      ) : null}
      <label className="flex min-h-11 items-center gap-2 pl-6 text-sm text-foreground">
        <Checkbox checked={checked} onCheckedChange={onToggle} />
        вместо «{line.displayName}»
      </label>
      {candidate?.comparison ? <p className="pl-6 text-xs text-muted-foreground">{candidate.comparison}</p> : null}
      {line.substitutes.length > 1 ? (
        <div className="pl-6">
          <Select
            value={candidateId}
            onChange={(event) => onChooseCandidate(event.target.value)}
            disabled={!checked}
            aria-label={`Замена для «${line.displayName}»`}
            className="h-9 text-sm"
          >
            {line.substitutes.map((item) => (
              <option key={item.inventoryItemId} value={item.inventoryItemId}>
                {item.name}
                {item.isShort ? ` (${item.availableLabel})` : ""}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
    </>
  );
}
