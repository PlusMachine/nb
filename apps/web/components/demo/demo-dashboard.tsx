import { ArrowRight, CircleAlert, Cpu } from "lucide-react";

import type { BrewNudge } from "@/features/brew-batches/dashboard";
import {
  brewBatchStatusBadgeClass,
  brewBatchStatusLabels,
  type ActiveBrewProgressItem
} from "@/features/brew-batches/contracts";
import { splitActiveBrews, type DashboardBrewCard } from "@/features/dashboard/overview";
import type { DeviceDto } from "@/features/devices/contracts";
import { inventoryPrimaryGroupLabels } from "@/features/inventory/page-model";
import type { InventorySummaryDto } from "@/features/inventory/contracts";
import { formatRelativeTimestamp } from "@/features/recipes/format";

import type { DemoShoppingLine } from "./demo-data";

// Секция 5 «Дашборд» (docs/demo-page.md §2.5). Виджеты — реплики неэкспортируемых
// локальных функций `apps/web/app/(app)/app/page.tsx` (AttentionBrewCard,
// PlannedBrewsCard, InventoryWidget, ShoppingWidget, DevicesWidget): реюзнуть их
// напрямую нельзя (не экспортированы), поэтому вёрстка повторена близко к
// оригиналу. Раскладка «в работе/запланированы» — настоящий реюз чистого
// `splitActiveBrews`. Все ссылки ведут в `/app/*`, поэтому вся секция обёрнута
// в `pointer-events-none` — на демо-странице их некуда вести без логина.

// Цвет текста подсказки «следующего шага» по тону — как в оригинале.
const nudgeToneClass: Record<BrewNudge["tone"], string> = {
  action: "text-foreground",
  warn: "text-warning-subtle-foreground",
  info: "text-muted-foreground"
};

const deviceStatusDotClass: Record<DeviceDto["status"], string> = {
  online: "bg-success",
  offline: "bg-muted-foreground",
  unknown: "bg-warning"
};

const deviceProviderLabel = (providerId: string): string => {
  if (providerId.startsWith("brewforge")) {
    return providerId.includes("demo") ? "BrewForge · демо" : "BrewForge";
  }
  if (providerId.startsWith("rapt")) {
    return "RAPT";
  }
  return providerId;
};

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

function WidgetLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

function AttentionBrewCard({ card }: { card: DashboardBrewCard }) {
  const { batch, nudge, fermentationDay } = card;
  return (
    <span className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <span className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${brewBatchStatusBadgeClass[batch.status]}`}>
          {brewBatchStatusLabels[batch.status]}
        </span>
        {batch.hasDevice ? <Cpu className="h-4 w-4 text-muted-foreground" aria-label="С устройством" /> : null}
      </span>
      <span className="block min-w-0">
        <span className="block truncate font-semibold text-foreground">{batch.name}</span>
        <span className="block truncate text-sm text-muted-foreground">{batch.recipeTitle}</span>
      </span>
      {fermentationDay != null ? (
        <span className="block text-xs tabular-nums text-muted-foreground">
          День {fermentationDay}
          {batch.measurementCount > 0
            ? ` · ${batch.measurementCount} ${plural(batch.measurementCount, ["замер", "замера", "замеров"])}`
            : ""}
        </span>
      ) : null}
      {nudge.text ? (
        <span className={`mt-auto flex items-center gap-1.5 text-sm ${nudgeToneClass[nudge.tone]}`}>
          {nudge.tone === "warn" ? <CircleAlert className="h-4 w-4 shrink-0" aria-hidden /> : null}
          {nudge.text}
        </span>
      ) : null}
    </span>
  );
}

function PlannedBrewsCard({ planned }: { planned: ActiveBrewProgressItem[] }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
        Ожидают варки
        <span className="text-xs font-medium tabular-nums text-muted-foreground">{planned.length}</span>
      </h3>
      <div className="rounded-2xl border border-border bg-card p-2 shadow-sm">
        <ul className="divide-y divide-border">
          {planned.map((batch) => (
            <li key={batch.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{batch.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{batch.recipeTitle}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {batch.plannedFor ? plannedDateFormat.format(batch.plannedFor) : "готова к старту"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function InventoryWidget({ summary }: { summary: InventorySummaryDto }) {
  const groups = (["fermentable", "hop", "yeast"] as const).map((key) => ({
    key,
    label: inventoryPrimaryGroupLabels[key],
    count: summary.inStockByPrimaryGroup[key]
  }));

  return (
    <span className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
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
        <span className="mt-auto flex items-center gap-1.5 pt-1 text-xs text-warning-subtle-foreground">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Закончилось: {summary.emptyItems} {plural(summary.emptyItems, ["позиция", "позиции", "позиций"])}
        </span>
      ) : null}
    </span>
  );
}

function ShoppingWidget({ shopping }: { shopping: DemoShoppingLine[] }) {
  return (
    <span className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <WidgetLabel>Чего не хватает</WidgetLabel>
      <p className="text-3xl font-semibold tabular-nums text-foreground" style={{ fontFamily: "var(--font-display)" }}>
        {shopping.length}
        <span className="ml-2 text-sm font-normal text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
          {plural(shopping.length, ["позиция", "позиции", "позиций"])}
        </span>
      </p>
      <ul className="space-y-1.5">
        {shopping.map((line) => (
          <li key={line.id} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-muted-foreground">{line.label}</span>
            <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{line.quantity}</span>
          </li>
        ))}
      </ul>
      <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-medium text-muted-foreground">
        Весь список
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </span>
    </span>
  );
}

function DevicesWidget({ device, now }: { device: DeviceDto; now: Date }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <WidgetLabel>Оборудование</WidgetLabel>
      <ul className="space-y-1">
        <li className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${deviceStatusDotClass[device.status]}`} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{device.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{deviceProviderLabel(device.providerId)}</span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {device.status === "online"
              ? "онлайн"
              : device.lastSeenAt
                ? formatRelativeTimestamp(device.lastSeenAt, now)
                : "нет данных"}
          </span>
        </li>
      </ul>
    </div>
  );
}

export function DemoDashboardSection({
  brews,
  inventorySummary,
  shopping,
  device,
  now
}: {
  brews: ActiveBrewProgressItem[];
  inventorySummary: InventorySummaryDto;
  shopping: DemoShoppingLine[];
  device: DeviceDto;
  now: Date;
}) {
  const { attention, planned } = splitActiveBrews(brews, now);

  return (
    <div className="pointer-events-none space-y-6">
      {attention.length > 0 ? (
        <section className="space-y-3">
          <h3 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
            В работе
            <span className="text-xs font-medium tabular-nums text-muted-foreground">{attention.length}</span>
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map((card) => (
              <AttentionBrewCard key={card.batch.id} card={card} />
            ))}
          </div>
        </section>
      ) : null}

      {planned.length > 0 ? <PlannedBrewsCard planned={planned} /> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InventoryWidget summary={inventorySummary} />
        <ShoppingWidget shopping={shopping} />
        <DevicesWidget device={device} now={now} />
      </section>

      <p className="text-sm text-muted-foreground">
        Один экран собирает партии, склад, нехватки и подключённые приборы — без переходов между разделами.
      </p>
    </div>
  );
}
