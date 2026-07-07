"use client";

import { createContext, useContext } from "react";

import type { FeedbackKind } from "@/features/feedback/contracts";

export type FeedbackPrefill = {
  kind?: FeedbackKind;
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
};

export type FeedbackContextValue = {
  open: (prefill?: FeedbackPrefill) => void;
};

export const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export const useFeedback = (): FeedbackContextValue => {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error("useFeedback must be used within FeedbackProvider");
  }
  return ctx;
};
