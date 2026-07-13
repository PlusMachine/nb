"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, MoreHorizontal, Star, Trash2 } from "lucide-react";
import { Badge, Button, DropdownMenu, useToast, type DropdownMenuItem } from "@nb/ui";

import { AdminBulkBar } from "@/components/admin/admin-bulk-bar";
import { AdminBulkFailures } from "@/components/admin/admin-bulk-failures";
import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin/admin-data-table";
import { HideRecipesDialog } from "@/components/admin/recipes/hide-recipes-dialog";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { deleteRecipeAction, hideRecipesAction, unhideRecipeAction } from "@/app/(admin)/admin/recipes/actions";
import { setRecipeFeaturedAction } from "@/app/(public)/recipes/[slug]/actions";
import {
  adminRecipeStatusLabels,
  adminRecipeStatusTones,
  countRecipeBulkFailures,
  describeRecipeBulkFailures,
  formatAdminRecipeRating,
  recipeBulkFailureLabels,
  type AdminRecipeListItem,
  type RecipeBulkFailureGroup
} from "@/features/recipes/admin-page-model";

const formatDate = (value: Date) => new Date(value).toLocaleDateString("ru-RU", { dateStyle: "medium" });

export function AdminRecipesList({ items }: { items: AdminRecipeListItem[] }) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hideTargets, setHideTargets] = useState<string[] | null>(null);
  const [hideError, setHideError] = useState<string | null>(null);
  const [failed, setFailed] = useState<RecipeBulkFailureGroup[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<AdminRecipeListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const titleById = useMemo(() => new Map(items.map((item) => [item.id, item.title] as const)), [items]);

  const openHide = (ids: string[]) => {
    setHideError(null);
    setFailed([]);
    setHideTargets(ids);
  };

  const handleHide = (reason: string) => {
    const ids = hideTargets ?? [];
    startTransition(async () => {
      const result = await hideRecipesAction(ids, reason);
      if (!result.ok) {
        setHideError(result.error);
        setFailed(result.failed ?? []);
        show({ title: "Не удалось скрыть", description: result.error, tone: "danger" });
        router.refresh();
        return;
      }

      const failedIds = result.failed.flatMap((group) => group.ids);
      const failedCount = countRecipeBulkFailures(result.failed);

      setHideTargets(null);
      setHideError(null);
      setFailed(result.failed);
      // Скрытые снимаем с выделения, упавшие оставляем: по ним сразу можно повторить действие.
      setSelectedIds((current) => current.filter((id) => !ids.includes(id) || failedIds.includes(id)));

      show(failedCount > 0
        ? {
          title: `Скрыто рецептов: ${result.processed}`,
          description: `Не прошло: ${failedCount} (${describeRecipeBulkFailures(result.failed)}).`,
          tone: "warning"
        }
        : {
          title: result.processed > 1 ? `Скрыто рецептов: ${result.processed}` : "Рецепт скрыт",
          tone: "success"
        });

      router.refresh();
    });
  };

  const handleUnhide = (recipe: AdminRecipeListItem) => {
    startTransition(async () => {
      const result = await unhideRecipeAction(recipe.id);
      if (!result.ok) {
        show({ title: "Не удалось вернуть", description: result.error, tone: "danger" });
        return;
      }
      show({ title: "Рецепт возвращён", tone: "success" });
      router.refresh();
    });
  };

  const handleFeature = (recipe: AdminRecipeListItem) => {
    startTransition(async () => {
      const result = await setRecipeFeaturedAction({
        recipeId: recipe.id,
        slug: recipe.slug,
        featured: !recipe.featured
      });
      if (!result.ok) {
        show({ title: "Не удалось изменить «Выбор редакции»", description: result.message, tone: "danger" });
        return;
      }
      show({ title: result.featured ? "Отмечен «Выбором редакции»" : "Метка снята", tone: "success" });
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) {
      return;
    }
    const target = deleteTarget;
    startTransition(async () => {
      const result = await deleteRecipeAction(target.id);
      if (!result.ok) {
        setDeleteError(result.error);
        show({ title: "Не удалось удалить", description: result.error, tone: "danger" });
        return;
      }
      setDeleteTarget(null);
      setDeleteError(null);
      setSelectedIds((current) => current.filter((id) => id !== target.id));
      show({ title: "Рецепт удалён", tone: "success" });
      router.refresh();
    });
  };

  const buildRowActions = (recipe: AdminRecipeListItem): DropdownMenuItem[] => {
    const actions: DropdownMenuItem[] = [];

    if (recipe.hiddenAt) {
      actions.push({
        key: "unhide",
        label: "Показать",
        icon: <Eye className="h-4 w-4" aria-hidden />,
        disabled: isPending,
        onSelect: () => handleUnhide(recipe)
      });
    } else {
      actions.push({
        key: "hide",
        label: "Скрыть",
        icon: <EyeOff className="h-4 w-4" aria-hidden />,
        disabled: isPending,
        onSelect: () => openHide([recipe.id])
      });
    }

    // «Выбор редакции» можно поставить только публично видимому рецепту (сервис
    // это и проверяет), снять — всегда, если метка стоит.
    if (recipe.featured || recipe.status === "published") {
      actions.push({
        key: "feature",
        label: recipe.featured ? "Снять «Выбор редакции»" : "«Выбор редакции»",
        icon: <Star className="h-4 w-4" aria-hidden />,
        disabled: isPending,
        onSelect: () => handleFeature(recipe)
      });
    }

    actions.push({
      key: "delete",
      label: "Удалить",
      tone: "danger",
      icon: <Trash2 className="h-4 w-4" aria-hidden />,
      disabled: isPending,
      onSelect: () => {
        setDeleteError(null);
        setDeleteTarget(recipe);
      }
    });

    return actions;
  };

  const columns: AdminDataTableColumn<AdminRecipeListItem>[] = [
    {
      key: "title",
      header: "Рецепт",
      cell: (recipe) => (
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {recipe.status === "published" ? (
              <Link href={`/recipes/${recipe.slug}`} className="font-medium text-foreground hover:text-primary">
                {recipe.title}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{recipe.title}</span>
            )}
            {recipe.featured ? (
              <Star className="h-3.5 w-3.5 text-primary" aria-label="Выбор редакции" />
            ) : null}
          </div>
          {recipe.hiddenAt && recipe.hiddenReason ? (
            <p className="line-clamp-2 text-xs text-destructive-subtle-foreground">
              Причина: {recipe.hiddenReason}
              {recipe.hiddenByName ? ` — ${recipe.hiddenByName}` : ""}
            </p>
          ) : null}
        </div>
      )
    },
    {
      key: "author",
      header: "Автор",
      headerClassName: "w-44",
      cell: (recipe) => <span className="text-sm text-muted-foreground">{recipe.authorName}</span>
    },
    {
      key: "style",
      header: "Стиль",
      headerClassName: "w-44",
      cell: (recipe) =>
        recipe.styleCode ? (
          <span className="text-sm text-muted-foreground">
            {recipe.styleCode} {recipe.styleName}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )
    },
    {
      key: "status",
      header: "Статус",
      headerClassName: "w-32",
      cell: (recipe) => (
        <Badge tone={adminRecipeStatusTones[recipe.status]} size="sm">
          {adminRecipeStatusLabels[recipe.status]}
        </Badge>
      )
    },
    {
      key: "rating",
      header: "Рейтинг",
      headerClassName: "w-24",
      cell: (recipe) => <span className="text-sm text-muted-foreground">{formatAdminRecipeRating(recipe)}</span>
    },
    {
      key: "updatedAt",
      header: "Обновлён",
      headerClassName: "w-32",
      cell: (recipe) => <span className="text-sm text-muted-foreground">{formatDate(recipe.updatedAt)}</span>
    },
    {
      key: "actions",
      header: <span className="sr-only">Действия</span>,
      headerClassName: "w-12",
      cardLabel: "",
      cell: (recipe) => (
        <DropdownMenu
          align="end"
          aria-label={`Действия с «${recipe.title}»`}
          trigger={
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`Действия с «${recipe.title}»`}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
          }
          items={buildRowActions(recipe)}
        />
      )
    }
  ];

  const hideCount = hideTargets?.length ?? 0;

  return (
    <div className="space-y-4">
      <AdminBulkFailures
        failed={failed}
        labels={recipeBulkFailureLabels}
        resolveName={(id) => titleById.get(id) ?? id}
        onDismiss={() => setFailed([])}
      />

      <AdminDataTable
        items={items}
        columns={columns}
        getRowId={(recipe) => recipe.id}
        getRowLabel={(recipe) => recipe.title}
        selection={{
          selectedIds,
          onChange: setSelectedIds,
          isSelectable: (recipe) => recipe.hiddenAt == null
        }}
        empty={
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Рецептов не найдено.
          </p>
        }
      />

      <AdminBulkBar count={selectedIds.length} onClear={() => setSelectedIds([])}>
        <Button
          type="button"
          size="sm"
          variant="danger"
          disabled={isPending}
          onClick={() => openHide(selectedIds)}
        >
          <EyeOff className="h-4 w-4" aria-hidden />
          Скрыть
        </Button>
      </AdminBulkBar>

      <HideRecipesDialog
        open={hideTargets !== null}
        count={hideCount}
        pending={isPending}
        error={hideError}
        onConfirm={handleHide}
        onClose={() => {
          setHideTargets(null);
          setHideError(null);
        }}
      />

      <ConfirmActionDialog
        open={deleteTarget !== null}
        title="Удалить рецепт?"
        description={
          deleteTarget
            ? `Рецепт «${deleteTarget.title}» будет удалён вместе с ингредиентами, оценками и фотографиями. Отменить нельзя.`
            : ""
        }
        confirmLabel="Удалить рецепт"
        pending={isPending}
        error={deleteError}
        onConfirm={handleDelete}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      />
    </div>
  );
}
