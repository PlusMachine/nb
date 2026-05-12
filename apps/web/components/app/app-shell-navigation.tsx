"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type AppShellNavigationProps = {
  email: string;
  onNavigateStart?: (href: string) => void;
};

const navItems = [
  { href: "/app", label: "Главная", exact: true },
  { href: "/app/recipes", label: "Рецепты" },
  { href: "/app/equipment", label: "Оборудование" },
  { href: "/app/catalog", label: "Каталог" },
  { href: "/app/ingredients", label: "Склад" },
  { href: "/profile", label: "Профиль" }
];

const isActivePath = (pathname: string, href: string, exact?: boolean) => (
  exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
);

export function AppShellNavigation({ email, onNavigateStart }: AppShellNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="mb-5 flex flex-col gap-3 border-b border-zinc-200 pb-3 text-sm text-zinc-500 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">Рабочая зона</p>
        <p className="truncate font-medium text-zinc-700">{email}</p>
      </div>
      <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:pb-0" aria-label="Основная навигация">
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
    </header>
  );
}
