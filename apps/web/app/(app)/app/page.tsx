import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Calculator,
  CircleAlert,
  CircleCheck,
  Cpu,
  FlaskConical,
  Sparkles
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import { countRecipesForAuthor, countSavedRecipes, listAuthorRecipeCards } from "@/features/recipes/service";
import { findBrewableOwnRecipesForUser } from "@/features/recipes/match-service";
import { formatRelativeTimestamp } from "@/features/recipes/format";
import { getInventorySummaries } from "@/features/inventory/service";
import { inventoryPrimaryGroupLabels } from "@/features/inventory/page-model";
import type { InventorySummaryDto } from "@/features/inventory/contracts";
import { countBrewBatchesForUser, listActiveBrewBatchesForUser } from "@/features/brew-batches/service";
import {
  brewBatchStatusBadgeClass,
  brewBatchStatusLabels,
  type ActiveBrewProgressItem
} from "@/features/brew-batches/contracts";
import { isNewUserDashboard } from "@/features/dashboard/onboarding";
import {
  buildDashboardOnboarding,
  splitActiveBrews,
  type DashboardBrewCard,
  type DashboardOnboarding
} from "@/features/dashboard/overview";
import type { BrewNudge } from "@/features/brew-batches/dashboard";
import { listUserDevices } from "@/features/devices/service";
import type { DeviceDto } from "@/features/devices/contracts";
import { STREAM_PROVIDER_ID } from "@/features/brew-controller/contracts";
import { buildShoppingListForUser } from "@/features/shopping/service";
import type { ShoppingListDto } from "@/features/shopping/contracts";
import { listFavoriteCalculators } from "@/features/calculators/favorites-service";
import { OwnerRecipeCard } from "@/components/recipes/owner-recipe-card";
import { NewBrewButton } from "@/components/recipes/new-brew-button";
import { BrewableRecipeCard } from "@/components/recipes/brewable-recipes-section";
import { CalculatorCard } from "@/components/calculators/calculators-index";
import { CalculatorFavoritesProvider } from "@/components/calculators/calculator-favorites-provider";

// Цвет текста подсказки «следующего шага» по тону.
const nudgeToneClass: Record<BrewNudge["tone"], string> = {
  action: "text-foreground",
  warn: "text-warning-subtle-foreground",
  info: "text-muted-foreground"
};

// Лимиты виджетов: дашборд — сводка, а не полный список; хвост уводим ссылкой.
const ATTENTION_LIMIT = 6;
const PLANNED_LIMIT = 5;
const DEVICES_LIMIT = 3;
const RECENT_RECIPES_LIMIT = 3;
// «Рецепты под ваш склад» — тизер на 3 карточки; берём с запасом, чтобы после
// схлопывания клонов по названию осталось чем заполнить три места.
const BREWABLE_LIMIT = 3;
const BREWABLE_FETCH_LIMIT = 9;

const normalizeTitle = (title: string): string => title.trim().toLowerCase();

/** Оставляет по одному рецепту на название (первое вхождение — с лучшим матчем). */
function dedupeByTitle<T extends { title: string }>(recipes: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const recipe of recipes) {
    const key = normalizeTitle(recipe.title);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(recipe);
  }
  return result;
}

const plannedDateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

/** Русское склонение по числу: plural(3, ["замер", "замера", "замеров"]). */
const plural = (n: number, forms: [string, string, string]): string => {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) {
    return forms[2];
  }
  if (last === 1) {
    return forms[0];
  }
  if (last >= 2 && last <= 4) {
    return forms[1];
  }
  return forms[2];
};

const deviceProviderLabel = (providerId: string): string => {
  if (providerId.startsWith("brewforge")) {
    return providerId.includes("demo") ? "BrewForge · демо" : "BrewForge";
  }
  if (providerId.startsWith("rapt")) {
    return "RAPT";
  }
  if (providerId === STREAM_PROVIDER_ID) {
    return "Ареометр";
  }
  return providerId;
};

const deviceStatusDotClass: Record<DeviceDto["status"], string> = {
  online: "bg-success",
  offline: "bg-muted-foreground",
  unknown: "bg-warning"
};

function SectionHeader({
  title,
  count,
  action,
  extraAction,
  button
}: {
  title: string;
  count?: number;
  action?: { href: string; label: string };
  extraAction?: { href: string; label: string };
  button?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 className="flex items-baseline gap-2 whitespace-nowrap text-sm font-semibold text-foreground">
        {title}
        {typeof count === "number" ? <span className="text-xs font-medium tabular-nums text-muted-foreground">{count}</span> : null}
      </h2>
      <div className="flex items-center gap-4">
        {extraAction ? (
          <Link
            href={extraAction.href}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {extraAction.label}
          </Link>
        ) : null}
        {action ? (
          <Link href={action.href} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            {action.label}
          </Link>
        ) : null}
        {button ?? null}
      </div>
    </div>
  );
}

// --- Чеклист первого круга ---------------------------------------------------

function OnboardingChecklist({ onboarding }: { onboarding: DashboardOnboarding }) {
  const doneCount = onboarding.steps.filter((step) => step.done).length;
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">С чего начать</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {doneCount} из {onboarding.steps.length}
        </span>
      </div>
      <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {onboarding.steps.map((step, index) => {
          const isCurrent = step.key === onboarding.currentKey;
          return (
            <li
              key={step.key}
              className={`flex flex-col gap-3 rounded-xl border p-4 ${
                step.done ? "border-border bg-muted" : isCurrent ? "border-border shadow-sm" : "border-border"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {step.done ? (
                  <CircleCheck className="h-6 w-6 shrink-0 text-success" aria-label="Сделано" />
                ) : (
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                      isCurrent ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {index + 1}
                  </span>
                )}
                <p className={`text-sm font-semibold ${step.done ? "text-muted-foreground" : "text-foreground"}`}>{step.title}</p>
              </div>
              {step.done ? null : (
                <div className="flex flex-wrap gap-2">
                  {step.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-border hover:bg-accent"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// --- Партии ---------------------------------------------------------------------

function AttentionBrewCard({ card }: { card: DashboardBrewCard }) {
  const { batch, nudge, fermentationDay } = card;
  return (
    <Link
      href={`/app/brew-batches/${batch.id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-border hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${brewBatchStatusBadgeClass[batch.status]}`}>
          {brewBatchStatusLabels[batch.status]}
        </span>
        {batch.hasDevice ? <Cpu className="h-4 w-4 text-muted-foreground" aria-label="С устройством" /> : null}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground group-hover:text-foreground">{batch.name}</p>
        <p className="truncate text-sm text-muted-foreground">{batch.recipeTitle}</p>
      </div>
      {fermentationDay != null ? (
        <p className="text-xs tabular-nums text-muted-foreground">
          День {fermentationDay}
          {batch.measurementCount > 0
            ? ` · ${batch.measurementCount} ${plural(batch.measurementCount, ["замер", "замера", "замеров"])}`
            : ""}
        </p>
      ) : null}
      {nudge.text ? (
        <p className={`mt-auto flex items-center gap-1.5 text-sm ${nudgeToneClass[nudge.tone]}`}>
          {nudge.tone === "warn" ? <CircleAlert className="h-4 w-4 shrink-0" aria-hidden /> : null}
          {nudge.text}
        </p>
      ) : null}
    </Link>
  );
}

function PlannedBrewsCard({ planned, showAllLink }: { planned: ActiveBrewProgressItem[]; showAllLink: boolean }) {
  const shown = planned.slice(0, PLANNED_LIMIT);
  const rest = planned.length - shown.length;
  return (
    <section className="space-y-3">
      <SectionHeader
        title="Ожидают варки"
        count={planned.length}
        action={showAllLink ? { href: "/app/brew-batches", label: "Все партии" } : undefined}
        button={showAllLink ? <NewBrewButton size="sm" /> : undefined}
      />
      <div className="rounded-2xl border border-border bg-card p-2 shadow-sm">
        <ul className="divide-y divide-border">
          {shown.map((batch) => (
            <li key={batch.id}>
              <Link
                href={`/app/brew-batches/${batch.id}`}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{batch.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{batch.recipeTitle}</p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {batch.plannedFor ? plannedDateFormat.format(batch.plannedFor) : "готова к старту"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {rest > 0 ? (
          <Link
            href="/app/brew-batches"
            className="block rounded-xl px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Ещё {rest} — все партии
          </Link>
        ) : null}
      </div>
    </section>
  );
}

// --- Ряд ресурсов: склад, нехватки, оборудование ---------------------------------

function WidgetLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

function InventoryWidget({ summary }: { summary: InventorySummaryDto }) {
  if (summary.totalItems === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-card p-5">
        <WidgetLabel>Склад</WidgetLabel>
        <p className="text-sm text-muted-foreground">Добавьте ингредиенты — рецепты покажут, чего хватает для варки.</p>
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Link
            href="/catalog"
            className="inline-flex items-center rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            Каталог
          </Link>
          <Link
            href="/app/ingredients"
            className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-border"
          >
            Склад
          </Link>
        </div>
      </div>
    );
  }

  const groups = (["fermentable", "hop", "yeast"] as const).map((key) => ({
    key,
    label: inventoryPrimaryGroupLabels[key],
    count: summary.inStockByPrimaryGroup[key]
  }));

  return (
    <Link
      href="/app/ingredients"
      className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-border hover:shadow-md"
    >
      <WidgetLabel>Склад</WidgetLabel>
      <p className="text-3xl font-semibold tabular-nums text-foreground" style={{ fontFamily: "var(--font-display)" }}>
        {summary.inStockItems}
        <span className="ml-2 text-sm font-normal text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
          в наличии
        </span>
      </p>
      <ul className="space-y-1.5">
        {groups.map((group) => (
          <li key={group.key} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{group.label}</span>
            <span className="tabular-nums font-medium text-foreground">{group.count}</span>
          </li>
        ))}
      </ul>
      {summary.emptyItems > 0 ? (
        <p className="mt-auto flex items-center gap-1.5 pt-1 text-xs text-warning-subtle-foreground">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Закончилось: {summary.emptyItems} {plural(summary.emptyItems, ["позиция", "позиции", "позиций"])}
        </p>
      ) : null}
    </Link>
  );
}

function ShoppingWidget({ shopping }: { shopping: ShoppingListDto }) {
  if (shopping.totalItems === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-card p-5">
        <WidgetLabel>Чего не хватает</WidgetLabel>
        {shopping.emptyReason === "all_in_stock" ? (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
            Для запланированных партий всё в наличии
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Считается по запланированным партиям: чего не хватает — попадёт сюда.</p>
        )}
      </div>
    );
  }

  const topLines = shopping.groups.flatMap((group) => group.items).slice(0, 3);

  return (
    <Link
      href="/app/shopping"
      className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-border hover:shadow-md"
    >
      <WidgetLabel>Чего не хватает</WidgetLabel>
      <p className="text-3xl font-semibold tabular-nums text-foreground" style={{ fontFamily: "var(--font-display)" }}>
        {shopping.totalItems}
        <span className="ml-2 text-sm font-normal text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
          {plural(shopping.totalItems, ["позиция", "позиции", "позиций"])}
        </span>
      </p>
      <ul className="space-y-1.5">
        {topLines.map((line) => (
          <li key={line.key} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-muted-foreground">{line.ingredientDisplayName}</span>
            <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{line.quantityLabel}</span>
          </li>
        ))}
      </ul>
      <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
        Весь список
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </span>
    </Link>
  );
}

function DevicesWidget({ devices }: { devices: DeviceDto[] }) {
  if (devices.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-card p-5">
        <WidgetLabel>Оборудование</WidgetLabel>
        <p className="text-sm text-muted-foreground">
          Подключите BrewForge или цифровой ареометр, чтобы вести варку и брожение из приложения.
        </p>
        <div className="mt-auto pt-1">
          <Link
            href="/app/devices"
            className="inline-flex items-center rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            Подключить
          </Link>
        </div>
      </div>
    );
  }

  const shown = devices.slice(0, DEVICES_LIMIT);
  const rest = devices.length - shown.length;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <WidgetLabel>Оборудование</WidgetLabel>
        <Link href="/app/devices" className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          Все
        </Link>
      </div>
      <ul className="space-y-1">
        {shown.map((device) => (
          <li key={device.id}>
            <Link
              href={`/app/devices/${device.id}`}
              className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${deviceStatusDotClass[device.status]}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{device.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{deviceProviderLabel(device.providerId)}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {device.status === "online"
                  ? "онлайн"
                  : device.lastSeenAt
                    ? formatRelativeTimestamp(device.lastSeenAt)
                    : "нет данных"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {rest > 0 ? (
        <Link href="/app/devices" className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          Ещё {rest}
        </Link>
      ) : null}
    </div>
  );
}

// --- Страница ---------------------------------------------------------------------

export default async function AppZonePage() {
  const user = await requireUser();
  const [
    recipeCount,
    savedRecipeCount,
    inventory,
    activeBrews,
    brewable,
    brewBatchCount,
    devices,
    shopping,
    favoriteCalculators
  ] = await Promise.all([
      countRecipesForAuthor(user.id),
      countSavedRecipes(user.id),
      getInventorySummaries(user.id),
      listActiveBrewBatchesForUser(user.id),
      findBrewableOwnRecipesForUser({ userId: user.id, limit: BREWABLE_FETCH_LIMIT }),
      countBrewBatchesForUser(user.id),
      listUserDevices(user.id),
      buildShoppingListForUser(user.id),
      listFavoriteCalculators(user.id)
    ]);

  const now = new Date();
  const greetingName = user.displayName?.trim() || user.email || user.phone;

  const isNewUser = isNewUserDashboard({
    recipeCount,
    inventoryTotalItems: inventory.totalItems,
    activeBrewCount: activeBrews.length
  });

  const onboarding = buildDashboardOnboarding({
    inventoryTotalItems: inventory.totalItems,
    recipeCount,
    savedRecipeCount,
    brewBatchCount
  });

  const { attention, planned } = splitActiveBrews(activeBrews, now);
  const attentionShown = attention.slice(0, ATTENTION_LIMIT);
  const attentionRest = attention.length - attentionShown.length;

  const brewableCards = dedupeByTitle(brewable).slice(0, BREWABLE_LIMIT);

  // «Мои рецепты» — свежие рецепты, которых ещё нет в «Рецепты под ваш склад»:
  // иначе один и тот же рецепт стоит в двух секциях подряд. Отсекаем и по id, и
  // по названию — у клонов рецепта разные id, но для глаза это тот же рецепт.
  const brewableIds = new Set(brewableCards.map((recipe) => recipe.recipeId));
  const brewableTitles = new Set(brewableCards.map((recipe) => normalizeTitle(recipe.title)));
  const recentRecipes =
    recipeCount > 0
      ? dedupeByTitle(
          (await listAuthorRecipeCards(user.id)).filter(
            (recipe) => !brewableIds.has(recipe.id) && !brewableTitles.has(normalizeTitle(recipe.title))
          )
        ).slice(0, RECENT_RECIPES_LIMIT)
      : [];

  const discoverLinks = [
    { href: "/articles", title: "Статьи", icon: BookOpen },
    { href: "/bjcp", title: "Стили пива", icon: Sparkles },
    { href: "/calculators", title: "Калькуляторы", icon: Calculator },
    { href: "/recipes", title: "Рецепты сообщества", icon: FlaskConical }
  ];

  const discoverStrip = (
    <section className="space-y-3">
      <SectionHeader title="Полезное рядом" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {discoverLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-border hover:shadow-md"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="h-4 w-4" />
              </span>
              <p className="truncate text-sm font-semibold text-foreground">{link.title}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );

  // День-1: пустые виджеты не несут ценности — только приветствие, первый круг
  // и мостик к витрине знаний.
  if (isNewUser) {
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
          Добро пожаловать, {greetingName}
        </h1>
        <OnboardingChecklist onboarding={onboarding} />
        {discoverStrip}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-foreground sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
        С возвращением, {greetingName}
      </h1>

      {attentionShown.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader
            title="В работе"
            count={attention.length}
            action={{ href: "/app/brew-batches", label: "Все партии" }}
            button={<NewBrewButton size="sm" />}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {attentionShown.map((card) => (
              <AttentionBrewCard key={card.batch.id} card={card} />
            ))}
          </div>
          {attentionRest > 0 ? (
            <Link
              href="/app/brew-batches"
              className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Ещё {attentionRest} в работе
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </section>
      ) : null}

      {planned.length > 0 ? (
        <PlannedBrewsCard planned={planned} showAllLink={attentionShown.length === 0} />
      ) : null}

      {/* Нет ни одной активной партии: секции выше схлопнуты — даём явный вход
          «Сварить», иначе с дашборда неясно, где запланировать варку. */}
      {attentionShown.length === 0 && planned.length === 0 ? (
        <section className="space-y-3">
          <SectionHeader title="Партии" button={<NewBrewButton size="sm" />} />
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Активных партий нет. Выберите рецепт и запланируйте варочный день.
            </p>
            <NewBrewButton />
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InventoryWidget summary={inventory} />
        <ShoppingWidget shopping={shopping} />
        <DevicesWidget devices={devices} />
      </section>

      {brewableCards.length > 0 ? (
        <section className="space-y-3">
          {/* Секция про подбор, а не про обещание: сюда попадают и рецепты с
              бейджем «Почти хватает» (все ингредиенты есть, количества местами
              впритык) — заголовок «Можно сварить сейчас» им противоречил. */}
          <SectionHeader title="Рецепты под ваш склад" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {brewableCards.map((recipe) => (
              <BrewableRecipeCard
                key={recipe.recipeId}
                recipe={recipe}
                href={`/app/recipes/${recipe.recipeId}/edit`}
              />
            ))}
          </div>
        </section>
      ) : null}

      {recentRecipes.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader
            title="Мои рецепты"
            count={recipeCount}
            extraAction={{ href: "/app/recipes/new", label: "Создать рецепт" }}
            action={{ href: "/app/recipes", label: "Все рецепты" }}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentRecipes.map((recipe) => (
              <OwnerRecipeCard
                key={recipe.id}
                recipe={recipe}
                preferredGravityUnit={user.preferredGravityUnit}
                intent="preview"
              />
            ))}
          </div>
        </section>
      ) : null}

      {favoriteCalculators.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader title="Избранные калькуляторы" action={{ href: "/calculators", label: "Все калькуляторы" }} />
          <CalculatorFavoritesProvider
            slugs={favoriteCalculators.map((calculator) => calculator.slug)}
            initialFavoriteSlugs={favoriteCalculators.map((calculator) => calculator.slug)}
          >
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {favoriteCalculators.map((calculator) => (
                <CalculatorCard key={calculator.slug} calculator={calculator} />
              ))}
            </div>
          </CalculatorFavoritesProvider>
        </section>
      ) : null}

      {/* Чеклист первого круга — внизу: верх дашборда отдан работающим блокам,
          а не призывам; у дня-1 (isNewUser) чеклист наоборот герой. */}
      {onboarding.complete ? null : <OnboardingChecklist onboarding={onboarding} />}

      {discoverStrip}
    </div>
  );
}
