import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type AdminPageHeaderProps = {
  title: string;
  description?: string;
  // Кнопки/ссылки справа от заголовка.
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
};

export function AdminPageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel = "Назад",
  className = ""
}: AdminPageHeaderProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
