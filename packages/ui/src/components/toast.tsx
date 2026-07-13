"use client";

import * as React from "react";
import * as RadixToast from "@radix-ui/react-toast";

import { cn } from "../lib/utils";

export type ToastAction = { label: string; onClick: () => void };
export type ToastTone = "default" | "success" | "warning" | "danger";

export type ToastOptions = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** По умолчанию 5000. Передайте Infinity, чтобы не закрывать автоматически. */
  durationMs?: number;
  action?: ToastAction;
};

type ToastRecord = ToastOptions & { id: string };

type ToastContextValue = {
  show: (options: ToastOptions) => { dismiss: () => void };
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 5000;

let toastSeq = 0;
const nextToastId = () => {
  toastSeq += 1;
  return `toast-${toastSeq}`;
};

const toneToRole: Record<ToastTone, "status" | "alert"> = {
  default: "status",
  success: "status",
  warning: "alert",
  danger: "alert"
};

const toneToClassName: Record<ToastTone, string> = {
  default: "border-border bg-popover text-popover-foreground",
  success: "border-success/30 bg-success-subtle text-success-subtle-foreground",
  warning: "border-warning/30 bg-warning-subtle text-warning-subtle-foreground",
  danger: "border-destructive-border bg-destructive-subtle text-destructive-subtle-foreground"
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = React.useCallback(
    (options: ToastOptions) => {
      const id = nextToastId();
      setToasts((current) => [...current, { ...options, id }]);
      return { dismiss: () => dismiss(id) };
    },
    [dismiss]
  );

  const contextValue = React.useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={contextValue}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {toasts.map((toast) => {
          const tone = toast.tone ?? "default";
          const durationMs = toast.durationMs ?? DEFAULT_DURATION_MS;
          return (
            <RadixToast.Root
              key={toast.id}
              duration={durationMs}
              role={toneToRole[tone]}
              onOpenChange={(open) => {
                if (!open) {
                  dismiss(toast.id);
                }
              }}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 shadow-lg data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]",
                toneToClassName[tone]
              )}
            >
              <div className="flex-1">
                <RadixToast.Title className="text-sm font-medium">{toast.title}</RadixToast.Title>
                {toast.description ? (
                  <RadixToast.Description className="mt-1 text-sm opacity-80">
                    {toast.description}
                  </RadixToast.Description>
                ) : null}
              </div>
              {toast.action ? (
                <RadixToast.Action asChild altText={toast.action.label}>
                  <button
                    type="button"
                    onClick={toast.action.onClick}
                    className="shrink-0 rounded-lg border border-current/20 px-2.5 py-1.5 text-xs font-medium"
                  >
                    {toast.action.label}
                  </button>
                </RadixToast.Action>
              ) : null}
              <RadixToast.Close
                aria-label="Закрыть"
                className="shrink-0 rounded-lg p-1 text-current/60 transition-colors hover:bg-foreground/10"
              >
                <span aria-hidden="true">&times;</span>
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}
        {/*
          bottom: та же композиция переменных нижнего хрома, что и у плавающей
          кнопки фидбека (cookie-баннер + нижняя нав-панель), плюс липкий бар
          результата калькуляторов (--nb-sticky-bar-h, пишет другой компонент,
          фолбэк 0px), чтобы тост не наезжал на них.
          left-4 + right-4 без явного width: ширина считается браузером как
          доступное пространство между ними (на узких экранах ~360px раньше
          обрезался слева из-за w-full max-w-sm без left), max-w-sm сверху
          ограничивает её на широких экранах.
        */}
        <RadixToast.Viewport className="fixed bottom-[calc(1rem+var(--nb-cookie-banner-h,0px)+var(--nb-bottom-nav-h,0px)+var(--nb-sticky-bar-h,0px))] left-4 right-4 z-[120] flex max-w-sm flex-col gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
