"use client";

import React from "react";
import Link from "next/link";
import { FileText, Sticker, Timer } from "lucide-react";

import { Button, buttonVariants } from "@nb/ui";

export function RecipeActionsMenu({
  pending,
  labelsHref,
  onOpenImportExport,
  onOpenBrew
}: {
  pending: boolean;
  /** Ссылка на генератор наклеек; null — рецепт ещё не сохранён. */
  labelsHref?: string | null;
  onOpenImportExport: () => void;
  onOpenBrew: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      {labelsHref ? (
        <Link href={labelsHref} className={buttonVariants({ variant: "outline", size: "md" })}>
          <Sticker className="h-4 w-4 text-muted-foreground" />
          Наклейки
        </Link>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="md"
        onClick={onOpenImportExport}
        disabled={pending}
      >
        <FileText className="h-4 w-4 text-muted-foreground" />
        Импорт / экспорт
      </Button>
      <Button
        type="button"
        size="md"
        onClick={onOpenBrew}
        disabled={pending}
      >
        <Timer className="h-4 w-4" />
        Сварить
      </Button>
    </div>
  );
}
