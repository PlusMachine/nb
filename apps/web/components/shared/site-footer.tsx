import React from "react";
import Link from "next/link";

import { legalLinks, publicLinks } from "@/lib/navigation";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border bg-card/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <p
            className="text-lg font-semibold tracking-[0.2em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            NB
          </p>
          <p className="max-w-xs text-sm leading-6 text-muted-foreground">
            Платформа для домашних пивоваров: каталог ингредиентов, склад, рецепты и BJCP в одном месте.
          </p>
          <p className="max-w-xs text-xs leading-5 text-muted-foreground">
            18+ · Материалы носят информационный характер. Чрезмерное употребление алкоголя вредит вашему здоровью.
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Разделы</p>
          <ul className="space-y-2 text-sm">
            {publicLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Правовая информация</p>
          <ul className="space-y-2 text-sm">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Аккаунт</p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/login" className="text-muted-foreground transition-colors hover:text-foreground">
                Войти
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-7xl px-6 py-4 text-xs text-muted-foreground">
          © {year} NB — платформа для домашних пивоваров
        </p>
      </div>
    </footer>
  );
}
