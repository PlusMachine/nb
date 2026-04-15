"use client";

import React from "react";

export function IngredientAddDrawer({
  open,
  children,
  onClose
}: {
  open: boolean;
  isMobile: boolean;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const backdropPointerDownStartedRef = React.useRef(false);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-zinc-950/55 sm:items-center"
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
        className="relative z-[101] max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
