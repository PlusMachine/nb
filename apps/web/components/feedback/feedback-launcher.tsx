"use client";

import { usePathname } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";

import { useIsKiosk } from "@/lib/use-is-kiosk";

import { useFeedback } from "./feedback-context";

// Плавающая кнопка на всех страницах, кроме админки и киоск-режима.
// Позиция подстроена под нижнюю мобильную нав-панель (--nb-bottom-nav-h), открытый
// cookie-баннер (--nb-cookie-banner-h) и липкий бар результата калькулятора
// (--nb-sticky-bar-h, у анонима сидит на bottom:0 — без учёта кнопка легла бы под него,
// обе кнопка и бар на z-40) — все переменные пишет соответствующий владелец и
// сбрасывает при скрытии/анмаунте, у читателя фолбэк 0px.
export function FeedbackLauncher() {
  const { open } = useFeedback();
  const pathname = usePathname();
  const isKiosk = useIsKiosk();

  const isAdmin = pathname?.startsWith("/admin");
  if (isKiosk || isAdmin) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => open()}
      aria-label="Обратная связь"
      className="fixed bottom-[calc(1rem+var(--nb-cookie-banner-h,0px)+var(--nb-bottom-nav-h,0px)+var(--nb-sticky-bar-h,0px))] right-4 z-40 inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2.5 text-sm font-medium text-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <MessageSquarePlus className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Обратная связь</span>
    </button>
  );
}
