import { AdminFilterTabs, type AdminFilterTab } from "@/components/admin/admin-filter-tabs";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { UrlSearchField } from "@/components/shared/url-search-field";
import { FeedbackQueue } from "@/components/feedback/feedback-queue";
import {
  buildAdminFeedbackHref,
  countFeedbackByStatus,
  defaultAdminFeedbackPageSize,
  filterFeedback,
  paginateFeedback,
  parseAdminFeedbackPageParams
} from "@/features/feedback/admin-page-model";
import { feedbackStatuses, feedbackStatusLabels } from "@/features/feedback/contracts";
import { listFeedback } from "@/features/feedback/service";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const basePath = "/admin/feedback";

export default async function AdminFeedbackPage({ searchParams }: Props) {
  await requireRole("moderator");

  const { q, status, page, pageSize } = parseAdminFeedbackPageParams(await searchParams);
  const all = await listFeedback();

  const counts = countFeedbackByStatus(all);
  const matched = filterFeedback(
    status ? all.filter((item) => item.status === status) : all,
    q
  );
  const result = paginateFeedback(matched, page, pageSize);

  const tabs: AdminFilterTab[] = [
    {
      key: "all",
      label: "Все",
      href: buildAdminFeedbackHref(basePath, { q, pageSize }),
      count: all.length
    },
    ...feedbackStatuses.map((value) => ({
      key: value,
      label: feedbackStatusLabels[value],
      href: buildAdminFeedbackHref(basePath, { q, status: value, pageSize }),
      count: counts[value]
    }))
  ];

  return (
    <section className="space-y-5">
      <AdminPageHeader title="Обратная связь" />

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <UrlSearchField
          id="admin-feedback-search"
          label="Поиск"
          value={q}
          basePath={basePath}
          params={{
            status,
            pageSize: pageSize === defaultAdminFeedbackPageSize ? undefined : String(pageSize)
          }}
          placeholder="Текст, автор, страница"
        />
        <AdminFilterTabs label="Статусы" tabs={tabs} activeKey={status ?? "all"} />
      </div>

      {result.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {q || status ? "Ничего не найдено." : "Пока пусто."}
        </p>
      ) : (
        <FeedbackQueue items={result.items} />
      )}

      <AdminPagination
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        pageSize={result.pageSize}
      />
    </section>
  );
}
