import React from "react";
import Link from "next/link";

// Табы раздела «Склад»: «Запасы» (/app/ingredients) и «Чего не хватает»
// (/app/shopping — производная витрина склада: нехватки под запланированные
// партии). Визуальный язык — RecipeTabs (components/recipes/recipe-tabs.tsx);
// активный таб известен каждой странице статически, поэтому серверный
// компонент без usePathname.
const inventoryTabs = [
  { key: "stock", href: "/app/ingredients", label: "Запасы" },
  { key: "missing", href: "/app/shopping", label: "Чего не хватает" }
] as const;

type InventoryTabKey = (typeof inventoryTabs)[number]["key"];

export function InventoryTabs({
  active,
  missingCount
}: {
  active: InventoryTabKey;
  missingCount?: number;
}) {
  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Разделы склада">
      {inventoryTabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.key === "missing" && missingCount ? (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {missingCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
