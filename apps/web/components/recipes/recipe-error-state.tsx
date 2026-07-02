"use client";

import React from "react";

import { SectionErrorState } from "@/components/shared/section-error-state";

/** @deprecated Используйте {@link SectionErrorState} напрямую в новых error.tsx. Оставлено ради существующих recipes/*-границ. */
export function RecipeErrorState({ title, message, reset }: { title: string; message: string; reset: () => void }) {
  return <SectionErrorState title={title} message={message} reset={reset} />;
}
