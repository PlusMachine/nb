"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";

import { FeedbackContext, type FeedbackPrefill } from "./feedback-context";
import { FeedbackLauncher } from "./feedback-launcher";

const FeedbackWidget = dynamic(() => import("./feedback-widget").then(module => module.FeedbackWidget), {
  loading: () => <div role="status" className="fixed bottom-[calc(1rem+var(--nb-bottom-nav-h,0px))] right-4 z-[90] rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground shadow-lg">Открываем форму…</div>
});

export function FeedbackProvider({
  isAuthenticated,
  children
}: {
  isAuthenticated: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [prefill, setPrefill] = useState<FeedbackPrefill | undefined>(undefined);

  const openWidget = useCallback((next?: FeedbackPrefill) => {
    setPrefill(next);
    setHasOpened(true);
    setOpen(true);
  }, []);

  return (
    <FeedbackContext.Provider value={{ open: openWidget }}>
      {children}
      <FeedbackLauncher />
      {hasOpened ? <FeedbackWidget open={open} onOpenChange={setOpen} prefill={prefill} isAuthenticated={isAuthenticated} /> : null}
    </FeedbackContext.Provider>
  );
}
