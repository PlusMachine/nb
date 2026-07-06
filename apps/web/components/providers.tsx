"use client";

import { useEffect } from "react";
import { ToastProvider } from "@nb/ui";
import { ConsentProvider } from "@/components/legal/consent-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import type { ThemePreference } from "@/features/theme/theme";

const shouldAutoSelectNumberInput = (target: EventTarget | null): target is HTMLInputElement => {
  if (!(target instanceof HTMLInputElement)) {
    return false;
  }

  if (target.type !== "number" || target.disabled || target.readOnly) {
    return false;
  }

  if (target.dataset.nbNoAutoSelect === "true") {
    return false;
  }

  return target.value.trim().length > 0;
};

const selectFocusedNumberInput = (input: HTMLInputElement) => {
  window.requestAnimationFrame(() => {
    if (document.activeElement === input && shouldAutoSelectNumberInput(input)) {
      input.select();
    }
  });
};

export function Providers({
  children,
  initialThemePreference
}: {
  children: React.ReactNode;
  initialThemePreference: ThemePreference;
}) {
  useEffect(() => {
    let selectedOnFocus: HTMLInputElement | null = null;

    const handleFocusIn = (event: FocusEvent) => {
      if (!shouldAutoSelectNumberInput(event.target)) {
        selectedOnFocus = null;
        return;
      }

      selectedOnFocus = event.target;
      selectFocusedNumberInput(event.target);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.target !== selectedOnFocus || !shouldAutoSelectNumberInput(selectedOnFocus)) {
        return;
      }

      event.preventDefault();
      selectFocusedNumberInput(selectedOnFocus);
      selectedOnFocus = null;
    };

    const clearSelectionMarker = (event: Event) => {
      if (event.target === selectedOnFocus) {
        selectedOnFocus = null;
      }
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("input", clearSelectionMarker);
    document.addEventListener("keydown", clearSelectionMarker);
    document.addEventListener("focusout", clearSelectionMarker);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("input", clearSelectionMarker);
      document.removeEventListener("keydown", clearSelectionMarker);
      document.removeEventListener("focusout", clearSelectionMarker);
    };
  }, []);

  return (
    <ThemeProvider initialPreference={initialThemePreference}>
      <ToastProvider>
        <ConsentProvider>{children}</ConsentProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
