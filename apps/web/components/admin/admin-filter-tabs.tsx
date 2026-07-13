import React from "react";
import Link from "next/link";

export type AdminFilterTab = {
  key: string;
  label: string;
  href: string;
  count?: number;
};

type AdminFilterTabsProps = {
  tabs: AdminFilterTab[];
  activeKey: string;
  // Заголовок для скринридера, если табов на странице больше одного набора.
  label?: string;
  className?: string;
};

export function AdminFilterTabs({ tabs, activeKey, label = "Фильтр", className = "" }: AdminFilterTabsProps) {
  return (
    <nav aria-label={label} className={`flex flex-wrap gap-2 text-sm ${className}`}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1 transition-colors ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium ${
                  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
