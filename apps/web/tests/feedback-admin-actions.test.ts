import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие server action очереди обратной связи (app/(admin)/admin/feedback/actions.ts):
// redirect из requireRole не должен проглатываться маппером ошибок, резолюция — писаться
// в аудит.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  updateFeedbackStatus: vi.fn(),
  recordAuditEvent: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/features/feedback/service", () => ({ updateFeedbackStatus: mocks.updateFeedbackStatus }));
vi.mock("@/features/audit/service", () => ({ recordAuditEvent: mocks.recordAuditEvent }));

import { updateFeedbackStatusAction } from "../app/(admin)/admin/feedback/actions";

const MODERATOR = { id: "mod-1", email: "mod@example.ru", role: "moderator" };

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.requireRole.mockResolvedValue(MODERATOR);
  mocks.updateFeedbackStatus.mockResolvedValue({ id: "fb-1", resolutionNote: "починили" });
});

describe("updateFeedbackStatusAction", () => {
  it("обновляет статус, пишет аудит и ревалидирует очередь", async () => {
    const result = await updateFeedbackStatusAction({ id: "fb-1", status: "resolved", note: "починили" });

    expect(result).toEqual({ ok: true });
    expect(mocks.updateFeedbackStatus).toHaveBeenCalledWith(
      { id: MODERATOR.id, role: MODERATOR.role },
      "fb-1",
      "resolved",
      "починили"
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "feedback.resolve",
        actorUserId: MODERATOR.id,
        actorEmail: MODERATOR.email,
        entityType: "feedback",
        entityId: "fb-1",
        summary: "Статус: Решено"
      })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/feedback");
  });

  it("пробрасывает NEXT_REDIRECT из requireRole, а не глотает его", async () => {
    const error = new Error("NEXT_REDIRECT") as Error & { digest: string };
    error.digest = "NEXT_REDIRECT;replace;/app;307;";
    mocks.requireRole.mockRejectedValue(error);

    await expect(
      updateFeedbackStatusAction({ id: "fb-1", status: "resolved" })
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.updateFeedbackStatus).not.toHaveBeenCalled();
  });

  it("переводит код ошибки сервиса в русское сообщение", async () => {
    mocks.updateFeedbackStatus.mockRejectedValue(new Error("NOT_FOUND"));

    const result = await updateFeedbackStatusAction({ id: "fb-1", status: "resolved" });

    expect(result).toEqual({ ok: false, error: "Обращение не найдено — обновите страницу." });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});
