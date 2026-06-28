import React from "react";
import Link from "next/link";

type FooterLink = { href: string; label: string };

const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: "Рабочая зона",
    links: [
      { href: "/app", label: "Обзор" },
      { href: "/app/recipes", label: "Мои рецепты" },
      { href: "/app/ingredients", label: "Склад" },
      { href: "/catalog", label: "Каталог" }
    ]
  },
  {
    title: "Знания",
    links: [
      { href: "/bjcp", label: "Стили пива" },
      { href: "/calculators", label: "Калькуляторы" },
      { href: "/recipes", label: "Публичные рецепты" }
    ]
  },
  {
    title: "Аккаунт",
    links: [
      { href: "/login", label: "Войти" },
      { href: "/profile", label: "Профиль" }
    ]
  }
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-zinc-200 bg-white/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <p
            className="text-lg font-semibold tracking-[0.2em] text-zinc-950"
            style={{ fontFamily: "var(--font-display)" }}
          >
            NB
          </p>
          <p className="max-w-xs text-sm leading-6 text-zinc-500">
            Платформа для домашних пивоваров: каталог ингредиентов, склад, рецепты и BJCP в одном месте.
          </p>
        </div>
        {columns.map((column) => (
          <div key={column.title} className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{column.title}</p>
            <ul className="space-y-2 text-sm">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-zinc-600 transition-colors hover:text-zinc-950">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-100">
        <p className="mx-auto max-w-7xl px-6 py-4 text-xs text-zinc-400">© NB — knowledge base &amp; brewing workspace</p>
      </div>
    </footer>
  );
}
