"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  analyticsAllowed,
  readClientAgeAck,
  readClientConsent,
  writeClientAgeAck,
  writeClientConsent,
  type CookieConsent
} from "@/lib/consent";
import { setAnalyticsEnabled } from "@/lib/analytics";

import { CookieConsentBanner } from "./cookie-consent-banner";

type ConsentContextValue = {
  consent: CookieConsent | null;
  ageAck: boolean;
  // Зафиксировать выбор пользователя (cookie согласия + отметка 18+) и закрыть баннер.
  decide: (choice: CookieConsent) => void;
  // Снова показать баннер (кнопка «Изменить настройки cookie»).
  reopen: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export const useConsent = (): ConsentContextValue => {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    throw new Error("useConsent должен использоваться внутри ConsentProvider");
  }
  return ctx;
};

// Решает вопросы cookie-согласия и возрастной отметки 18+ на клиенте (после
// гидратации), чтобы не переводить весь сайт в динамический рендеринг ради баннера.
// Аналитику (PostHog) включает ТОЛЬКО при согласии «all».
export function ConsentProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  const [ageAck, setAgeAck] = useState(false);
  // reopen поднимает баннер даже при уже сохранённом согласии.
  const [forceOpen, setForceOpen] = useState(false);

  useEffect(() => {
    setConsent(readClientConsent());
    setAgeAck(readClientAgeAck());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setAnalyticsEnabled(analyticsAllowed(consent));
  }, [mounted, consent]);

  const decide = useCallback((choice: CookieConsent) => {
    writeClientConsent(choice);
    writeClientAgeAck();
    setConsent(choice);
    setAgeAck(true);
    setForceOpen(false);
  }, []);

  const reopen = useCallback(() => setForceOpen(true), []);

  const value = useMemo<ConsentContextValue>(
    () => ({ consent, ageAck, decide, reopen }),
    [consent, ageAck, decide, reopen]
  );

  const showBanner = mounted && (consent === null || forceOpen);

  return (
    <ConsentContext.Provider value={value}>
      {children}
      {showBanner ? <CookieConsentBanner onDecide={decide} showAgeNotice={!ageAck} /> : null}
    </ConsentContext.Provider>
  );
}
