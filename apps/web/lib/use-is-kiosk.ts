"use client";

import { useSearchParams } from "next/navigation";

// Киоск-режим пульта устройства (?kiosk=1, см. docs/brewforge-web-hmi.md):
// второстепенный хром (плавающие кнопки, баннеры) в нём скрывается, чтобы не
// перекрывать полноэкранный пульт. device-console.tsx считает свой флаг
// самостоятельно (другая зона) — этот хук для остального UI.
export function useIsKiosk(): boolean {
  const searchParams = useSearchParams();
  return searchParams.get("kiosk") === "1";
}
