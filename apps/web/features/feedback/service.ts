import { and, db, desc, eq, feedback } from "@nb/db";
import type { UserRole } from "@nb/auth";

import { getFeedbackCapabilities } from "./permissions";
import {
  type FeedbackContext,
  type FeedbackDto,
  type FeedbackInput,
  type FeedbackKind,
  type FeedbackStatus
} from "./contracts";

export type FeedbackActor = { id: string; role: UserRole };

type FeedbackRow = typeof feedback.$inferSelect;
type FeedbackRowWithSubmitter = FeedbackRow & { submitter?: { displayName: string | null } | null };

const mapDto = (row: FeedbackRowWithSubmitter): FeedbackDto => ({
  id: row.id,
  kind: row.kind as FeedbackKind,
  message: row.message,
  contactEmail: row.contactEmail,
  pageUrl: row.pageUrl,
  pagePath: row.pagePath,
  context: (row.context as Record<string, unknown> | null | undefined) ?? {},
  status: row.status as FeedbackStatus,
  submittedByUserId: row.submittedByUserId,
  submitterName: row.submitter?.displayName ?? null,
  moderatorId: row.moderatorId,
  resolutionNote: row.resolutionNote,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

export type CreateFeedbackMeta = {
  submittedByUserId: string | null;
  userAgent?: string | null;
};

export const createFeedback = async (input: FeedbackInput, meta: CreateFeedbackMeta): Promise<FeedbackDto> => {
  const context: FeedbackContext & { userAgent?: string } = {
    ...(input.context ?? {})
  };
  if (meta.userAgent) {
    context.userAgent = meta.userAgent.slice(0, 512);
  }

  const [created] = await db
    .insert(feedback)
    .values({
      kind: input.kind,
      message: input.message,
      contactEmail: input.contactEmail ?? null,
      pageUrl: input.context?.pageUrl ?? null,
      pagePath: input.context?.pagePath ?? null,
      context,
      submittedByUserId: meta.submittedByUserId
    })
    .returning();

  if (!created) {
    throw new Error("CREATE_FAILED");
  }
  return mapDto(created);
};

export const listFeedback = async (filter?: { status?: FeedbackStatus }): Promise<FeedbackDto[]> => {
  const rows = await db.query.feedback.findMany({
    where: filter?.status ? eq(feedback.status, filter.status) : undefined,
    with: { submitter: { columns: { displayName: true } } },
    orderBy: [desc(feedback.createdAt)]
  });
  return rows.map(mapDto);
};

export const countOpenFeedback = async (): Promise<number> => {
  const rows = await db.query.feedback.findMany({
    where: and(eq(feedback.status, "new")),
    columns: { id: true }
  });
  return rows.length;
};

export const updateFeedbackStatus = async (
  actor: FeedbackActor,
  id: string,
  status: FeedbackStatus,
  note?: string
): Promise<FeedbackDto> => {
  if (!getFeedbackCapabilities(actor.role).canModerate) {
    throw new Error("FORBIDDEN");
  }

  const trimmedNote = note?.trim();
  const [updated] = await db
    .update(feedback)
    .set({
      status,
      resolutionNote: trimmedNote ? trimmedNote : null,
      moderatorId: actor.id,
      updatedAt: new Date()
    })
    .where(eq(feedback.id, id))
    .returning();

  if (!updated) {
    throw new Error("NOT_FOUND");
  }
  return mapDto(updated);
};
