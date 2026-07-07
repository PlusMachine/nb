"use client";

import { MessageSquareWarning } from "lucide-react";

import type { FeedbackKind } from "@/features/feedback/contracts";

import { useFeedback } from "./feedback-context";

type FeedbackReportLinkProps = {
  entityType?: string;
  entityId?: string;
  entityLabel?: string;
  kind?: FeedbackKind;
  children?: React.ReactNode;
  className?: string;
};

// Контекстная точка входа: открывает виджет с предзаполненным типом и привязкой
// к сущности (карточка ингредиента, страница стиля, калькулятор и т.п.).
export function FeedbackReportLink({
  entityType,
  entityId,
  entityLabel,
  kind = "inaccuracy",
  children,
  className
}: FeedbackReportLinkProps) {
  const { open } = useFeedback();

  return (
    <button
      type="button"
      onClick={() => open({ kind, entityType, entityId, entityLabel })}
      className={
        className ??
        "inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
      }
    >
      <MessageSquareWarning className="h-3.5 w-3.5" aria-hidden />
      {children ?? "Сообщить о неточности"}
    </button>
  );
}
