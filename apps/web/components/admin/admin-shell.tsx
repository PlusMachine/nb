"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Sheet } from "@nb/ui";
import type { UserRole } from "@nb/auth";

import { ThemeToggle } from "@/components/theme/theme-toggle";

import { AdminSidebarNav } from "./admin-sidebar-nav";

type AdminShellProps = {
  children: React.ReactNode;
  role: UserRole;
};

const AdminWordmark = ({ onClick }: { onClick?: () => void }) => (
  <Link
    href="/admin"
    onClick={onClick}
    className="flex items-baseline gap-2 text-lg font-semibold tracking-[0.2em] text-foreground"
    style={{ fontFamily: "var(--font-display)" }}
  >
    NB
    <span className="text-xs font-medium tracking-[0.16em] text-muted-foreground">АДМИНКА</span>
  </Link>
);

export function AdminShell({ children, role }: AdminShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    // Drawer — портированный Sheet, поэтому lg:hidden на нём не действует: при
    // пересечении брейкпоинта закрываем его вручную, иначе он останется висеть
    // поверх десктопного сайдбара.
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setDrawerOpen(false);
      }
    };

    desktopQuery.addEventListener("change", handleBreakpointChange);
    return () => {
      desktopQuery.removeEventListener("change", handleBreakpointChange);
    };
  }, []);

  return (
    // --chrome-top: высота мобильной шапки (липкие тулбары разделов отсчитывают
    // от неё). Фиксированного низа у админки нет, поэтому --chrome-bottom = 0:
    // липкий бар массовых действий публикует свою высоту в --nb-sticky-bar-h.
    <div className="[--chrome-bottom:0px] [--chrome-top:3.5rem] lg:flex lg:[--chrome-top:0px]">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-background/80 px-3 py-4 backdrop-blur lg:flex">
        <div className="mb-4 px-3">
          <AdminWordmark />
        </div>
        <AdminSidebarNav role={role} />
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
        <AdminWordmark />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Открыть меню"
            className="grid min-h-11 min-w-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      <Sheet
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        side="left"
        title={<AdminWordmark onClick={() => setDrawerOpen(false)} />}
      >
        <AdminSidebarNav role={role} onNavigate={() => setDrawerOpen(false)} />
      </Sheet>

      <main className="min-w-0 flex-1">
        {/* pb резервирует место под липкий бар массовых действий (--nb-sticky-bar-h)
            и баннер cookie-согласия, чтобы они не закрывали низ таблицы. */}
        <div className="mx-auto max-w-6xl px-4 py-6 pb-[calc(2.5rem+var(--nb-sticky-bar-h,0px)+var(--nb-cookie-banner-h,0px))] sm:px-6">
          {children}
        </div>
      </main>
    </div>
  );
}
