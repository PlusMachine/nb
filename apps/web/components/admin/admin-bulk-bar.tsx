"use client";

import React, { useEffect, useRef } from "react";

type AdminBulkBarProps = {
  // Сколько строк выбрано; при 0 бар не рендерится.
  count: number;
  // Кнопки массовых действий.
  children?: React.ReactNode;
  onClear?: () => void;
  className?: string;
};

const formatSelected = (count: number) => `Выбрано: ${count}`;

export function AdminBulkBar({ count, children, onClear, className = "" }: AdminBulkBarProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const visible = count > 0;

  useEffect(() => {
    const node = barRef.current;
    if (!node) {
      // Бар скрыт — переменную снимаем, иначе тосты и кнопка «Обратная связь»
      // продолжат подниматься на его высоту (Toast Viewport суммирует переменные).
      document.documentElement.style.removeProperty("--nb-sticky-bar-h");
      return;
    }

    const updateHeightVar = () => {
      document.documentElement.style.setProperty("--nb-sticky-bar-h", `${node.offsetHeight}px`);
    };

    updateHeightVar();
    const observer = new ResizeObserver(updateHeightVar);
    observer.observe(node);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--nb-sticky-bar-h");
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <div
      ref={barRef}
      role="region"
      aria-label="Массовые действия"
      className={`fixed inset-x-0 bottom-[var(--chrome-bottom,0px)] z-40 flex flex-wrap items-center gap-3 border-t border-border bg-card px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-6px_16px_rgba(0,0,0,0.08)] ${className}`}
    >
      <span className="text-sm font-medium text-foreground" aria-live="polite">
        {formatSelected(count)}
      </span>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="min-h-9 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Снять выбор
        </button>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
