"use client";

import { Button } from "@nb/ui";

import { useConsent } from "./consent-provider";

// Кнопка «Изменить настройки cookie» на странице Политики cookie: заново открывает
// баннер согласия, чтобы пользователь мог поменять решение.
export function CookieSettingsButton() {
  const { reopen } = useConsent();
  return (
    <Button type="button" variant="outline" size="sm" onClick={reopen}>
      Изменить настройки cookie
    </Button>
  );
}
