"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useConsent } from "@/components/legal/consent-provider";
import { useIsKiosk } from "@/lib/use-is-kiosk";
import { analyticsDay, classifySource, sectionForPath } from "@/features/product-analytics/contracts";

export function ProductActivityTracker({ isAuthenticated }: { isAuthenticated: boolean }) {
  const pathname = usePathname();
  const { consent } = useConsent();
  const kiosk = useIsKiosk();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || consent !== "all" || kiosk) { lastPath.current = null; return; }
    const section = sectionForPath(pathname);
    if (!section) { lastPath.current = null; return; }
    const controller = new AbortController();
    const send = () => {
      const key = `${pathname}:${analyticsDay(new Date())}`;
      if (document.visibilityState !== "visible" || lastPath.current === key) return;
      lastPath.current = key;
      const width = window.innerWidth;
      void fetch("/api/analytics/activity", {
        method: "POST", credentials: "same-origin", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, source: classifySource(document.referrer, window.location.origin), device: width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop" })
      }).catch(() => { /* Analytics must never interrupt the product. */ });
    };
    // Defer until after React's development effect replay to avoid duplicate views.
    const timer = window.setTimeout(send, 0);
    document.addEventListener("visibilitychange", send);
    return () => { window.clearTimeout(timer); controller.abort(); document.removeEventListener("visibilitychange", send); };
  }, [pathname, consent, kiosk, isAuthenticated]);
  return null;
}
