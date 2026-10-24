"use client";

import React from "react";
import { Check, Hop, Monitor, Moon, Sun } from "lucide-react";
import { Popover } from "@nb/ui";

import type { ThemePreference } from "@/features/theme/theme";
import { useTheme } from "./theme-provider";

const options: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Светлая тема", Icon: Sun },
  { value: "dark", label: "Тёмная тема", Icon: Moon },
  { value: "system", label: "Как в системе", Icon: Monitor }
];

function ThemeMenuEscapeGuard({ close }: { close: () => void }) {
  React.useEffect(() => {
    // Вложенное меню обрабатывает Escape раньше capture-обработчика панели.
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [close]);
  return null;
}

export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference, skin, setSkin } = useTheme();
  const hopActive = skin === "hop";
  const CurrentIcon = options.find(option => option.value === preference)!.Icon;
  const skinLabel = hopActive ? "Оформление «Хмель» включено" : "Оформление «Хмель» выключено";
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [portalContainer, setPortalContainer] = React.useState<HTMLElement | null>(null);

  return (
    <div className={`inline-flex items-center ${className ?? ""}`}>
      <Popover
        align="end"
        aria-label="Тема оформления"
        portalContainer={portalContainer}
        onOpenChange={open => {
          // В боковой панели сохраняем меню внутри её области фокуса.
          if (open) setPortalContainer(triggerRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null);
        }}
        contentClassName="pointer-events-auto w-64 max-w-[calc(100vw-16px)] p-1"
        trigger={({ open }) => (
          <button
            ref={triggerRef}
            type="button"
            aria-label="Тема оформления"
            title="Тема оформления"
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border text-foreground transition-colors hover:bg-muted ${open ? "bg-muted" : "bg-card"}`}
          >
            <CurrentIcon className="h-4 w-4" aria-hidden />
          </button>
        )}
      >
        {({ close }) => (
          <div
            // Меню темы портируется за пределы мобильной навигации.
            // Выбор внутри него не должен закрывать родительскую навигацию.
            onMouseDown={event => event.stopPropagation()}
          >
            <ThemeMenuEscapeGuard close={close} />
            <div role="radiogroup" aria-label="Тема оформления">
              {options.map(({ value, label, Icon }, index) => {
                const active = preference === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    tabIndex={active ? 0 : -1}
                    onClick={() => {
                      setPreference(value);
                      close();
                    }}
                    onKeyDown={event => {
                      let nextIndex: number;
                      if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = (index + 1) % options.length;
                      else if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextIndex = (index + options.length - 1) % options.length;
                      else if (event.key === "Home") nextIndex = 0;
                      else if (event.key === "End") nextIndex = options.length - 1;
                      else return;
                      event.preventDefault();
                      setPreference(options[nextIndex]!.value);
                      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus();
                    }}
                    className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-muted ${active ? "bg-muted" : ""}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1">{label}</span>
                    {active ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
            <div className="mx-2 my-1 h-px bg-border" role="separator" />
            <button
              type="button"
              aria-pressed={hopActive}
              onClick={() => setSkin(hopActive ? "classic" : "hop")}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-muted"
            >
              <Hop className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1">{skinLabel}</span>
              {hopActive ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : null}
            </button>
          </div>
        )}
      </Popover>
    </div>
  );
}
