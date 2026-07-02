"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LayoutGrid, LogOut, Menu, User2, X } from "lucide-react";

import { DropdownMenu, type DropdownMenuItem } from "@nb/ui";

export type SiteHeaderUser = {
  email: string | null;
  phone?: string | null;
  displayName: string;
  // editor+ — показывает мост в админку (вычисляется на сервере, не тащим роли в клиент)
  isStaff?: boolean;
};

type SiteHeaderProps = {
  user: SiteHeaderUser | null;
  variant?: "public" | "app";
};

// Публичные/знаниевые разделы, доступные из любой зоны — общий мост между
// рабочей зоной и публичным сайтом.
const publicLinks = [
  { href: "/catalog", label: "Каталог" },
  { href: "/guides", label: "Гайды" },
  { href: "/bjcp", label: "Стили пива" },
  { href: "/calculators", label: "Калькуляторы" },
  { href: "/recipes", label: "Рецепты" }
];

const isActivePath = (pathname: string, href: string) => (
  pathname === href || pathname.startsWith(`${href}/`)
);

export function SiteHeader({ user, variant = "public" }: SiteHeaderProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Закрываем мобильное меню при смене роута.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Закрытие по клику вне хедера и по Escape.
  useEffect(() => {
    if (!mobileOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMobileOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [mobileOpen]);

  return (
    <header className="border-b border-zinc-200/70 bg-white/80 backdrop-blur">
      <div
        ref={containerRef}
        className="relative mx-auto flex max-w-7xl items-center justify-between gap-x-6 px-6 py-4"
      >
        <div className="flex items-center gap-x-6">
          <Link
            href="/"
            className="text-lg font-semibold tracking-[0.2em] text-zinc-950"
            style={{ fontFamily: "var(--font-display)" }}
          >
            NB
          </Link>
          <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Разделы сайта">
            {publicLinks.map((link) => {
              const active = isActivePath(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                    active
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              {variant === "public" ? (
                <Link
                  href="/app"
                  className="hidden items-center gap-1.5 rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 sm:inline-flex"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Мастерская
                </Link>
              ) : null}
              <UserMenu user={user} />
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
            >
              Войти
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label={mobileOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={mobileOpen}
            className="rounded-lg p-2 text-zinc-700 transition-colors hover:bg-zinc-100 md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen ? (
          <div className="absolute inset-x-0 top-full z-50 border-b border-zinc-200 bg-white px-6 py-3 shadow-lg md:hidden">
            <nav className="flex flex-col gap-1 text-sm" aria-label="Разделы сайта">
              {publicLinks.map((link) => {
                const active = isActivePath(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`rounded-lg px-3 py-2 font-medium transition-colors ${
                      active
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function UserMenu({ user }: { user: SiteHeaderUser }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const logoutFormRef = useRef<HTMLFormElement>(null);

  const label = user.displayName?.trim() || user.email || user.phone || "Профиль";

  const items: DropdownMenuItem[] = [
    {
      key: "workshop",
      label: "Мастерская",
      icon: <LayoutGrid className="h-4 w-4 text-zinc-400" />,
      onSelect: () => router.push("/app")
    },
    {
      key: "profile",
      label: "Профиль",
      icon: <User2 className="h-4 w-4 text-zinc-400" />,
      onSelect: () => router.push("/profile")
    },
    {
      key: "logout",
      label: pending ? "Выходим…" : "Выйти",
      icon: <LogOut className="h-4 w-4 text-zinc-400" />,
      disabled: pending,
      onSelect: () => logoutFormRef.current?.requestSubmit()
    }
  ];

  return (
    <>
      <form
        ref={logoutFormRef}
        className="hidden"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          try {
            await fetch("/api/auth/logout", { method: "POST" });
          } finally {
            router.push("/");
            router.refresh();
          }
        }}
      />
      <DropdownMenu
        trigger={
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-900 text-[11px] font-semibold uppercase text-white">
              {label.slice(0, 1)}
            </span>
            <span className="max-w-[9rem] truncate">{label}</span>
            <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
          </button>
        }
        items={items}
        align="end"
        aria-label={`Меню пользователя: ${label}`}
      />
    </>
  );
}
