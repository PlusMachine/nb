"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Shield } from "lucide-react";

import { isNavItemActive, isPublicPath, resolveAppNavGroups, type AppChromeUser } from "@/lib/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";

type AppSidebarNavProps = {
  user: AppChromeUser;
  // вызывается при клике по ссылке (мобильный drawer закрывается)
  onNavigate?: () => void;
};

export function AppSidebarNav({ user, onNavigate }: AppSidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      onNavigate?.();
      // На витринной странице остаёмся на месте: сервер перерисует хром на
      // анонимный (публичная шапка вместо сайдбара). Уводим на / только из
      // страниц рабочей зоны, которых у анонима нет.
      if (isPublicPath(pathname)) {
        router.refresh();
      } else {
        router.push("/");
        router.refresh();
      }
    }
  };

  const identity = user.displayName?.trim() || user.email || user.phone || "Профиль";
  const profileActive = pathname === "/profile" || pathname.startsWith("/profile/");

  return (
    <div className="flex h-full flex-col">
      <nav className="flex flex-1 flex-col gap-1" aria-label="Навигация рабочей зоны">
        {resolveAppNavGroups(user).map((group, groupIndex) => (
          <React.Fragment key={groupIndex}>
            {groupIndex > 0 ? <div className="my-2 border-t border-border/70" /> : null}
            {group.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => onNavigate?.()}
                  onMouseEnter={() => router.prefetch(item.href)}
                  onFocus={() => router.prefetch(item.href)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </React.Fragment>
        ))}
      </nav>

      <div className="mt-2 space-y-1 border-t border-border/70 pt-2">
        {user.isStaff ? (
          <Link
            href="/admin"
            onClick={() => onNavigate?.()}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Shield className="h-4 w-4 shrink-0" />
            Админка
          </Link>
        ) : null}
        <Link
          href="/profile"
          onClick={() => onNavigate?.()}
          aria-current={profileActive ? "page" : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            profileActive
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <span
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold uppercase ${
              profileActive ? "bg-background/20 text-background" : "bg-foreground text-background"
            }`}
          >
            {identity.slice(0, 1)}
          </span>
          <span className="truncate">{identity}</span>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {loggingOut ? "Выходим…" : "Выйти"}
        </button>

        <div className="flex items-center justify-between gap-2 px-3 pt-1">
          <span className="text-xs font-medium text-muted-foreground">Тема</span>
          <ThemeToggle />
        </div>

        {/* В рабочей зоне нет футера — правовые ссылки и отметка 18+ живут здесь. */}
        <div className="px-3 pt-2 text-[11px] leading-5 text-muted-foreground">
          <Link href="/legal" onClick={() => onNavigate?.()} className="transition-colors hover:text-foreground">
            Правовые документы
          </Link>
          <p className="mt-1">18+ · Употребление алкоголя вредит здоровью</p>
        </div>
      </div>
    </div>
  );
}
