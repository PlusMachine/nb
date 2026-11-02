"use client";

import React from "react";

/** Sticky within the dialog's scroll area; the fields retain their natural height. */
export function InventoryFormActions({ children, sticky = true }: { children: React.ReactNode; sticky?: boolean }) {
  return (
    <div className={sticky ? "sticky bottom-0 z-20 -mx-5 -mb-5 flex flex-wrap items-center gap-2 border-t border-border bg-popover px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.25)]" : "flex"} data-testid="inventory-form-actions">
      {children}
    </div>
  );
}
