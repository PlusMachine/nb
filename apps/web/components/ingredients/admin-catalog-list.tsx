"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowRightLeft, ArrowUpDown, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Badge, Button, DropdownMenu, useToast, type DropdownMenuItem } from "@nb/ui";
import {
  AdminDataTable,
  type AdminDataTableColumn
} from "@/components/admin/admin-data-table";
import { AdminBulkBar } from "@/components/admin/admin-bulk-bar";
import { AdminBulkFailures } from "@/components/admin/admin-bulk-failures";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { CountryFlagLabel } from "@/components/shared/country-flag";
import {
  archiveCatalogIngredientsAction,
  deleteCatalogIngredientsAction,
  type CatalogBulkActionResult
} from "@/app/(admin)/admin/ingredients/actions";
import {
  buildAdminIngredientsHref,
  buildIngredientAliasesPreview,
  catalogBulkFailureLabels,
  countCatalogBulkFailures,
  describeCatalogBulkFailures,
  groupCatalogIngredientsByBrand,
  ingredientCatalogStatusRowLabels,
  ingredientCatalogStatusTones,
  ingredientCompletenessLabels,
  ingredientCompletenessTones,
  ingredientVisibilityLabels,
  resolveCatalogBrandLabel,
  type AdminCatalogSortOption,
  type CatalogBulkFailureGroup,
  type IngredientCatalogStatus
} from "@/features/ingredients/admin-page-model";
import type { IngredientCatalogItemDto, IngredientCategory } from "@/features/ingredients/contracts";
import {
  ingredientCategoryLabels,
  resolveIngredientCountry,
  resolveIngredientDisplayNames,
  resolveIngredientFamilyDisplayName
} from "@/features/ingredients/presentation";

type Props = {
  items: IngredientCatalogItemDto[];
  basePath: string;
  q: string;
  category: IngredientCategory | undefined;
  status: IngredientCatalogStatus | undefined;
  sort: AdminCatalogSortOption;
  pageSize: number;
};

type BulkMode = "archive" | "delete";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  year: "numeric"
});

const describeBulkResult = (result: Extract<CatalogBulkActionResult, { ok: true }>) => {
  const parts: string[] = [];
  if (result.deleted > 0) {
    parts.push(`удалено: ${result.deleted}`);
  }
  if (result.archived > 0) {
    parts.push(`в архив: ${result.archived}`);
  }
  return parts.join(", ");
};

export function AdminCatalogList({ items, basePath, q, category, status, sort, pageSize }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<BulkMode | null>(null);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<CatalogBulkFailureGroup[]>([]);
  const [isPending, startTransition] = useTransition();

  const groups = useMemo(
    () => (sort === "brand" ? groupCatalogIngredientsByBrand(items) : []),
    [items, sort]
  );

  const nameById = useMemo(() => new Map(
    items.map((item) => [item.id, resolveIngredientDisplayNames(item).primaryName] as const)
  ), [items]);

  const openBulk = (mode: BulkMode, ids: string[]) => {
    setError(null);
    setFailed([]);
    setTargetIds(ids);
    setBulkMode(mode);
  };

  const runBulk = () => {
    const mode = bulkMode;
    const ids = targetIds;
    if (!mode || ids.length === 0) {
      return;
    }

    startTransition(async () => {
      const result = mode === "archive"
        ? await archiveCatalogIngredientsAction(ids)
        : await deleteCatalogIngredientsAction(ids);

      if (!result.ok) {
        setError(result.error);
        setFailed(result.failed ?? []);
        return;
      }

      const failedIds = result.failed.flatMap((group) => group.ids);
      const failedCount = countCatalogBulkFailures(result.failed);
      const done = mode === "archive" ? `в архив: ${result.archived}` : describeBulkResult(result);

      setBulkMode(null);
      setTargetIds([]);
      setFailed(result.failed);
      // Обработанные карточки снимаем с выделения, упавшие — оставляем: их видно
      // в списке и по ним сразу можно повторить действие.
      setSelectedIds((current) => current.filter((id) => !ids.includes(id) || failedIds.includes(id)));

      show(failedCount > 0
        ? {
          title: `Готово частично — ${done}`,
          description: `Не прошло: ${failedCount} (${describeCatalogBulkFailures(result.failed)}).`,
          tone: "warning"
        }
        : {
          title: `Готово — ${done}`,
          tone: "success"
        });

      router.refresh();
    });
  };

  const sortableHeader = (label: string, value: AdminCatalogSortOption) => (
    <Link
      href={buildAdminIngredientsHref(basePath, {
        q,
        category: category ?? "all",
        status: status ?? "all",
        sort: value,
        pageSize
      })}
      aria-current={sort === value ? "true" : undefined}
      aria-label={`Сортировать по колонке «${label}»`}
      className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
        sort === value ? "text-foreground" : ""
      }`}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" aria-hidden />
    </Link>
  );

  const rowMenu = (item: IngredientCatalogItemDto, primaryName: string) => {
    const menuItems: DropdownMenuItem[] = [
      {
        key: "edit",
        label: "Редактировать",
        icon: <Pencil className="h-4 w-4" aria-hidden />,
        onSelect: () => router.push(`/admin/ingredients/${item.id}`)
      },
      {
        key: "merge",
        label: "Объединить",
        icon: <ArrowRightLeft className="h-4 w-4" aria-hidden />,
        onSelect: () => router.push(`/admin/ingredients/merge?sourceId=${item.id}`)
      }
    ];

    if (item.mergedIntoId) {
      menuItems.push({
        key: "merged-into",
        label: "Итоговая карточка",
        icon: <ArrowRightLeft className="h-4 w-4" aria-hidden />,
        onSelect: () => router.push(`/admin/ingredients/${item.mergedIntoId}`)
      });
    }

    if (item.status !== "archived" && item.status !== "merged") {
      menuItems.push({
        key: "archive",
        label: "В архив",
        icon: <Archive className="h-4 w-4" aria-hidden />,
        onSelect: () => openBulk("archive", [item.id])
      });
    }

    menuItems.push({
      key: "delete",
      label: "Удалить",
      icon: <Trash2 className="h-4 w-4" aria-hidden />,
      tone: "danger",
      onSelect: () => openBulk("delete", [item.id])
    });

    return (
      <DropdownMenu
        align="end"
        aria-label={`Действия: ${primaryName}`}
        trigger={
          <button
            type="button"
            aria-label={`Действия: ${primaryName}`}
            className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
        }
        items={menuItems}
      />
    );
  };

  const buildColumns = (showBrandColumn: boolean): AdminDataTableColumn<IngredientCatalogItemDto>[] => {
    const columns: AdminDataTableColumn<IngredientCatalogItemDto>[] = [
      {
        key: "name",
        header: sortableHeader("Ингредиент", "name"),
        cardLabel: "Ингредиент",
        headerClassName: "w-[28%]",
        cell: (item) => {
          const { primaryName, secondaryName } = resolveIngredientDisplayNames(item);
          const aliasesPreview = buildIngredientAliasesPreview(item.aliases);
          return (
            <div className="space-y-1">
              <Link
                href={`/admin/ingredients/${item.id}`}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {primaryName}
              </Link>
              {secondaryName ? <p className="text-xs text-muted-foreground">{secondaryName}</p> : null}
              {aliasesPreview ? <p className="text-xs text-muted-foreground">Алиасы: {aliasesPreview}</p> : null}
            </div>
          );
        }
      }
    ];

    if (showBrandColumn) {
      columns.push({
        key: "brand",
        header: sortableHeader("Бренд", "brand"),
        cardLabel: "Бренд",
        headerClassName: "w-[16%]",
        cell: (item) => {
          const country = resolveIngredientCountry(item);
          return (
            <div className="space-y-1">
              <p className="text-foreground">{resolveCatalogBrandLabel(item)}</p>
              {item.brandName && item.manufacturer && item.brandName !== item.manufacturer ? (
                <p className="text-xs text-muted-foreground">{item.manufacturer}</p>
              ) : null}
              {country ? (
                <div className="text-xs text-muted-foreground">
                  <CountryFlagLabel
                    countryCode={country.code}
                    label={country.label}
                    iconClassName="h-3 w-4"
                    className="gap-1"
                  />
                </div>
              ) : null}
            </div>
          );
        }
      });
    }

    columns.push(
      {
        key: "category",
        header: "Категория",
        headerClassName: "w-[16%]",
        cell: (item) => {
          const { primaryName } = resolveIngredientDisplayNames(item);
          const familyName = resolveIngredientFamilyDisplayName({ displayName: primaryName }) ?? null;
          return (
            <div className="space-y-1">
              <p className="text-foreground">{ingredientCategoryLabels[item.category]}</p>
              <p className="text-xs text-muted-foreground">{item.type}</p>
              {familyName ? <p className="text-xs text-muted-foreground">{familyName}</p> : null}
            </div>
          );
        }
      },
      {
        key: "status",
        header: "Статус",
        headerClassName: "w-[18%]",
        cell: (item) => (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              <Badge size="sm" tone={ingredientCatalogStatusTones[item.status]}>
                {ingredientCatalogStatusRowLabels[item.status]}
              </Badge>
              <Badge size="sm" tone={ingredientCompletenessTones[item.completenessLevel]}>
                {ingredientCompletenessLabels[item.completenessLevel]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{ingredientVisibilityLabels[item.visibility]}</p>
          </div>
        )
      },
      {
        key: "updated",
        header: sortableHeader("Обновлено", "updated"),
        cardLabel: "Обновлено",
        headerClassName: "w-[12%]",
        cell: (item) => (
          <span className="text-xs text-muted-foreground">{dateFormatter.format(item.updatedAt)}</span>
        )
      },
      {
        key: "actions",
        header: <span className="sr-only">Действия</span>,
        cardLabel: "",
        headerClassName: "w-16",
        className: "text-right",
        cell: (item) => {
          const { primaryName } = resolveIngredientDisplayNames(item);
          return <div className="flex justify-end">{rowMenu(item, primaryName)}</div>;
        }
      }
    );

    return columns;
  };

  const selection = {
    selectedIds,
    onChange: setSelectedIds
  };

  const getRowLabel = (item: IngredientCatalogItemDto) => resolveIngredientDisplayNames(item).primaryName;

  const confirmCopy = bulkMode === "archive"
    ? {
      title: targetIds.length > 1 ? "Отправить в архив?" : "Отправить ингредиент в архив?",
      description: `Карточки останутся в базе, но пропадут из каталога и подбора. Позиций: ${targetIds.length}.`,
      confirmLabel: "В архив",
      pendingLabel: "Архивируем...",
      tone: "primary" as const
    }
    : {
      title: targetIds.length > 1 ? "Удалить ингредиенты?" : "Удалить ингредиент?",
      description: `Неиспользуемые карточки будут удалены безвозвратно, остальные — переведены в архив. Позиций: ${targetIds.length}.`,
      confirmLabel: "Удалить",
      pendingLabel: "Удаляем...",
      tone: "danger" as const
    };

  return (
    <div className="space-y-4">
      <AdminBulkFailures
        failed={failed}
        labels={catalogBulkFailureLabels}
        resolveName={(id) => nameById.get(id) ?? id}
        onDismiss={() => setFailed([])}
      />


      {sort === "brand" ? (
        groups.map((group) => (
          <section key={group.key} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
              <span className="text-xs text-muted-foreground">{group.items.length}</span>
            </div>
            <AdminDataTable
              items={group.items}
              columns={buildColumns(false)}
              getRowId={(item) => item.id}
              getRowLabel={getRowLabel}
              selection={selection}
            />
          </section>
        ))
      ) : (
        <AdminDataTable
          items={items}
          columns={buildColumns(true)}
          getRowId={(item) => item.id}
          getRowLabel={getRowLabel}
          selection={selection}
        />
      )}

      <AdminBulkBar count={selectedIds.length} onClear={() => setSelectedIds([])}>
        <Button size="sm" variant="outline" onClick={() => openBulk("archive", selectedIds)}>
          <Archive className="h-4 w-4" aria-hidden />
          В архив
        </Button>
        <Button size="sm" variant="danger" onClick={() => openBulk("delete", selectedIds)}>
          <Trash2 className="h-4 w-4" aria-hidden />
          Удалить
        </Button>
      </AdminBulkBar>

      <ConfirmActionDialog
        open={bulkMode !== null}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirmLabel}
        pendingLabel={confirmCopy.pendingLabel}
        tone={confirmCopy.tone}
        pending={isPending}
        error={error}
        onConfirm={runBulk}
        onClose={() => {
          if (isPending) {
            return;
          }
          setBulkMode(null);
          setTargetIds([]);
          setError(null);
        }}
      />
    </div>
  );
}
