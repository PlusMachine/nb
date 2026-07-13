import type { BadgeTone } from "@nb/ui";

import {
  feedbackStatuses,
  type FeedbackDto,
  type FeedbackStatus
} from "./contracts";

export const adminFeedbackPageSizeOptions = [20, 50, 100] as const;
export const defaultAdminFeedbackPageSize = 20;

export const feedbackStatusTones: Record<FeedbackStatus, BadgeTone> = {
  new: "info",
  in_progress: "warning",
  resolved: "success",
  dismissed: "neutral"
};

export type AdminFeedbackPageParams = {
  q: string;
  status: FeedbackStatus | undefined;
  page: number;
  pageSize: number;
};

export type AdminFeedbackPage = {
  items: FeedbackDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const readParam = (value: string | string[] | undefined): string | undefined => (
  typeof value === "string" ? value : undefined
);

export const parseFeedbackStatus = (value: string | undefined): FeedbackStatus | undefined => (
  feedbackStatuses.includes(value as FeedbackStatus)
    ? value as FeedbackStatus
    : undefined
);

export const parseAdminFeedbackPageParams = (
  params: Record<string, string | string[] | undefined>
): AdminFeedbackPageParams => {
  const page = Number(readParam(params.page) ?? "1");
  const pageSize = Number(readParam(params.pageSize) ?? "");

  return {
    q: (readParam(params.q) ?? "").trim(),
    status: parseFeedbackStatus(readParam(params.status)),
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    pageSize: (adminFeedbackPageSizeOptions as readonly number[]).includes(pageSize)
      ? pageSize
      : defaultAdminFeedbackPageSize
  };
};

export const buildAdminFeedbackHref = (
  pathname: string,
  {
    q = "",
    status = "all",
    page = 1,
    pageSize = defaultAdminFeedbackPageSize
  }: {
    q?: string;
    status?: FeedbackStatus | "all";
    page?: number;
    pageSize?: number;
  }
) => {
  const params = new URLSearchParams();
  const trimmed = q.trim();

  if (trimmed) {
    params.set("q", trimmed);
  }

  if (status !== "all") {
    params.set("status", status);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  if (pageSize !== defaultAdminFeedbackPageSize) {
    params.set("pageSize", String(pageSize));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};

export const countFeedbackByStatus = (items: FeedbackDto[]): Record<FeedbackStatus, number> => {
  const counts = { new: 0, in_progress: 0, resolved: 0, dismissed: 0 } as Record<FeedbackStatus, number>;
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
};

/** Ищем по тексту сообщения, автору и странице, с которой пришёл отзыв. */
export const filterFeedback = (items: FeedbackDto[], q: string): FeedbackDto[] => {
  const needle = q.trim().toLocaleLowerCase("ru");
  if (!needle) {
    return items;
  }

  return items.filter((item) => (
    item.message.toLocaleLowerCase("ru").includes(needle)
    || (item.submitterName ?? "").toLocaleLowerCase("ru").includes(needle)
    || (item.contactEmail ?? "").toLocaleLowerCase("ru").includes(needle)
    || (item.pagePath ?? "").toLocaleLowerCase("ru").includes(needle)
  ));
};

export const paginateFeedback = (
  items: FeedbackDto[],
  page: number,
  pageSize: number
): AdminFeedbackPage => {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;

  return {
    items: items.slice(offset, offset + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages
  };
};
