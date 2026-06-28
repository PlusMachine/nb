"use client";

import React from "react";
import { usePathname } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { SiteHeader, type SiteHeaderUser } from "@/components/shared/site-header";
import { isReferencePath } from "@/lib/navigation";

type PublicShellProps = {
  user: SiteHeaderUser | null;
  children: React.ReactNode;
};

// Выбирает хром для публичных роутов: залогиненному на справочниках
// (каталог / стили / калькуляторы / рецепты сообщества) — сайдбар рабочей
// зоны; всем остальным (главная, логин, статьи) и анонимам — публичная шапка.
export function PublicShell({ user, children }: PublicShellProps) {
  const pathname = usePathname();

  if (user && isReferencePath(pathname)) {
    return <AppShell user={user}>{children}</AppShell>;
  }

  return (
    <div className="min-h-screen">
      <SiteHeader user={user} variant="public" />
      <div className="mx-auto max-w-7xl px-6 pb-12">{children}</div>
    </div>
  );
}
