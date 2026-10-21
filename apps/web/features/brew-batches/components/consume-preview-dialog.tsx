"use client";

// =============================================================================
//  features/brew-batches/components/consume-preview-dialog.tsx
//  Предпросмотр списания со склада на партию (Ф2/Ф4) — единственная точка
//  списания на странице партии: точное совпадение по позиции склада vs
//  кандидаты на замену той же match-group (см. отчёт серверного исполнителя —
//  previewBrewBatchInventoryAction/consumeBrewBatchInventoryAction). Замена —
//  всегда opt-in (чекбокс снят по умолчанию), кроме дрожжей, которым замен не
//  бывает вовсе (exact_only).
//
//  Списание ВСЕГДА частичное (Ф4, allowPartial: true) — короткие строки
//  клампятся до остатка, строки вовсе без позиции на складе (missing и
//  substitute_available без отмеченной замены) пропускаются, ничего не блокируя:
//  владелец жаловался, что нехватка одной позиции (рисовая лузга не забита на
//  складе) не давала списать вообще ничего. Пропущенные строки видны прямо в
//  превью («будет пропущено») и фиксируются сервером в результате
//  (skippedLineCount/skippedLineNames) — сообщение после списания честно
//  называет и клампнутые, и пропущенные строки.
// =============================================================================
import React, { useEffect, useRef, useState } from "react";
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
import { formatInventoryQuantityInputValue } from "@/features/inventory/display";
import { formatInventoryUnitLabel } from "@/features/inventory/units";
import { planInventoryLotUse } from "@/features/inventory/lot-plan";

export type ConsumeDialogResult = { ok: boolean; message: string };

export type SubstitutionSelection = { checked: boolean; inventoryItemId: string };
export type SubstitutionSelections = Record<string, SubstitutionSelection>;

/** Распределяем один остаток между внесениями, не обещая его каждой строке заново. */
export const estimateConsumption = (lines: BrewBatchConsumePlanLine[], selections: SubstitutionSelections) => {
  const remaining = new Map<string, number>();
  const quantities = new Map<string, number>();
  for (const line of lines) {
    const selection = selections[line.recipeIngredientId];
    const candidate = selection?.checked
      ? line.substitutes.find((item) => item.inventoryItemId === selection.inventoryItemId)
      : line.exact;
    if (!candidate) continue;
    const lots = !selection?.checked && line.exactLots?.length ? line.exactLots : [candidate];
    const { takes } = planInventoryLotUse(line.requiredQuantityNormalized, lots, remaining);
    const quantity = takes.reduce((sum, take) => sum + take.quantity, 0);
    quantities.set(line.recipeIngredientId, quantity);
  }
  return quantities;
};

// Строка предлагает замену (чекбокс + опционально select), когда она либо
// substitute_available (нет точного совпадения вовсе), либо exact_short с
// exactClamps=false (короткий exact, который сервер иначе уронит целиком).
const lineOffersSubstitution = (line: BrewBatchConsumePlanLine): boolean => (
  line.kind === "substitute_available" || ((line.kind === "exact_short" || line.kind === "exact") && !line.exactClamps)
);

// Небольшой эпсилон на округления количеств (то же значение, что и на сервере,
// см. features/brew-batches/inventory.ts: CONSUME_EPSILON).
const OVERBOOK_EPSILON = 0.000001;

export type OverbookedInventoryItem = {
  inventoryItemId: string;
  name: string;
  demandNormalized: number;
  availableQuantity: number;
};

/**
 * Диагностика общего дефицита одной позиции склада — ловит, когда
 * НЕСКОЛЬКО строк рецепта ссылаются на одну и ту же складскую позицию, и сумма
 * их клампованных потребностей превышает остаток этой позиции. Спрос каждой
 * строки берётся клампованным остатком ЭТОЙ ЖЕ позиции (Math.min(required,
 * available)), а не полной потребностью рецепта — списание всегда частичное
 * (Ф4), сервер сам ужимает короткую строку до остатка. Если бы гард считал
 * спрос полным, одиночная короткая строка без замены (на складе меньше нужного)
 * сама себя объявляла бы конфликтом нескольких внесений. Presence-based строки
 * (exactClamps=true, дрожжи) в гард не входят — у них кламп легален и единицы
 * могут не совпадать с граммами. Предупреждение не блокирует частичное списание;
 * сервер атомарно распределяет остаток в порядке внесений.
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
        // Клампуем спрос остатком кандидата — иначе строка с одной лишь короткой
        // заменой сама себя объявляла бы overbooked (см. JSDoc выше).
        addDemand(
          candidate.inventoryItemId,
          candidate.name,
          candidate.availableQuantity,
          Math.min(line.requiredQuantityNormalized, candidate.availableQuantity)
        );
      }
      continue;
    }

    if ((line.kind === "exact" || line.kind === "exact_short") && line.exact) {
      // Клампуем спрос остатком exact-позиции: короткая строка (exact_short) сама
      // по себе легальна (сервер её ужмёт, allowPartial всегда true) — overbooked
      // здесь должно ловить только сумму НЕСКОЛЬКИХ строк на одну позицию.
      addDemand(
        line.exact.inventoryItemId,
        line.exact.name,
        line.exact.availableQuantity,
        Math.min(line.requiredQuantityNormalized, line.exact.availableQuantity)
      );
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
  const [loadRetry, setLoadRetry] = useState(0);
  const inFlight = useRef(false);

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
        setLoadError(result.message || "Не удалось подготовить список ингредиентов для списания.");
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
    }).catch(() => {
      if (cancelled) return;
      setLoadError("Не удалось загрузить остатки. Проверьте соединение и повторите загрузку.");
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, brewBatchId, loadRetry]);

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

  const consumption = plan ? estimateConsumption(plan.lines, selections) : new Map<string, number>();
  const selectedCount = [...consumption.values()].filter((quantity) => quantity > 0).length;

  const overbookedItems = plan ? computeOverbookedInventoryItems(plan.lines, selections) : [];
  const confirmDisabled = submitting
    || selectedCount === 0;

  const confirm = async () => {
    if (!plan || inFlight.current || submitting || confirmDisabled) return;
    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const substitutions: BrewBatchConsumeSubstitution[] = Object.entries(selections)
        .filter(([, selection]) => selection.checked)
        .map(([recipeIngredientId, selection]) => ({ recipeIngredientId, inventoryItemId: selection.inventoryItemId }));
      // Ф4: списание всегда частичное — короткие строки клампятся, строки без
      // позиции на складе пропускаются, ничего не блокируя (см. шапку файла).
      const result = await consumeBrewBatchInventoryAction(brewBatchId, substitutions, { allowPartial: true });
      if (!result.ok) {
        setSubmitError(result.message);
        return;
      }
      onConsumed(result);
      onOpenChange(false);
    } catch {
      setSubmitError("Не удалось выполнить операцию.");
    } finally {
      inFlight.current = false;
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
      guard={{ isDirty: () => submitting, onGuardedClose: () => {} }}
    >
      <DialogHeader>
        <h3 className="text-base font-semibold text-foreground">Списать со склада</h3>
        <DialogCloseButton disabled={submitting} />
      </DialogHeader>

      <div className="space-y-3 p-5">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Считаем…
          </div>
        ) : loadError ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">{loadError}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setLoadRetry((value) => value + 1)}>Повторить загрузку</Button>
          </div>
        ) : plan?.alreadyConsumed ? (
          <p className="text-sm text-muted-foreground">По этой партии уже списано.</p>
        ) : plan ? (
          <ul className="divide-y divide-border">
            {plan.lines.map((line) => (
              <ConsumeLineRow
                key={line.recipeIngredientId}
                line={line}
                actualQuantity={consumption.get(line.recipeIngredientId)}
                selection={selections[line.recipeIngredientId]}
                onToggle={() => toggleSubstitution(line.recipeIngredientId)}
                onChooseCandidate={(inventoryItemId) => chooseCandidate(line.recipeIngredientId, inventoryItemId)}
              />
            ))}
          </ul>
        ) : null}

        {plan && !plan.alreadyConsumed && overbookedItems.length > 0 ? (
          <p role="status" className="rounded-lg bg-warning-subtle p-3 text-sm text-warning-subtle-foreground">
            На {overbookedItems.map((item) => `«${item.name}»`).join(", ")} не хватит на все внесения. Спишем только имеющийся остаток по порядку внесений; недостающую часть пропустим. Остальные ингредиенты спишутся как обычно.
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
            Списать {selectedCount} {pluralize(selectedCount, ["позицию", "позиции", "позиций"])}
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
  onChooseCandidate,
  actualQuantity
}: {
  line: BrewBatchConsumePlanLine;
  actualQuantity?: number;
  selection: SubstitutionSelection | undefined;
  onToggle: () => void;
  onChooseCandidate: (inventoryItemId: string) => void;
}) {
  const partial = actualQuantity != null && actualQuantity + 0.000001 < line.requiredQuantityNormalized;
  const amountLabel = partial ? `${formatInventoryQuantityInputValue(actualQuantity!, line.normalizedUnit)} ${formatInventoryUnitLabel(line.normalizedUnit ?? "g", actualQuantity!)}` : line.requiredLabel;
  const deductionLabel = actualQuantity === 0 ? "Пропустим" : `−${amountLabel}`;
  const partialHint = partial ? <p className="w-full text-xs text-warning-subtle-foreground">Нужно {line.requiredLabel}; спишем {amountLabel}. Недостающую часть пропустим.</p> : null;
  if (line.kind === "exact") {
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
          <Check className={`h-4 w-4 shrink-0 ${partial ? "text-warning" : "text-success"}`} aria-hidden />
          <span className="truncate">{line.displayName}</span>
        </span>
        <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">{deductionLabel}</span>
        {line.exactLots && line.exactLots.length > 1 ? <p className="w-full pl-6 text-xs text-muted-foreground">Запас в {line.exactLots.length} партиях закупки.</p> : null}
        {partialHint}
        {(partial || selection?.checked) && !line.exactClamps && line.substitutes.length > 0 ? (
          <div className="w-full space-y-2">
            <SubstitutionFields line={line} selection={selection} onToggle={onToggle} onChooseCandidate={onChooseCandidate} showCandidateName />
          </div>
        ) : null}
      </li>
    );
  }

  if (line.kind === "exact_short") {
    // Списание всегда частичное (Ф4) — короткий exact клампится до остатка
    // независимо от exactClamps (это поле теперь только про presence-based
    // категорию — дрожжам замена недоступна вовсе, см. lineOffersSubstitution).
    // Замену не-presence-based строке всё равно можно выбрать вместо клампа.
    const offersSubstitution = !line.exactClamps && line.substitutes.length > 0;
    return (
      <li className="space-y-2 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
            <Check className="h-4 w-4 shrink-0 text-warning" aria-hidden />
            <span className="truncate">{line.displayName}</span>
          </span>
          <span className="shrink-0 text-sm font-medium tabular-nums text-warning">{deductionLabel}</span>
          {line.exact && !selection?.checked ? (
            <p className="w-full pl-6 text-xs text-muted-foreground">
              В партии закупки {line.exact.availableLabel}; остаток распределяется между внесениями.
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
        {partialHint}
      </li>
    );
  }

  if (line.kind === "substitute_available") {
    return (
      <li className="space-y-2 py-2.5">
        <SubstitutionHeader line={line} selection={selection} deductionLabel={deductionLabel} />
        <SubstitutionFields line={line} selection={selection} onToggle={onToggle} onChooseCandidate={onChooseCandidate} />
        {partialHint}
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
        <span className="shrink-0 text-xs text-muted-foreground">Нет на складе — будет пропущено</span>
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
  selection,
  deductionLabel
}: {
  line: BrewBatchConsumePlanLine;
  selection: SubstitutionSelection | undefined;
  deductionLabel: string;
}) {
  const candidateId = selection?.inventoryItemId ?? line.substitutes[0]?.inventoryItemId;
  const candidate = line.substitutes.find((item) => item.inventoryItemId === candidateId) ?? line.substitutes[0];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <ArrowLeftRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{candidate?.name}</span>
      </span>
      <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">{selection?.checked ? deductionLabel : `Нужно ${line.requiredLabel}`}</span>
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
