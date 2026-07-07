"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import { recipeTabs } from "@/lib/navigation";

export function RecipeTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Разделы рецептов">
      {recipeTabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        // Табы вне рабочей зоны (href не начинается с "/app") уводят на публичную
        // витрину — помечаем стрелкой, чтобы переход между зонами не был сюрпризом.
        const leavesWorkingZone = !tab.href.startsWith("/app");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {leavesWorkingZone ? <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" aria-hidden /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
