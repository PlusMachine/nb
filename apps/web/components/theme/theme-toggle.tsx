"use client";

import React from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import type { ThemePreference } from "@/features/theme/theme";
import { useTheme } from "./theme-provider";

const options: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Светлая тема", Icon: Sun },
  { value: "dark", label: "Тёмная тема", Icon: Moon },
  { value: "system", label: "Как в системе", Icon: Monitor }
];

/** Сегментированный переключатель темы: три иконки, самоочевиден по aria/title. */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Тема оформления"
      className={`inline-flex items-center gap-0.5 rounded-full border border-border bg-muted p-0.5 ${className ?? ""}`}
    >
      {options.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
            className={`grid h-7 w-7 place-items-center rounded-full transition-colors ${
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
