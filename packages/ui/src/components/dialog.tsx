"use client";

import * as React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "../lib/utils";

export type DialogSize = "sm" | "md" | "lg" | "sheet";

/**
 * Guard для «грязных» форм: любая попытка закрытия (Esc, клик по фону,
 * DialogCloseButton) при isDirty()===true не закрывает диалог, а вызывает
 * onGuardedClose (обычно — показ подтверждения «отменить изменения?»).
 */
export type DialogGuard = {
  isDirty: () => boolean;
  onGuardedClose: () => void;
};

type DialogContextValue = { requestClose: () => void };
const DialogContext = React.createContext<DialogContextValue | null>(null);

const sizeMaxWidthClassName: Record<DialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-2xl",
  sheet: "sm:max-w-3xl"
};

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Обязателен для aria (aria-labelledby); визуально можно скрыть через hideTitle. */
  title: string;
  hideTitle?: boolean;
  description?: string;
  size?: DialogSize;
  guard?: DialogGuard;
  children: React.ReactNode;
};

export function Dialog({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  description,
  size = "md",
  guard,
  children
}: DialogProps) {
  const requestClose = React.useCallback(() => {
    if (guard?.isDirty()) {
      guard.onGuardedClose();
      return;
    }
    onOpenChange(false);
  }, [guard, onOpenChange]);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) {
        onOpenChange(true);
        return;
      }
      requestClose();
    },
    [onOpenChange, requestClose]
  );

  const contextValue = React.useMemo(() => ({ requestClose }), [requestClose]);

  return (
    <RadixDialog.Root open={open} onOpenChange={handleOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="animate-modal-backdrop fixed inset-0 z-[100] bg-zinc-950/50 backdrop-blur-[2px]" />
        <div className="pointer-events-none fixed inset-0 z-[101] flex items-end justify-center sm:items-center sm:p-4">
          <RadixDialog.Content
            className={cn(
              "animate-modal-content pointer-events-auto max-h-[94vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-popover text-popover-foreground shadow-2xl focus:outline-none sm:rounded-2xl",
              sizeMaxWidthClassName[size]
            )}
            {...(!description ? { "aria-describedby": undefined } : {})}
          >
            <RadixDialog.Title className={cn("text-base font-semibold text-foreground", hideTitle && "sr-only")}>
              {title}
            </RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="sr-only">{description}</RadixDialog.Description>
            ) : null}
            <DialogContext.Provider value={contextValue}>{children}</DialogContext.Provider>
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function DialogHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-popover/95 px-5 py-4 backdrop-blur-sm sm:rounded-t-2xl",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function DialogFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 border-t border-border p-5 sm:flex-row sm:justify-end", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function DialogCloseButton({
  className,
  onClick,
  "aria-label": ariaLabel = "Закрыть",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = React.useContext(DialogContext);
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(event) => {
        onClick?.(event);
        context?.requestClose();
      }}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className
      )}
      {...props}
    >
      <X className="h-4 w-4" />
    </button>
  );
}
