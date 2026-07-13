"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, LayoutGrid } from "lucide-react";

import type { UserRole } from "@nb/auth";

import { resolveActiveAdminNavHref, resolveAdminNavGroups } from "@/lib/admin-navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";

type AdminSidebarNavProps = {
  role: UserRole;
  // вызывается при клике по ссылке (мобильный drawer закрывается)
  onNavigate?: () => void;
};

const linkClassName = (active: boolean) =>
  `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground"
  }`;

export function AdminSidebarNav({ role, onNavigate }: AdminSidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const groups = resolveAdminNavGroups(role);
  const activeHref = resolveActiveAdminNavHref(
    pathname,
    groups.flatMap((group) => group.items)
  );
  const overviewActive = pathname === "/admin";

  return (
    <div className="flex h-full flex-col">
      <nav className="flex flex-1 flex-col gap-1" aria-label="Навигация админки">
        <Link
          href="/admin"
          onClick={() => onNavigate?.()}
          aria-current={overviewActive ? "page" : undefined}
          className={linkClassName(overviewActive)}
        >
          <LayoutGrid className="h-4 w-4 shrink-0" />
          Обзор
        </Link>

        {groups.map((group) => (
          <React.Fragment key={group.key}>
            <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {group.label}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => onNavigate?.()}
                  onMouseEnter={() => router.prefetch(item.href)}
                  onFocus={() => router.prefetch(item.href)}
                  aria-current={active ? "page" : undefined}
                  className={linkClassName(active)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </React.Fragment>
        ))}
      </nav>

      <div className="mt-2 space-y-1 border-t border-border/70 pt-2">
        <Link
          href="/app"
          onClick={() => onNavigate?.()}
          className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          В приложение
        </Link>

        <div className="flex items-center justify-between gap-2 px-3 pt-1">
          <span className="text-xs font-medium text-muted-foreground">Тема</span>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
