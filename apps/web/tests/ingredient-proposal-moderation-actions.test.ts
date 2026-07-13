import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие server actions очереди заявок на ингредиенты
// (app/(admin)/admin/ingredients/moderation/actions.ts) и презентера заявки.
// Мокаются @/lib/auth (гейт роли), сервис ингредиентов, аудит и revalidatePath —
// проверяем только логику actions.ts.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  applyModerationAction: vi.fn(),
  recordAuditEvent: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/features/ingredients/service", () => ({ applyModerationAction: mocks.applyModerationAction }));
vi.mock("@/features/audit/service", () => ({ recordAuditEvent: mocks.recordAuditEvent }));

import { resolveIngredientProposalAction } from "../app/(admin)/admin/ingredients/moderation/actions";
import {
  describeIngredientProposalPayload,
  formatIngredientProposalSourceLabel
} from "../features/ingredients/proposal-presentation";

const MODERATOR = { id: "mod-1", email: "mod@example.ru", role: "moderator" };

const redirectError = () => {
  const error = new Error("NEXT_REDIRECT") as Error & { digest: string };
  error.digest = "NEXT_REDIRECT;replace;/app;307;";
  return error;
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.requireRole.mockResolvedValue(MODERATOR);
  mocks.applyModerationAction.mockResolvedValue({ id: "prop-1", sourceDisplayName: "Курский пилс" });
});

describe("resolveIngredientProposalAction", () => {
  it("одобряет заявку, пишет аудит и ревалидирует очередь", async () => {
    const result = await resolveIngredientProposalAction({
      id: "prop-1",
      action: "approve",
      resolutionNote: "  берём  "
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.requireRole).toHaveBeenCalledWith("moderator");
    expect(mocks.applyModerationAction).toHaveBeenCalledWith(
      "prop-1",
      { action: "approve", resolutionNote: "берём", targetIngredientId: undefined },
      MODERATOR.id
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ingredient.proposal_approve",
        actorUserId: MODERATOR.id,
        actorEmail: MODERATOR.email,
        entityType: "ingredient_proposal",
        entityId: "prop-1"
      })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/ingredients/moderation");
  });

  it("пишет отклонение отдельным действием аудита", async () => {
    await resolveIngredientProposalAction({ id: "prop-1", action: "reject" });

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ingredient.proposal_reject" })
    );
  });

  it("не объединяет заявку без выбранного ингредиента", async () => {
    const result = await resolveIngredientProposalAction({ id: "prop-1", action: "merge" });

    expect(result).toEqual({ ok: false, error: "Выберите ингредиент, с которым объединить заявку." });
    expect(mocks.applyModerationAction).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("объединяет заявку с выбранным ингредиентом", async () => {
    const result = await resolveIngredientProposalAction({
      id: "prop-1",
      action: "merge",
      targetIngredientId: "ing-7"
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.applyModerationAction).toHaveBeenCalledWith(
      "prop-1",
      { action: "merge", resolutionNote: undefined, targetIngredientId: "ing-7" },
      MODERATOR.id
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ingredient.merge" })
    );
  });

  it("возвращает русскую ошибку вместо кода сервиса", async () => {
    mocks.applyModerationAction.mockRejectedValue(new Error("FORBIDDEN"));

    const result = await resolveIngredientProposalAction({ id: "prop-1", action: "approve" });

    expect(result).toEqual({ ok: false, error: "Недостаточно прав." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("пробрасывает NEXT_REDIRECT из requireRole", async () => {
    mocks.requireRole.mockRejectedValue(redirectError());

    await expect(resolveIngredientProposalAction({ id: "prop-1", action: "approve" })).rejects.toThrow("NEXT_REDIRECT");
  });
});

describe("describeIngredientProposalPayload", () => {
  it("переводит известные поля заявки в человекочитаемые подписи", () => {
    const fields = describeIngredientProposalPayload({
      category: "fermentable",
      subtype: "malt",
      type: "hop",
      brand: "Курский солод",
      unknownKey: 42,
      empty: "   ",
      missing: null
    });

    expect(fields).toEqual([
      { key: "category", label: "Категория", value: "Ферментируемые" },
      { key: "type", label: "Тип", value: "Хмель" },
      { key: "subtype", label: "Подтип", value: "солод" },
      { key: "brand", label: "Бренд", value: "Курский солод" },
      { key: "unknownKey", label: "unknownKey", value: "42" }
    ]);
  });

  it("не падает на пустой заявке", () => {
    expect(describeIngredientProposalPayload({})).toEqual([]);
  });

  it("подписывает источник заявки, неизвестный — как есть", () => {
    expect(formatIngredientProposalSourceLabel("recipe_designer")).toBe("Мастер рецептов");
    expect(formatIngredientProposalSourceLabel("import_v9")).toBe("import_v9");
  });
});
