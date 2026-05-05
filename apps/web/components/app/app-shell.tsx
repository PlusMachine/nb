"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import {
  CatalogPageSkeleton,
  EquipmentPageSkeleton,
  GenericSectionSkeleton,
  IngredientsPageSkeleton,
  RecipesPageSkeleton
} from "@/components/app/section-skeletons";

import { AppShellNavigation } from "./app-shell-navigation";

type AppShellProps = {
  children: React.ReactNode;
  email: string;
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

  if (pathname.startsWith("/app/catalog")) {
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

const getInternalHrefInfo = (href: string, currentPathname: string, currentSearchParamsKey: string) => {
  const nextUrl = new URL(href, window.location.href);
  if (nextUrl.origin !== window.location.origin) {
    return null;
  }

  const nextSearchParamsKey = nextUrl.search.startsWith("?") ? nextUrl.search.slice(1) : nextUrl.search;

  if (nextUrl.pathname === currentPathname && nextSearchParamsKey === currentSearchParamsKey) {
    return null;
  }

  return {
    pathname: nextUrl.pathname,
    changedPathname: nextUrl.pathname !== currentPathname
  };
};

export function AppShell({ children, email }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [pendingPathname, setPendingPathname] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState(false);
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
    const nextRoute = getInternalHrefInfo(href, pathname, searchParamsKey);
    if (!nextRoute) {
      return;
    }

    if (nextRoute.changedPathname) {
      setPendingPathname(nextRoute.pathname);
      window.scrollTo({ top: 0, behavior: "auto" });
    } else {
      setPendingPathname(null);
    }

    scheduleProgress();
  };

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

      const nextHref = anchor.href;
      if (!getInternalTargetPath(anchor)) {
        return;
      }

      beginPendingNavigation(nextHref);
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
    <div className="mx-auto max-w-6xl p-6">
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
      <AppShellNavigation email={email} onNavigateStart={beginPendingNavigation} />
      {pendingPathname && pendingPathname !== pathname ? resolvePendingSkeleton(pendingPathname) : children}
    </div>
  );
}
