import React from "react";
import Link from "next/link";

import { legalLinks, publicLinks } from "@/lib/navigation";

export function SiteFooter() {
  const year = new Date().getFullYear();

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
          <p className="max-w-xs text-xs leading-5 text-zinc-400">
            18+ · Материалы носят информационный характер. Чрезмерное употребление алкоголя вредит вашему здоровью.
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Разделы</p>
          <ul className="space-y-2 text-sm">
            {publicLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-zinc-600 transition-colors hover:text-zinc-950">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Правовая информация</p>
          <ul className="space-y-2 text-sm">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-zinc-600 transition-colors hover:text-zinc-950">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Аккаунт</p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/login" className="text-zinc-600 transition-colors hover:text-zinc-950">
                Войти
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-zinc-100">
        <p className="mx-auto max-w-7xl px-6 py-4 text-xs text-zinc-400">
          © {year} NB — платформа для домашних пивоваров
        </p>
      </div>
    </footer>
  );
}
