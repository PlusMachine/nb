"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { recipeTabs } from "@/lib/navigation";

export function RecipeTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-zinc-200" aria-label="Разделы рецептов">
      {recipeTabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-zinc-900 text-zinc-950"
                : "border-transparent text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
