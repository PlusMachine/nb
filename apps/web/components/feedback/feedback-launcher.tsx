"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";

import { useFeedback } from "./feedback-context";

// Плавающая кнопка на всех страницах, кроме админки и киоск-режима.
export function FeedbackLauncher() {
  const { open } = useFeedback();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isKiosk = searchParams.get("kiosk") === "1";
  const isAdmin = pathname?.startsWith("/admin");
  if (isKiosk || isAdmin) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => open()}
      aria-label="Обратная связь"
      className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2.5 text-sm font-medium text-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <MessageSquarePlus className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Обратная связь</span>
    </button>
  );
}
