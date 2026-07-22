import React from "react";
import Link from "next/link";
import {
  ChevronRight,
  CircleCheck,
  Droplets,
  FlaskConical,
  Hop,
  Package,
  PackageSearch,
  Plus,
  Wheat
} from "lucide-react";

import type {
  ShoppingListDto,
  ShoppingListGroupDto,
  ShoppingOpportunityDto,
  ShoppingListSourceBrew
} from "@/features/shopping/contracts";
import { pluralize } from "@/lib/pluralize";
import { RecipeThumb, StyleChip } from "@/components/recipes/recipe-card-parts";
import { BuySectionHeader } from "./buy-section-header";
import { GroupHeader } from "./group-header";
import { ManualItemForm } from "./manual-item-form";
import { ManualItemsGroup } from "./manual-items-group";
import { ShoppingLineRow } from "./shopping-line-row";

// «12 июля» — формат даты запланированной варки в строке источника.
const plannedForFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

type GroupMeta = { icon: React.ComponentType<{ className?: string }>; color: string; bg: string };

const groupMeta: Record<ShoppingListGroupDto["category"], GroupMeta> = {
  fermentable: { icon: Wheat, color: "text-amber-500 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/15" },
  hop: { icon: Hop, color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/15" },
  yeast: { icon: FlaskConical, color: "text-violet-500 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-500/15" },
  water_treatment: { icon: Droplets, color: "text-sky-500 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-500/15" },
  consumable: { icon: Package, color: "text-orange-500 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-500/15" },
  other: { icon: Package, color: "text-muted-foreground", bg: "bg-muted" }
};

// Строка ингредиента внутри блока «Добавить на склад» — вынесена в
// shopping-line-row.tsx (П2: чекбокс «куплено» требует клиентского компонента
// с собственным оптимистичным стейтом).
function ShoppingGroup({ group }: { group: ShoppingListGroupDto }) {
  const meta = groupMeta[group.category];

  return (
    <section>
      <GroupHeader
        icon={meta.icon}
        iconColorClassName={meta.color}
        iconBgClassName={meta.bg}
        label={group.label}
        count={group.items.length}
      />
      <ul className="mt-1 divide-y divide-border">
        {group.items.map((line) => (
          <ShoppingLineRow key={line.key} line={line} />
        ))}
      </ul>
    </section>
  );
}

// Строки партий-источников вверху блока «Добавить на склад»: имя · дата →
// сколько не хватает по этой партии. Каждая строка — ссылка на страницу партии;
// это и есть ответ «откуда взялся список».
function SourceBrewRows({ plannedBrews }: { plannedBrews: ShoppingListSourceBrew[] }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">Для запланированных партий:</p>
      <ul className="mt-1">
        {plannedBrews.map((brew) => (
          <li key={brew.brewBatchId}>
            <Link
              href={`/app/brew-batches/${brew.brewBatchId}`}
              className="group flex items-baseline justify-between gap-3 py-1.5"
            >
              <span className="min-w-0 truncate text-[15px] font-medium text-foreground group-hover:text-muted-foreground">
                {brew.brewName}
                {brew.plannedFor ? (
                  <span className="font-normal text-muted-foreground"> · {plannedForFormatter.format(brew.plannedFor)}</span>
                ) : null}
              </span>
              {brew.missingCount > 0 ? (
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {brew.missingCount} {pluralize(brew.missingCount, ["позиция", "позиции", "позиций"])}
                </span>
              ) : (
                <span className="shrink-0 text-sm text-success">всё есть</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Блок «Добавить на склад» — единая карточка секции: сверху партии-источники,
 * ниже ингредиенты по категориям плотным списком, в конце — группа «Своё»
 * (П1). Лексика складская, не магазинная: раздел говорит «этих позиций не
 * хватает на складе под партию X», а покупка — лишь один из способов их туда
 * добавить. При all_in_stock вместо списка — компактная success-строка (сами
 * партии выше остаются ссылками); группа «Своё» показывается всегда, когда
 * блок рендерится — это единственный вход в добавление ручной позиции.
 *
 * Блок теперь рендерится и без запланированных партий (см. showBuySection в
 * ShoppingListView) — в этом случае здесь нет ни партий-источников, ни
 * категорийных групп (обе завязаны на plannedBatches), только «Своё».
 */
function BuySection({ list }: { list: ShoppingListDto }) {
  const allInStock = list.emptyReason === "all_in_stock";
  const hasBrews = list.plannedBrews.length > 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <BuySectionHeader groups={list.groups} manualItems={list.manualItems} checkedCount={list.checkedCount} />
      {hasBrews ? (
        <>
          <div className="mt-3">
            <SourceBrewRows plannedBrews={list.plannedBrews} />
          </div>
          <div className="mt-4 border-t border-border pt-4">
            {allInStock ? (
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
                Всё нужное уже на складе.
              </p>
            ) : (
              <div className="space-y-5">
                {list.groups.map((group) => (
                  <ShoppingGroup key={group.category} group={group} />
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
      <div className={hasBrews ? "mt-5 border-t border-border pt-4" : "mt-3"}>
        <ManualItemsGroup items={list.manualItems} />
      </div>
    </section>
  );
}

// Строка одной нехватки внутри карточки «Почти хватает на:» — имя (ссылка на
// каталог) → количество → «На склад». Карточка ниже — stretched-link на
// рецепт, поэтому интерактивные элементы поднимаются над ней тем же приёмом,
// что StyleChip/BrewFromStockButton (`pointer-events-auto` + `relative z-10`).
function OpportunityLineRow({ line }: { line: ShoppingOpportunityDto["lines"][number] }) {
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      {line.catalogHref ? (
        <Link
          href={line.catalogHref}
          className="pointer-events-auto relative z-10 min-w-0 truncate font-medium text-foreground transition-colors hover:text-muted-foreground"
        >
          {line.ingredientDisplayName}
        </Link>
      ) : (
        <span className="min-w-0 truncate font-medium text-foreground">{line.ingredientDisplayName}</span>
      )}
      <span className="flex shrink-0 items-center gap-2">
        {line.quantityLabel ? <span className="tabular-nums text-muted-foreground">{line.quantityLabel}</span> : null}
        {line.addToStockHref ? (
          <Link
            href={line.addToStockHref}
            className="pointer-events-auto relative z-10 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            <Plus className="h-3 w-3" />
            На склад
          </Link>
        ) : null}
      </span>
    </li>
  );
}

// Всегда видимых строк нехваток в карточке — две: карточки в гриде остаются
// одного размера, остальные строки раскрываются стрелочкой по месту.
const OPPORTUNITY_VISIBLE_LINES = 2;

/**
 * Карточка рецепта-возможности («Почти хватает на:») — в визуальном языке
 * `BrewableRecipeCard` (`components/recipes/brewable-recipes-section.tsx`):
 * обложка 64px (фото → фото BJCP-стиля → заливка по SRM) + чип стиля + название
 * сверху; снизу блок нехваток `rounded-xl bg-muted` с меткой «Не хватает».
 * Stretched-link ведёт на рецепт (`recipeHref`); контент — `pointer-events-none`,
 * интерактивные элементы внутри подняты `pointer-events-auto` + `z-10`.
 */
function OpportunityCard({ opportunity }: { opportunity: ShoppingOpportunityDto }) {
  const style =
    opportunity.styleCode && opportunity.styleName
      ? { code: opportunity.styleCode, name: opportunity.styleName }
      : null;
  const visibleLines = opportunity.lines.slice(0, OPPORTUNITY_VISIBLE_LINES);
  const hiddenLines = opportunity.lines.slice(OPPORTUNITY_VISIBLE_LINES);

  return (
    <article className="group relative h-full overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-border hover:shadow-md">
      <Link
        href={opportunity.recipeHref}
        aria-label={opportunity.title}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />

      <div className="pointer-events-none flex h-full flex-col gap-3">
        <div className="flex items-start gap-3">
          <RecipeThumb
            heroImage={opportunity.heroImage}
            styleImageUrl={opportunity.styleImageUrl}
            colorSrm={opportunity.colorSrm}
            showColorMarker={false}
            className="h-16 w-16 shrink-0 rounded-xl ring-1 ring-inset ring-black/5"
            sizes="64px"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <StyleChip style={style} styleHref={opportunity.styleHref} />
            <h3 className="line-clamp-2 text-base font-semibold leading-snug text-foreground group-hover:text-muted-foreground">
              {opportunity.title}
            </h3>
          </div>
        </div>

        <div className="mt-auto rounded-xl bg-muted p-2.5">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Не хватает</p>
          <ul className="space-y-1.5">
            {visibleLines.map((line, index) => (
              <OpportunityLineRow key={`${opportunity.recipeId}-${index}`} line={line} />
            ))}
          </ul>
          {hiddenLines.length > 0 ? (
            <details className="group/lines mt-1.5">
              <summary className="pointer-events-auto relative z-10 flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 transition group-open/lines:rotate-90"
                  aria-hidden
                />
                Ещё {hiddenLines.length} {pluralize(hiddenLines.length, ["позиция", "позиции", "позиций"])}
              </summary>
              <ul className="mt-1.5 space-y-1.5">
                {hiddenLines.map((line, index) => (
                  <OpportunityLineRow key={`${opportunity.recipeId}-hidden-${index}`} line={line} />
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// Секция «Почти хватает на:» (§3.3): карточки-грид, развёрнутые видны сразу,
// свёрнутые (нехватка ≥3 или не влезли в кап) — под одним <details>.
function OpportunitiesSection({
  opportunities,
  collapsedOpportunityCount
}: {
  opportunities: ShoppingOpportunityDto[];
  collapsedOpportunityCount: number;
}) {
  const expanded = opportunities.filter((opportunity) => !opportunity.collapsed);
  const collapsed = opportunities.filter((opportunity) => opportunity.collapsed);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">Почти хватает на:</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {expanded.map((opportunity) => (
          <li key={opportunity.recipeId}>
            <OpportunityCard opportunity={opportunity} />
          </li>
        ))}
      </ul>
      {collapsed.length > 0 ? (
        <details className="group rounded-2xl border border-border bg-card p-4 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-90" aria-hidden />
            Ещё {collapsedOpportunityCount} {pluralize(collapsedOpportunityCount, ["рецепт", "рецепта", "рецептов"])}
          </summary>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {collapsed.map((opportunity) => (
              <li key={opportunity.recipeId}>
                <OpportunityCard opportunity={opportunity} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function EmptyState() {
  return (
    <section className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <PackageSearch className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Нехваток пока нет</h2>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
          Они считаются по запланированным партиям: выберите рецепт и запланируйте варку — здесь появится, чего не
          хватает на складе.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/app/recipes"
          className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          <FlaskConical className="h-4 w-4" />
          К рецептам
        </Link>
        <Link
          href="/app/brew-batches"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-border hover:bg-muted"
        >
          Мои партии
        </Link>
        <ManualItemForm variant="emptyState" />
      </div>
    </section>
  );
}

// Заголовок и табы раздела рендерит страница (app/(app)/app/shopping/content.tsx):
// «Чего не хватает» — таб «Моего склада», у view своего H1 нет.
export function ShoppingListView({ list }: { list: ShoppingListDto }) {
  const brewCount = list.plannedBrews.length;
  const hasManualItems = list.manualItems.length > 0;
  const hasOpportunities = list.opportunities.length > 0;
  // П1: блок «Добавить на склад» рендерится и без партий, если есть ручные
  // позиции — «Своё» не обязано ждать запланированную варку.
  const showBuySection = brewCount > 0 || hasManualItems;
  // Компактный сценарий §3.4: возможности есть, а запланированных партий нет —
  // блока «Добавить на склад» нет (ему неоткуда взяться), вместо него подводка.
  const showRecipesTeaser = list.emptyReason === null && brewCount === 0 && hasOpportunities;

  if (list.emptyReason === "nothing_to_do") {
    return <EmptyState />;
  }

  return (
    <div className="space-y-8">
      {showBuySection ? <BuySection list={list} /> : null}

      {hasOpportunities ? (
        <OpportunitiesSection opportunities={list.opportunities} collapsedOpportunityCount={list.collapsedOpportunityCount} />
      ) : null}

      {showRecipesTeaser ? (
        <Link
          href="/app/recipes"
          className="block text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Запланируйте варку — соберём точный список
        </Link>
      ) : null}
    </div>
  );
}
