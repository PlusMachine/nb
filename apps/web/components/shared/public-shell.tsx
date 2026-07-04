"use client";

import React from "react";
import { usePathname } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteHeader, type SiteHeaderUser } from "@/components/shared/site-header";

type PublicShellProps = {
  user: SiteHeaderUser | null;
  children: React.ReactNode;
};

// Выбирает хром для публичных роутов (app-first): залогиненному — сайдбар
// рабочей зоны на всех публичных страницах, чтобы навигация не «прыгала»;
// исключение — /login (форма входа под публичной шапкой). Анонимам — шапка.
export function PublicShell({ user, children }: PublicShellProps) {
  const pathname = usePathname();

  if (user && pathname !== "/login") {
    return <AppShell user={user}>{children}</AppShell>;
  }

  return (
    <div className="min-h-screen [--chrome-top:3.5rem]">
      <SiteHeader user={user} variant="public" />
      <div className="mx-auto max-w-7xl px-6 pb-12">{children}</div>
      <SiteFooter />
    </div>
  );
}
