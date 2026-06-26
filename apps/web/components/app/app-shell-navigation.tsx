"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type AppShellNavigationProps = {
  onNavigateStart?: (href: string) => void;
};

const navItems = [
  { href: "/app", label: "Главная", exact: true },
  { href: "/app/recipes", label: "Мои рецепты" },
  { href: "/app/saved", label: "Избранные" },
  { href: "/app/equipment", label: "Оборудование" },
  { href: "/catalog", label: "Каталог" },
  { href: "/app/ingredients", label: "Склад" }
];

const isActivePath = (pathname: string, href: string, exact?: boolean) => (
  exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
);

export function AppShellNavigation({ onNavigateStart }: AppShellNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="mb-5 border-b border-zinc-200 pb-3">
      <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1" aria-label="Основная навигация">
        {navItems.map((item) => {
          const active = isActivePath(pathname, item.href, item.exact);

          return (
            <Link
              key={item.href}
              href={item.href}
              onPointerDown={() => onNavigateStart?.(item.href)}
              onClick={() => onNavigateStart?.(item.href)}
              onFocus={() => router.prefetch(item.href)}
              onMouseEnter={() => router.prefetch(item.href)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 font-medium transition-colors ${
                active
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
