"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

const pendingResetMs = 10000;

const isModifiedClick = (event: MouseEvent) => (
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0
);

const shouldTrackAnchor = (anchor: HTMLAnchorElement) => {
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || anchor.target || anchor.hasAttribute("download")) {
    return false;
  }

  const nextUrl = new URL(anchor.href, window.location.href);
  if (nextUrl.origin !== window.location.origin) {
    return false;
  }

  const currentUrl = new URL(window.location.href);
  return nextUrl.pathname !== currentUrl.pathname || nextUrl.search !== currentUrl.search;
};

export function AppRouteFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [pending, setPending] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    setPending(false);
  }, [pathname, searchParamsKey]);

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
      if (!(anchor instanceof HTMLAnchorElement) || !shouldTrackAnchor(anchor)) {
        return;
      }

      setPending(true);
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = setTimeout(() => {
        setPending(false);
        resetTimerRef.current = null;
      }, pendingResetMs);
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, []);

  if (!pending) {
    return null;
  }

  return (
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
  );
}
