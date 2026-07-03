"use client";

import React from "react";
import { NotebookPen, Plus } from "lucide-react";

// Плавный скролл к секции по id (замер/заметка живут ниже на странице) и фокус
// в её первое поле ввода — иначе клик по доку выглядит так, будто ничего не произошло.
const goToSection = (id: string) => {
  if (typeof document === "undefined") {
    return;
  }
  const section = document.getElementById(id);
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
  section?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
};

/**
 * Быстрый док активной варки: «+ Замер» и «+ Заметка» в зоне пальца. Закреплён
 * над нижним таб-баром (bottom-14 = его h-14), пока тот виден — до lg. На lg+
 * секции журнала и заметок уже рядом на экране, отдельный док там не нужен.
 */
export function BrewQuickDock() {
  return (
    <div className="sticky bottom-14 z-50 -mx-4 flex gap-2 border-t border-zinc-100 bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={() => goToSection("brew-journal")}
        className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Замер
      </button>
      <button
        type="button"
        onClick={() => goToSection("brew-notes")}
        className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
      >
        <NotebookPen className="h-4 w-4" aria-hidden />
        Заметка
      </button>
    </div>
  );
}
