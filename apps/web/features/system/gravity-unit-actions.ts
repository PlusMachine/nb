"use server";

import { getSessionUser } from "@/lib/auth";

import { defaultPreferredGravityUnit, type PreferredGravityUnit } from "./gravity-units";

/**
 * Для статически кэшируемых (SSG/ISR) страниц, которые намеренно не читают
 * cookie/сессию на сервере (BJCP-статьи, калькуляторы, публичная страница рецепта) —
 * догружается клиентским компонентом после гидратации, не ломая статический рендер.
 */
export const loadViewerPreferredGravityUnit = async (): Promise<PreferredGravityUnit> => {
  const user = await getSessionUser();
  return user?.preferredGravityUnit ?? defaultPreferredGravityUnit;
};
