import type { Metadata } from "next";
import React from "react";

import { LabelStudio } from "@/components/recipes/labels/label-studio";
import { buildCustomLabelSlots } from "@/features/labels/slots";

// Наклейки без рецепта: инструмент с ручным заполнением полей. Тот же
// генератор и те же шаблоны, что и на странице рецепта, — отличается только
// источник данных (форма вместо рецепта) и отсутствие QR: ссылаться не на что.

export const metadata: Metadata = {
  title: "Наклейки на бутылки",
  description: "Генератор наклеек на бутылки домашнего пива: заполните поля и скачайте готовый файл для печати (PNG или PDF).",
  alternates: {
    canonical: "/labels"
  },
  openGraph: {
    type: "website",
    url: "/labels",
    title: "Наклейки на бутылки",
    description: "Генератор наклеек на бутылки домашнего пива: заполните поля и скачайте готовый файл для печати."
  }
};

export default function LabelsPage() {
  return (
    <LabelStudio
      endpoint="/api/labels/custom"
      heading="Наклейки на бутылки"
      defaultSlots={buildCustomLabelSlots({})}
      qrAvailable={false}
      backLink={{ href: "/calculators", label: "К инструментам" }}
      resetLabel="Очистить поля"
    />
  );
}
