"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Shield } from "lucide-react";

import { appNavGroups, isNavItemActive, isPublicPath, type AppChromeUser } from "@/lib/navigation";

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
        {appNavGroups.map((group, groupIndex) => (
          <React.Fragment key={groupIndex}>
            {groupIndex > 0 ? <div className="my-2 border-t border-zinc-200/70" /> : null}
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
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
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

      <div className="mt-2 space-y-1 border-t border-zinc-200/70 pt-2">
        {user.isStaff ? (
          <Link
            href="/admin"
            onClick={() => onNavigate?.()}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
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
              ? "bg-zinc-900 text-white"
              : "text-zinc-700 hover:bg-zinc-100"
          }`}
        >
          <span
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold uppercase ${
              profileActive ? "bg-white/15 text-white" : "bg-zinc-900 text-white"
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
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-60"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {loggingOut ? "Выходим…" : "Выйти"}
        </button>

        {/* В рабочей зоне нет футера — правовые ссылки и отметка 18+ живут здесь. */}
        <div className="px-3 pt-2 text-[11px] leading-5 text-zinc-400">
          <Link href="/legal" onClick={() => onNavigate?.()} className="transition-colors hover:text-zinc-600">
            Правовые документы
          </Link>
          <p className="mt-1">18+ · Употребление алкоголя вредит здоровью</p>
        </div>
      </div>
    </div>
  );
}
