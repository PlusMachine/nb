"use client";

import React from "react";

import { SectionErrorState } from "@/components/shared/section-error-state";

export default function DevicesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <SectionErrorState
      title='Не удалось загрузить "BrewForge"'
      message="Попробуйте обновить страницу. Если ошибка повторяется, вернитесь позже."
      reset={reset}
    />
  );
}
