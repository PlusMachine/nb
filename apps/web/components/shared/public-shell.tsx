"use client";

import React from "react";
import { usePathname } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteHeader } from "@/components/shared/site-header";
import { resolveContentWidthClass, type AppChromeUser } from "@/lib/navigation";

type PublicShellProps = {
  user: AppChromeUser | null;
  children: React.ReactNode;
};

// Выбирает хром для публичных роутов (app-first): залогиненному — сайдбар
// рабочей зоны на всех публичных страницах, чтобы навигация не «прыгала»;
// исключения — /login (форма входа под публичной шапкой) и /demo (демо чаще
// всего показывают с залогиненного ноутбука владельца — там должен быть
// витринный хром, не AppShell). Анонимам — шапка.
export function PublicShell({ user, children }: PublicShellProps) {
  const pathname = usePathname();

  if (user && pathname !== "/login" && pathname !== "/demo") {
    return <AppShell user={user}>{children}</AppShell>;
  }

  return (
    <div className="min-h-screen [--chrome-top:3.5rem]">
      <SiteHeader />
      <div className={`mx-auto px-6 pb-12 ${resolveContentWidthClass(pathname)}`}>{children}</div>
      <SiteFooter />
    </div>
  );
}
