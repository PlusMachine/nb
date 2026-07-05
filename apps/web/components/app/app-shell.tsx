"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2, Menu } from "lucide-react";

import { Sheet } from "@nb/ui";
import {
  CatalogPageSkeleton,
  EquipmentPageSkeleton,
  GenericSectionSkeleton,
  IngredientsPageSkeleton,
  RecipesPageSkeleton
} from "@/components/app/section-skeletons";
import { isNavItemActive, primaryNavItems, resolveContentWidthClass, type AppChromeUser } from "@/lib/navigation";

import { AppSidebarNav } from "./app-sidebar-nav";

type AppShellProps = {
  children: React.ReactNode;
  user: AppChromeUser;
};

const pendingDisplayDelayMs = 140;
const pendingResetMs = 10000;

const isModifiedClick = (event: MouseEvent) => (
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0
);

const getInternalTargetPath = (anchor: HTMLAnchorElement) => {
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || anchor.target || anchor.hasAttribute("download")) {
    return null;
  }

  const nextUrl = new URL(anchor.href, window.location.href);
  if (nextUrl.origin !== window.location.origin) {
    return null;
  }

  const currentUrl = new URL(window.location.href);
  if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search) {
    return null;
  }

  return {
    pathname: nextUrl.pathname,
    changedPathname: nextUrl.pathname !== currentUrl.pathname
  };
};

const resolvePendingSkeleton = (pathname: string) => {
  if (pathname.startsWith("/app/ingredients")) {
    return <IngredientsPageSkeleton />;
  }

  if (pathname.startsWith("/catalog")) {
    return <CatalogPageSkeleton />;
  }

  if (pathname.startsWith("/app/recipes")) {
    return <RecipesPageSkeleton />;
  }

  if (pathname.startsWith("/app/equipment")) {
    return <EquipmentPageSkeleton />;
  }

  return <GenericSectionSkeleton />;
};

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [pendingPathname, setPendingPathname] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const displayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (displayTimerRef.current) {
      clearTimeout(displayTimerRef.current);
      displayTimerRef.current = null;
    }
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    setPendingPathname(null);
    setShowProgress(false);
    setDrawerOpen(false);
  }, [pathname, searchParamsKey]);

  const scheduleProgress = () => {
    if (displayTimerRef.current) {
      clearTimeout(displayTimerRef.current);
    }
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    displayTimerRef.current = setTimeout(() => {
      setShowProgress(true);
      displayTimerRef.current = null;
      resetTimerRef.current = setTimeout(() => {
        setPendingPathname(null);
        setShowProgress(false);
        resetTimerRef.current = null;
      }, pendingResetMs);
    }, pendingDisplayDelayMs);
  };

  const beginPendingNavigation = (href: string) => {
    const nextUrl = new URL(href, window.location.href);
    if (nextUrl.origin !== window.location.origin) {
      return;
    }

    const nextSearchParamsKey = nextUrl.search.startsWith("?") ? nextUrl.search.slice(1) : nextUrl.search;
    if (nextUrl.pathname === pathname && nextSearchParamsKey === searchParamsKey) {
      return;
    }

    if (nextUrl.pathname !== pathname) {
      setPendingPathname(nextUrl.pathname);
      window.scrollTo({ top: 0, behavior: "auto" });
    } else {
      setPendingPathname(null);
    }

    scheduleProgress();
  };

  useEffect(() => {
    // Drawer — портированный Sheet, поэтому классы lg:hidden на нём не действуют:
    // при пересечении брейкпоинта (ресайз/поворот) закрываем его вручную, иначе
    // мобильный drawer останется висеть поверх десктопного сайдбара.
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

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || isModifiedClick(event)) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      if (!getInternalTargetPath(anchor)) {
        return;
      }

      beginPendingNavigation(anchor.href);
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      if (displayTimerRef.current) {
        clearTimeout(displayTimerRef.current);
        displayTimerRef.current = null;
      }
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, [pathname, searchParamsKey]);

  return (
    <div className="[--chrome-top:3.5rem] lg:flex lg:[--chrome-top:0px]">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-zinc-200 bg-white/80 px-3 py-4 backdrop-blur lg:flex">
        <Link
          href="/app"
          className="mb-4 block px-3 text-lg font-semibold tracking-[0.2em] text-zinc-950"
          style={{ fontFamily: "var(--font-display)" }}
        >
          NB
        </Link>
        <AppSidebarNav user={user} />
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <Link
          href="/app"
          className="text-lg font-semibold tracking-[0.2em] text-zinc-950"
          style={{ fontFamily: "var(--font-display)" }}
        >
          NB
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Открыть меню"
          className="rounded-lg p-2 text-zinc-700 transition-colors hover:bg-zinc-100"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Portal Sheet — lg:hidden не сработает на портированном контенте, поэтому
          открытие гейтится состоянием drawerOpen, которое взводят только
          мобильные триггеры (кнопка в шапке и «Ещё» в нижней навигации). */}
      <Sheet
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        side="left"
        title={
          <Link
            href="/app"
            onClick={() => setDrawerOpen(false)}
            className="text-lg font-semibold tracking-[0.2em] text-zinc-950"
            style={{ fontFamily: "var(--font-display)" }}
          >
            NB
          </Link>
        }
      >
        <AppSidebarNav user={user} onNavigate={() => setDrawerOpen(false)} />
      </Sheet>

      <main className="min-w-0 flex-1">
        {showProgress ? (
          <>
            <div className="fixed inset-x-0 top-0 z-[200] h-1 bg-zinc-200" aria-hidden="true">
              <div className="h-full w-1/3 animate-route-progress bg-zinc-950" />
            </div>
            <div
              className="fixed right-4 top-4 z-[201] inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-lg"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Загрузка
            </div>
          </>
        ) : null}
        <div className={`mx-auto px-4 py-6 pb-24 sm:px-6 lg:pb-10 ${resolveContentWidthClass(pathname)}`}>
          {pendingPathname && pendingPathname !== pathname ? resolvePendingSkeleton(pendingPathname) : children}
        </div>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex h-14 border-t border-zinc-200 bg-white/95 backdrop-blur lg:hidden"
        aria-label="Быстрая навигация"
      >
        {primaryNavItems.map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active ? "text-zinc-950" : "text-zinc-500"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-zinc-500"
        >
          <Menu className="h-5 w-5" />
          Ещё
        </button>
      </nav>
    </div>
  );
}
