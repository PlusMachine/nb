import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие server actions массовых операций каталога (app/(admin)/admin/ingredients/actions.ts):
// сервисный слой и @/lib/auth мокаются, проверяется только логика экшена — гейт роли,
// отчёт о частичном отказе (упавшие позиции не должны теряться за зелёным {ok:true}),
// аудит и сброс кэша каталога.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  recordAuditEvent: vi.fn(),
  invalidateIngredientsCatalogCache: vi.fn(),
  archiveCatalogIngredients: vi.fn(),
  deleteCatalogIngredients: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/features/audit/service", () => ({ recordAuditEvent: mocks.recordAuditEvent }));

vi.mock("@/features/ingredients/service", () => ({
  invalidateIngredientsCatalogCache: mocks.invalidateIngredientsCatalogCache
}));

vi.mock("@/features/ingredients/admin-bulk", async () => {
  const actual = await vi.importActual<typeof import("../features/ingredients/admin-bulk")>(
    "../features/ingredients/admin-bulk"
  );
  return {
    normalizeBulkIds: actual.normalizeBulkIds,
    archiveCatalogIngredients: mocks.archiveCatalogIngredients,
    deleteCatalogIngredients: mocks.deleteCatalogIngredients
  };
});

import {
  archiveCatalogIngredientsAction,
  deleteCatalogIngredientsAction
} from "../app/(admin)/admin/ingredients/actions";

const ADMIN = { id: "admin-1", email: "admin@example.com", role: "admin" };

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.requireRole.mockResolvedValue(ADMIN);
});

describe("archiveCatalogIngredientsAction", () => {
  it("доносит частичный отказ вместе с успешной частью", async () => {
    mocks.archiveCatalogIngredients.mockResolvedValue({
      archivedIds: ["a", "b"],
      failures: [
        { id: "merged-1", reason: "merged" },
        { id: "ghost-1", reason: "missing" }
      ]
    });

    const result = await archiveCatalogIngredientsAction(["a", "b", "merged-1", "ghost-1"]);

    expect(mocks.requireRole).toHaveBeenCalledWith("admin");
    expect(result).toEqual({
      ok: true,
      processed: 2,
      archived: 2,
      deleted: 0,
      failed: [
        { reason: "merged", ids: ["merged-1"] },
        { reason: "missing", ids: ["ghost-1"] }
      ]
    });
    // Успешная часть уже применена — кэш и страницы каталога сбрасываем.
    expect(mocks.invalidateIngredientsCatalogCache).toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/catalog");
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvent.mock.calls[0]?.[0]).toMatchObject({
      summary: "Архивация ингредиентов: 2, не прошло: 2",
      payload: { mode: "archive", ids: ["a", "b"], failed: [
        { reason: "merged", ids: ["merged-1"] },
        { reason: "missing", ids: ["ghost-1"] }
      ] }
    });
  });

  it("возвращает чистый успех, когда упавших позиций нет", async () => {
    mocks.archiveCatalogIngredients.mockResolvedValue({ archivedIds: ["a", "b"], failures: [] });

    const result = await archiveCatalogIngredientsAction(["a", "b"]);

    expect(result).toEqual({ ok: true, processed: 2, archived: 2, deleted: 0, failed: [] });
  });

  it("возвращает ошибку с причинами, когда не архивировано ничего", async () => {
    mocks.archiveCatalogIngredients.mockResolvedValue({
      archivedIds: [],
      failures: [{ id: "merged-1", reason: "merged" }]
    });

    const result = await archiveCatalogIngredientsAction(["merged-1"]);

    expect(result).toEqual({
      ok: false,
      error: "Не удалось архивировать выбранные позиции: объединённые карточки: 1.",
      failed: [{ reason: "merged", ids: ["merged-1"] }]
    });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("не выполняет операцию без выбранных позиций", async () => {
    const result = await archiveCatalogIngredientsAction([" ", ""]);

    expect(result).toEqual({ ok: false, error: "Не выбрано ни одного ингредиента." });
    expect(mocks.archiveCatalogIngredients).not.toHaveBeenCalled();
  });

  it("пробрасывает NEXT_REDIRECT из гейта роли", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    mocks.requireRole.mockRejectedValue(redirect);

    await expect(archiveCatalogIngredientsAction(["a"])).rejects.toBe(redirect);
  });
});

describe("deleteCatalogIngredientsAction", () => {
  it("доносит частичный отказ и перечисляет обработанное", async () => {
    mocks.deleteCatalogIngredients.mockResolvedValue({
      deletedIds: ["free-1"],
      archivedIds: ["used-1"],
      failures: [{ id: "ghost-1", reason: "missing" }]
    });

    const result = await deleteCatalogIngredientsAction(["free-1", "used-1", "ghost-1"]);

    expect(result).toEqual({
      ok: true,
      processed: 2,
      archived: 1,
      deleted: 1,
      failed: [{ reason: "missing", ids: ["ghost-1"] }]
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvent.mock.calls[0]?.[0]).toMatchObject({
      payload: {
        deletedIds: ["free-1"],
        archivedIds: ["used-1"],
        failed: [{ reason: "missing", ids: ["ghost-1"] }]
      }
    });
  });

  it("возвращает чистый успех, когда упавших позиций нет", async () => {
    mocks.deleteCatalogIngredients.mockResolvedValue({
      deletedIds: ["free-1"],
      archivedIds: ["used-1"],
      failures: []
    });

    const result = await deleteCatalogIngredientsAction(["free-1", "used-1"]);

    expect(result).toEqual({ ok: true, processed: 2, archived: 1, deleted: 1, failed: [] });
  });

  it("возвращает ошибку с причинами, когда не обработано ничего", async () => {
    mocks.deleteCatalogIngredients.mockResolvedValue({
      deletedIds: [],
      archivedIds: [],
      failures: [
        { id: "ghost-1", reason: "missing" },
        { id: "broken-1", reason: "failed" }
      ]
    });

    const result = await deleteCatalogIngredientsAction(["ghost-1", "broken-1"]);

    expect(result).toEqual({
      ok: false,
      error: "Не удалось удалить выбранные позиции: нет в каталоге: 1, сбой при сохранении: 1.",
      failed: [
        { reason: "missing", ids: ["ghost-1"] },
        { reason: "failed", ids: ["broken-1"] }
      ]
    });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});
