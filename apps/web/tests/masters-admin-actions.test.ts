import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие server actions модерации витрины мастеров (app/(admin)/admin/masters/actions.ts,
// M3): @/lib/auth мокается напрямую (по памяти проекта: «тесты экшенов обязаны мокать
// @nb/auth», здесь роль проверяется через requireRole из @/lib/auth), сервисный слой
// (@/features/masters/service) — тоже, чтобы проверять только логику actions.ts (гейт
// роли, маппинг ошибок в русские сообщения, revalidatePath).

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  approveMasterProfile: vi.fn(),
  rejectMasterProfile: vi.fn(),
  setMasterListed: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/features/masters/service", () => ({
  approveMasterProfile: mocks.approveMasterProfile,
  rejectMasterProfile: mocks.rejectMasterProfile,
  setMasterListed: mocks.setMasterListed
}));

import {
  approveMasterProfileAction,
  rejectMasterProfileAction,
  setMasterListedAction
} from "../app/(admin)/admin/masters/actions";

const MODERATOR = { id: "mod-1", role: "moderator" };

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.requireRole.mockResolvedValue(MODERATOR);
});

describe("approveMasterProfileAction", () => {
  it("публикует профиль и ревалидирует очередь + публичные страницы", async () => {
    mocks.approveMasterProfile.mockResolvedValue({ id: "p1", slug: "ivanov-forge" });

    const result = await approveMasterProfileAction("p1");

    expect(mocks.requireRole).toHaveBeenCalledWith("moderator");
    expect(mocks.approveMasterProfile).toHaveBeenCalledWith(
      { id: MODERATOR.id, role: MODERATOR.role },
      "p1"
    );
    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/masters");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/masters");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/masters/ivanov-forge");
  });

  it("не ревалидирует /masters/[slug], если slug ещё не был назначен", async () => {
    mocks.approveMasterProfile.mockResolvedValue({ id: "p1", slug: null });

    await approveMasterProfileAction("p1");

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/masters");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith(expect.stringMatching(/^\/masters\//));
  });

  it("APPROVE_NOT_ALLOWED маппится в русское сообщение и не ревалидирует", async () => {
    mocks.approveMasterProfile.mockRejectedValue(new Error("APPROVE_NOT_ALLOWED"));

    const result = await approveMasterProfileAction("p1");

    expect(result).toEqual({
      ok: false,
      error: "Опубликовать можно только заявку, которая ожидает модерации."
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("NOT_FOUND маппится в русское сообщение", async () => {
    mocks.approveMasterProfile.mockRejectedValue(new Error("NOT_FOUND"));

    const result = await approveMasterProfileAction("missing");

    expect(result).toEqual({ ok: false, error: "Не найдено — возможно, страницу нужно обновить." });
  });

  it("неизвестная ошибка → общее сообщение, а NEXT_REDIRECT (недостаточно прав) пробрасывается наружу", async () => {
    mocks.approveMasterProfile.mockRejectedValue(new Error("BOOM"));
    const generic = await approveMasterProfileAction("p1");
    expect(generic).toEqual({ ok: false, error: "Не удалось выполнить операцию." });

    const redirectError = new Error("NEXT_REDIRECT") as Error & { digest: string };
    redirectError.digest = "NEXT_REDIRECT;push;/app;307;";
    mocks.requireRole.mockRejectedValueOnce(redirectError);

    await expect(approveMasterProfileAction("p1")).rejects.toThrow("NEXT_REDIRECT");
  });
});

describe("rejectMasterProfileAction", () => {
  it("отклоняет с заметкой и ревалидирует только очередь", async () => {
    mocks.rejectMasterProfile.mockResolvedValue({ id: "p1", reviewStatus: "rejected" });

    const result = await rejectMasterProfileAction("p1", "Уточните характеристики ёмкостей под давлением.");

    expect(mocks.rejectMasterProfile).toHaveBeenCalledWith(
      { id: MODERATOR.id, role: MODERATOR.role },
      "p1",
      "Уточните характеристики ёмкостей под давлением."
    );
    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/masters");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/masters");
  });

  it("REJECT_NOT_ALLOWED маппится в русское сообщение", async () => {
    mocks.rejectMasterProfile.mockRejectedValue(new Error("REJECT_NOT_ALLOWED"));

    const result = await rejectMasterProfileAction("p1", "заметка");

    expect(result).toEqual({
      ok: false,
      error: "Отклонить можно только заявку, которая ожидает модерации."
    });
  });

  it("ZodError от валидации заметки маппится в сообщение первой ошибки", async () => {
    const { ZodError } = await import("zod");
    const zodError = new ZodError([
      { code: "custom", message: "Заметка — минимум 3 символа.", path: [] }
    ]);
    mocks.rejectMasterProfile.mockRejectedValue(zodError);

    const result = await rejectMasterProfileAction("p1", "ок");

    expect(result).toEqual({ ok: false, error: "Заметка — минимум 3 символа." });
  });
});

describe("setMasterListedAction", () => {
  it("снимает с витрины и ревалидирует очередь + публичные страницы", async () => {
    mocks.setMasterListed.mockResolvedValue({ id: "p1", slug: "ivanov-forge" });

    const result = await setMasterListedAction("p1", false);

    expect(mocks.setMasterListed).toHaveBeenCalledWith(
      { id: MODERATOR.id, role: MODERATOR.role },
      "p1",
      false
    );
    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/masters");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/masters");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/masters/ivanov-forge");
  });

  it("NOT_FOUND маппится в русское сообщение", async () => {
    mocks.setMasterListed.mockRejectedValue(new Error("NOT_FOUND"));

    const result = await setMasterListedAction("missing", true);

    expect(result).toEqual({ ok: false, error: "Не найдено — возможно, страницу нужно обновить." });
  });

  it("FORBIDDEN маппится в русское сообщение", async () => {
    mocks.setMasterListed.mockRejectedValue(new Error("FORBIDDEN"));

    const result = await setMasterListedAction("p1", true);

    expect(result).toEqual({ ok: false, error: "Недостаточно прав." });
  });
});
