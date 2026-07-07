import type { ComponentType } from "react";
import { Droplets, FlaskConical, Hop, Package, Wheat } from "lucide-react";

import type { IngredientCategory } from "@/features/ingredients/contracts";

// Единый источник иконки/цвета категории — используют и пилюли тулбара
// каталога (ingredient-catalog-toolbar.tsx, "use client"), и заголовки секций
// хаба (/catalog без лендинга, app/(public)/catalog/content.tsx — серверный
// компонент). Вынесен в отдельный модуль без "use client": импорт плоских
// данных из клиентского файла в серверный компонент небезопасен (RSC
// заворачивает экспорты "use client"-модуля в клиентские ссылки). См.
// notes/catalog-hub-redesign.md, S2.
export type CategoryMeta = {
  icon: ComponentType<{ className?: string }>;
  color: string;
  activeColor: string;
  activeBg: string;
  activeRing: string;
};

export const categoryMeta: Record<IngredientCategory, CategoryMeta> = {
  fermentable: {
    icon: Wheat,
    color: "text-amber-600 dark:text-amber-400",
    activeColor: "text-amber-800 dark:text-amber-300",
    activeBg: "bg-amber-50 dark:bg-amber-500/15",
    activeRing: "ring-amber-300 dark:ring-amber-500/30"
  },
  hop: {
    icon: Hop,
    color: "text-emerald-600 dark:text-emerald-400",
    activeColor: "text-emerald-800 dark:text-emerald-300",
    activeBg: "bg-emerald-50 dark:bg-emerald-500/15",
    activeRing: "ring-emerald-300 dark:ring-emerald-500/30"
  },
  yeast: {
    icon: FlaskConical,
    color: "text-violet-600 dark:text-violet-400",
    activeColor: "text-violet-800 dark:text-violet-300",
    activeBg: "bg-violet-50 dark:bg-violet-500/15",
    activeRing: "ring-violet-300 dark:ring-violet-500/30"
  },
  water_treatment: {
    icon: Droplets,
    color: "text-sky-600 dark:text-sky-400",
    activeColor: "text-sky-800 dark:text-sky-300",
    activeBg: "bg-sky-50 dark:bg-sky-500/15",
    activeRing: "ring-sky-300 dark:ring-sky-500/30"
  },
  consumable: {
    icon: Package,
    color: "text-muted-foreground",
    activeColor: "text-foreground",
    activeBg: "bg-muted",
    activeRing: "ring-border"
  }
};
