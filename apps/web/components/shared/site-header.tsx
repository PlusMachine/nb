"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { publicLinks } from "@/lib/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const isActivePath = (pathname: string, href: string) => (
  pathname === href || pathname.startsWith(`${href}/`)
);

export function SiteHeader() {
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
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
      <div
        ref={containerRef}
        className="relative mx-auto flex h-14 max-w-7xl items-center justify-between gap-x-6 px-6"
      >
        <div className="flex items-center gap-x-6">
          <Link
            href="/"
            className="text-lg font-semibold tracking-[0.2em] text-foreground"
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
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
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
          <ThemeToggle className="hidden sm:inline-flex" />
          <Link
            href="/login"
            className="inline-flex items-center rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            Войти
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label={mobileOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={mobileOpen}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen ? (
          <div className="absolute inset-x-0 top-full z-50 border-b border-border bg-popover px-6 py-3 shadow-lg md:hidden">
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
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs font-medium text-muted-foreground">Тема</span>
              <ThemeToggle />
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
