"use client";

import { useCallback, useState } from "react";

import { FeedbackContext, type FeedbackPrefill } from "./feedback-context";
import { FeedbackLauncher } from "./feedback-launcher";
import { FeedbackWidget } from "./feedback-widget";

export function FeedbackProvider({
  isAuthenticated,
  children
}: {
  isAuthenticated: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<FeedbackPrefill | undefined>(undefined);

  const openWidget = useCallback((next?: FeedbackPrefill) => {
    setPrefill(next);
    setOpen(true);
  }, []);

  return (
    <FeedbackContext.Provider value={{ open: openWidget }}>
      {children}
      <FeedbackLauncher />
      <FeedbackWidget open={open} onOpenChange={setOpen} prefill={prefill} isAuthenticated={isAuthenticated} />
    </FeedbackContext.Provider>
  );
}
