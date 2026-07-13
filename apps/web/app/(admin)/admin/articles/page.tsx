import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge, type BadgeTone } from "@nb/ui";
import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin/admin-data-table";
import { AdminFilterTabs, type AdminFilterTab } from "@/components/admin/admin-filter-tabs";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { UrlSearchField } from "@/components/shared/url-search-field";
import { requireContentRole } from "@/features/content/permissions";
import {
  buildAdminArticlesHref,
  countAdminArticlesByStatus,
  defaultAdminArticlesPageSize,
  filterAdminArticles,
  paginateAdminArticles,
  parseAdminArticlesPageParams
} from "@/features/content-articles/admin-page-model";
import { listAdminContentArticles } from "@/features/content-articles/service";
import {
  contentArticleStatuses,
  contentArticleStatusLabels,
  contentArticleTypeLabels,
  type ContentArticleListItem,
  type ContentArticleStatus
} from "@/features/content-articles/contracts";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const basePath = "/admin/articles";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });

const statusTones: Record<ContentArticleStatus, BadgeTone> = {
  draft: "warning",
  published: "success",
  archived: "neutral"
};

export default async function AdminArticlesPage({ searchParams }: Props) {
  const [, articles] = await Promise.all([
    requireContentRole("editor"),
    listAdminContentArticles()
  ]);

  const { q, status, page, pageSize } = parseAdminArticlesPageParams(await searchParams);

  const counts = countAdminArticlesByStatus(articles);
  const matched = filterAdminArticles(
    status ? articles.filter((article) => article.status === status) : articles,
    q
  );
  const result = paginateAdminArticles(matched, page, pageSize);

  const tabs: AdminFilterTab[] = [
    {
      key: "all",
      label: "Все",
      href: buildAdminArticlesHref(basePath, { q, pageSize }),
      count: articles.length
    },
    ...contentArticleStatuses.map((value) => ({
      key: value,
      label: contentArticleStatusLabels[value],
      href: buildAdminArticlesHref(basePath, { q, status: value, pageSize }),
      count: counts[value]
    }))
  ];

  const columns: AdminDataTableColumn<ContentArticleListItem>[] = [
    {
      key: "title",
      header: "Заголовок",
      cardLabel: "Заголовок",
      cell: (article) => (
        <div className="space-y-1">
          <Link
            href={`/admin/articles/${article.id}/edit`}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {article.title}
          </Link>
          <p className="text-xs text-muted-foreground">/{article.slug}</p>
        </div>
      )
    },
    {
      key: "type",
      header: "Тип",
      headerClassName: "w-32",
      cell: (article) => (
        <span className="text-sm text-muted-foreground">{contentArticleTypeLabels[article.type]}</span>
      )
    },
    {
      key: "author",
      header: "Автор",
      headerClassName: "w-40",
      cell: (article) => (
        <span className="text-sm text-muted-foreground">{article.authorName ?? "—"}</span>
      )
    },
    {
      key: "status",
      header: "Статус",
      headerClassName: "w-44",
      cell: (article) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge size="sm" tone={statusTones[article.status]}>
            {contentArticleStatusLabels[article.status]}
          </Badge>
          {article.isFeatured ? <Badge size="sm" tone="info">На главной</Badge> : null}
        </div>
      )
    },
    {
      key: "updated",
      header: "Обновлено",
      headerClassName: "w-32",
      cell: (article) => (
        <span className="text-xs text-muted-foreground">
          {dateFormatter.format(new Date(article.updatedAt))}
        </span>
      )
    }
  ];

  return (
    <section className="space-y-5">
      <AdminPageHeader
        title="Статьи и обзоры"
        actions={
          <Link
            href="/admin/articles/new"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Новая статья
          </Link>
        }
      />

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <UrlSearchField
          id="admin-articles-search"
          label="Поиск"
          value={q}
          basePath={basePath}
          params={{
            status,
            pageSize: pageSize === defaultAdminArticlesPageSize ? undefined : String(pageSize)
          }}
          placeholder="Заголовок, слаг, автор"
        />
        <AdminFilterTabs label="Статусы" tabs={tabs} activeKey={status ?? "all"} />
      </div>

      <AdminDataTable
        items={result.items}
        columns={columns}
        getRowId={(article) => article.id}
        getRowLabel={(article) => article.title}
        empty={
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {q || status ? "Ничего не найдено." : "Пока нет статей. Создайте первый гайд или обзор."}
          </p>
        }
      />

      <AdminPagination
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
      />
    </section>
  );
}
