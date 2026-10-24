"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, MoreHorizontal, Sticker, Timer, Trash2 } from "lucide-react";

import { Button, buttonVariants, DropdownMenu, type DropdownMenuItem } from "@nb/ui";

export function RecipeActionsMenu({
  pending,
  labelsHref,
  brewDisabled,
  mobilePublicationItems = [],
  onOpenImportExport,
  onOpenBrew,
  onDelete
}: {
  pending: boolean;
  /** Ссылка на генератор наклеек; null — рецепт ещё не сохранён. */
  labelsHref?: string | null;
  /** Пустой несохранённый черновик: варить нечего. */
  brewDisabled?: boolean;
  mobilePublicationItems?: DropdownMenuItem[];
  onOpenImportExport: () => void;
  onOpenBrew: () => void;
  /** Удаление рецепта; undefined — рецепта в БД ещё нет, удалять нечего. */
  onDelete?: () => void;
}) {
  const router = useRouter();
  const items: DropdownMenuItem[] = onDelete
    ? [{
      key: "delete",
      label: "Удалить рецепт",
      icon: <Trash2 className="h-4 w-4" aria-hidden />,
      tone: "danger",
      onSelect: onDelete
    }]
    : [];
  const secondaryMobileItems: DropdownMenuItem[] = [
    ...(labelsHref ? [{
      key: "labels",
      label: "Наклейки",
      icon: <Sticker className="h-4 w-4" aria-hidden />,
      onSelect: () => router.push(labelsHref)
    }] : []),
    {
      key: "import-export",
      label: "Импорт / экспорт",
      icon: <FileText className="h-4 w-4" aria-hidden />,
      onSelect: onOpenImportExport,
      disabled: pending
    },
    ...items
  ];
  const mobileItems: DropdownMenuItem[] = [
    ...mobilePublicationItems,
    ...secondaryMobileItems.map((item, index) => ({
      ...item,
      separatorBefore: index === 0 && mobilePublicationItems.length > 0
    }))
  ];
  const trigger = (
    <button
      type="button"
      aria-label="Действия с рецептом"
      title="Действия с рецептом"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      <MoreHorizontal className="h-5 w-5" aria-hidden />
    </button>
  );

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1.5 md:gap-2">
      {labelsHref ? (
        <Link href={labelsHref} className={`${buttonVariants({ variant: "outline", size: "md" })} hidden md:inline-flex`} aria-label="Наклейки" title="Наклейки">
          <Sticker className="h-4 w-4 text-muted-foreground" />
          <span className="hidden md:inline">Наклейки</span>
        </Link>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="md"
        className="hidden md:inline-flex"
        onClick={onOpenImportExport}
        disabled={pending}
        aria-label="Импорт / экспорт"
        title="Импорт / экспорт"
      >
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="hidden md:inline">Импорт / экспорт</span>
      </Button>
      <Button
        type="button"
        size="md"
        className="gap-1.5 px-3 text-[13px] sm:gap-2 sm:px-4 sm:text-sm"
        onClick={onOpenBrew}
        disabled={pending || brewDisabled}
        aria-label="Сварить"
        title={brewDisabled ? "Сначала добавьте хотя бы один ингредиент или назовите рецепт" : "Сварить"}
      >
        <Timer className="h-4 w-4" />
        <span>Сварить</span>
      </Button>
      <div className="md:hidden">
        <DropdownMenu
          align="end"
          aria-label="Действия с рецептом"
          trigger={trigger}
          items={mobileItems}
          contentClassName="w-[234px] max-w-[calc(100vw-16px)]"
          itemClassName="min-h-11 text-[13px]"
        />
      </div>
      {items.length ? (
        <div className="hidden md:block">
          <DropdownMenu align="end" aria-label="Действия с рецептом" trigger={trigger} items={items} />
        </div>
      ) : null}
    </div>
  );
}
