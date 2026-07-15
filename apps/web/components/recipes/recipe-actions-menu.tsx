"use client";

import React from "react";
import Link from "next/link";
import { FileText, MoreHorizontal, Sticker, Timer, Trash2 } from "lucide-react";

import { Button, buttonVariants, DropdownMenu, type DropdownMenuItem } from "@nb/ui";

export function RecipeActionsMenu({
  pending,
  labelsHref,
  brewDisabled,
  onOpenImportExport,
  onOpenBrew,
  onDelete
}: {
  pending: boolean;
  /** Ссылка на генератор наклеек; null — рецепт ещё не сохранён. */
  labelsHref?: string | null;
  /** Пустой несохранённый черновик: варить нечего. */
  brewDisabled?: boolean;
  onOpenImportExport: () => void;
  onOpenBrew: () => void;
  /** Удаление рецепта; undefined — рецепта в БД ещё нет, удалять нечего. */
  onDelete?: () => void;
}) {
  const items: DropdownMenuItem[] = onDelete
    ? [{
      key: "delete",
      label: "Удалить рецепт",
      icon: <Trash2 className="h-4 w-4" aria-hidden />,
      tone: "danger",
      onSelect: onDelete
    }]
    : [];

  return (
    <div className="flex flex-wrap items-end gap-2">
      {labelsHref ? (
        <Link href={labelsHref} className={buttonVariants({ variant: "outline", size: "md" })} aria-label="Наклейки" title="Наклейки">
          <Sticker className="h-4 w-4 text-muted-foreground" />
          <span className="hidden sm:inline">Наклейки</span>
        </Link>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="md"
        onClick={onOpenImportExport}
        disabled={pending}
        aria-label="Импорт / экспорт"
        title="Импорт / экспорт"
      >
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="hidden sm:inline">Импорт / экспорт</span>
      </Button>
      <Button
        type="button"
        size="md"
        onClick={onOpenBrew}
        disabled={pending || brewDisabled}
        aria-label="Сварить"
        title={brewDisabled ? "Сначала добавьте хотя бы один ингредиент или назовите рецепт" : "Сварить"}
      >
        <Timer className="h-4 w-4" />
        <span className="hidden sm:inline">Сварить</span>
      </Button>
      {items.length ? (
        <DropdownMenu
          align="end"
          aria-label="Действия с рецептом"
          trigger={
            <button
              type="button"
              aria-label="Действия с рецептом"
              title="Действия с рецептом"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden />
            </button>
          }
          items={items}
        />
      ) : null}
    </div>
  );
}
