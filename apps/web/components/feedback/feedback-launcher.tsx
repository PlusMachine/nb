"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";

import { useIsKiosk } from "@/lib/use-is-kiosk";

import { useFeedback } from "./feedback-context";

const FAB_HEIGHT_VAR = "--nb-fab-h";

// Плавающая кнопка на всех страницах, кроме админки и киоск-режима.
// Позиция подстроена под нижнюю мобильную нав-панель (--nb-bottom-nav-h), открытый
// cookie-баннер (--nb-cookie-banner-h) и липкий бар результата калькулятора
// (--nb-sticky-bar-h, у анонима сидит на bottom:0 — без учёта кнопка легла бы под него,
// обе кнопка и бар на z-40) — все переменные пишет соответствующий владелец и
// сбрасывает при скрытии/анмаунте, у читателя фолбэк 0px.
//
// Кнопка сама, по тому же паттерну, публикует --nb-fab-h — СВОЙ вклад в отступ
// низа контента (высота + базовый зазор 1rem), чтобы контейнеры контента (см.
// AppShell/PublicShell) и toast-viewport могли зарезервировать место под неё и
// не класть интерактив/тосты ей под низ.
export function FeedbackLauncher() {
  const { open } = useFeedback();
  const pathname = usePathname();
  const isKiosk = useIsKiosk();
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const isAdmin = pathname?.startsWith("/admin");
  const hidden = isKiosk || isAdmin;

  useEffect(() => {
    const node = buttonRef.current;
    if (hidden || !node) {
      // Кнопка не смонтирована (админка/киоск) — резервировать под неё нечего.
      document.documentElement.style.setProperty(FAB_HEIGHT_VAR, "0px");
      return;
    }

    const updateFabHeightVar = () => {
      // Только СОБСТВЕННЫЙ вклад кнопки: её высота + базовый зазор 1rem. Cookie-
      // баннер/нижняя нав-панель/липкий бар сюда намеренно не входят — они уже
      // отдельные слагаемые и в bottom-формуле самой кнопки, и в pb-формулах
      // контейнеров контента; сложить их здесь ещё раз значило бы посчитать дважды.
      document.documentElement.style.setProperty(
        FAB_HEIGHT_VAR,
        `calc(${node.getBoundingClientRect().height}px + 1rem)`
      );
    };

    updateFabHeightVar();
    const observer = new ResizeObserver(updateFabHeightVar);
    observer.observe(node);

    return () => {
      observer.disconnect();
      // Сброс обязателен: тот же паттерн, что у cookie-баннера — иначе резерв
      // под кнопку останется висеть в отступах контента и после её анмаунта.
      document.documentElement.style.setProperty(FAB_HEIGHT_VAR, "0px");
    };
  }, [hidden]);

  if (hidden) {
    return null;
  }

  return (
    <button
      ref={buttonRef}
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
