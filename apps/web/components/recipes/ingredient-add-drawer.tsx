"use client";

import React from "react";

export function IngredientAddDrawer({
  open,
  isMobile,
  children,
  onClose
}: {
  open: boolean;
  isMobile: boolean;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const backdropPointerDownStartedRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Intentionally reference isMobile so it's considered "used" by the type checker,
  // even though layout responsiveness is fully driven by CSS breakpoints below.
  void isMobile;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-zinc-950/60 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Редактор ингредиента рецепта"
      onPointerDown={(event) => {
        backdropPointerDownStartedRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPointerDownStartedRef.current && event.target === event.currentTarget) {
          onClose();
        }

        backdropPointerDownStartedRef.current = false;
      }}
    >
      <div
        className="relative z-[101] flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[88vh] sm:max-w-3xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none flex shrink-0 justify-center pt-2 pb-1 sm:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-zinc-300" />
        </div>
        {children}
      </div>
    </div>
  );
}
