"use client";

import { useEffect } from "react";

export function useMenuIntent(id: "site" | "app", onOpenChange: (open: boolean) => void) {
  useEffect(() => {
    const triggers = Array.from(document.querySelectorAll<HTMLElement>(`[data-nb-menu-trigger="${id}"]`));
    const pending = triggers.find(trigger => trigger.dataset.nbMenuPending)?.dataset.nbMenuPending;
    for (const trigger of triggers) {
      trigger.dataset.nbMenuReady = "true";
      delete trigger.dataset.nbMenuPending;
      trigger.removeAttribute("aria-busy");
    }
    if (pending) onOpenChange(pending === "open");
    return () => {
      for (const trigger of triggers) delete trigger.dataset.nbMenuReady;
    };
  }, [id, onOpenChange]);
}
