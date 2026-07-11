import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

// Покрытие server actions кабинета мастера (app/(app)/app/master/actions.ts, M2):
// @/lib/auth и @nb/auth мокаются напрямую (по памяти проекта: «тесты экшенов
// обязаны мокать @nb/auth»), сервисный слой (@/features/masters/service,
// @/features/masters/images) — тоже, чтобы проверять только логику actions.ts
// (маппинг ошибок в русские сообщения, revalidatePath, проброс NEXT_REDIRECT).

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  assertRateLimit: vi.fn(async () => {}),
  revalidatePath: vi.fn(),
  createMasterProfile: vi.fn(),
  updateMasterProfile: vi.fn(),
  createMasterItem: vi.fn(),
  updateMasterItem: vi.fn(),
  deleteMasterItem: vi.fn(),
  reorderMasterItems: vi.fn(),
  submitForReview: vi.fn(),
  withdrawSubmission: vi.fn(),
  setOwnListed: vi.fn(),
  deleteMasterImage: vi.fn(),
  moveMasterImage: vi.fn(),
  reorderMasterImages: vi.fn(),
  setMasterItemCover: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@nb/auth", () => ({ assertRateLimit: mocks.assertRateLimit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/features/masters/service", () => ({
  createMasterProfile: mocks.createMasterProfile,
  updateMasterProfile: mocks.updateMasterProfile,
  createMasterItem: mocks.createMasterItem,
  updateMasterItem: mocks.updateMasterItem,
  deleteMasterItem: mocks.deleteMasterItem,
  reorderMasterItems: mocks.reorderMasterItems,
  submitForReview: mocks.submitForReview,
  withdrawSubmission: mocks.withdrawSubmission,
  setOwnListed: mocks.setOwnListed
}));

vi.mock("@/features/masters/images", () => ({
  deleteMasterImage: mocks.deleteMasterImage,
  moveMasterImage: mocks.moveMasterImage,
  reorderMasterImages: mocks.reorderMasterImages,
  setMasterItemCover: mocks.setMasterItemCover
}));

import {
  createMasterItemAction,
  createMasterProfileAction,
  deleteMasterImageAction,
  deleteMasterItemAction,
  reorderMasterImagesAction,
  setMasterItemCoverAction,
  submitMasterForReviewAction,
  updateMasterProfileAction,
  withdrawMasterSubmissionAction
} from "../app/(app)/app/master/actions";

const USER = { id: "user-1", role: "user" };

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.requireUser.mockResolvedValue(USER);
  mocks.assertRateLimit.mockResolvedValue(undefined);
});

describe("createMasterProfileAction", () => {
  it("создаёт профиль и ревалидирует /app/master", async () => {
    const profile = { id: "p1", reviewStatus: "draft" };
    mocks.createMasterProfile.mockResolvedValue(profile);

    const result = await createMasterProfileAction({ displayName: "Иван" });

    expect(mocks.createMasterProfile).toHaveBeenCalledWith(USER.id, { displayName: "Иван" });
    expect(result).toEqual({ ok: true, profile });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/master");
  });

  it("PROFILE_EXISTS маппится в русское сообщение", async () => {
    mocks.createMasterProfile.mockRejectedValue(new Error("PROFILE_EXISTS"));

    const result = await createMasterProfileAction({});

    expect(result).toEqual({ ok: false, error: "У вас уже есть профиль мастера." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("ZodError маппится в сообщение первой ошибки валидации", async () => {
    const zodError = new ZodError([
      { code: "custom", message: "Название — минимум 3 символа.", path: ["displayName"] }
    ]);
    mocks.createMasterProfile.mockRejectedValue(zodError);

    const result = await createMasterProfileAction({ displayName: "И" });

    expect(result).toEqual({ ok: false, error: "Название — минимум 3 символа." });
  });

  it("неизвестная ошибка → общее сообщение, а NEXT_REDIRECT пробрасывается наружу", async () => {
    mocks.createMasterProfile.mockRejectedValue(new Error("BOOM"));
    const generic = await createMasterProfileAction({});
    expect(generic).toEqual({ ok: false, error: "Не удалось выполнить операцию." });

    const redirectError = new Error("NEXT_REDIRECT") as Error & { digest: string };
    redirectError.digest = "NEXT_REDIRECT;push;/login;307;";
    mocks.requireUser.mockRejectedValueOnce(redirectError);

    await expect(createMasterProfileAction({})).rejects.toThrow("NEXT_REDIRECT");
  });
});

describe("updateMasterProfileAction", () => {
  it("PROFILE_LOCKED_PENDING маппится корректно", async () => {
    mocks.updateMasterProfile.mockRejectedValue(new Error("PROFILE_LOCKED_PENDING"));

    const result = await updateMasterProfileAction({});

    expect(result).toEqual({ ok: false, error: "Пока заявка на модерации, править нельзя." });
  });
});

describe("submitMasterForReviewAction", () => {
  it("проверяет rate limit перед отправкой на модерацию", async () => {
    const profile = { id: "p1", reviewStatus: "pending" };
    mocks.submitForReview.mockResolvedValue(profile);

    const result = await submitMasterForReviewAction();

    expect(mocks.assertRateLimit).toHaveBeenCalledWith(USER.id, "master_submit", 10, 3600);
    expect(mocks.submitForReview).toHaveBeenCalledWith(USER.id);
    expect(result).toEqual({ ok: true, profile });
  });

  it("RATE_LIMITED от assertRateLimit маппится в русское сообщение и не зовёт сервис", async () => {
    mocks.assertRateLimit.mockRejectedValue(new Error("RATE_LIMITED"));

    const result = await submitMasterForReviewAction();

    expect(result).toEqual({ ok: false, error: "Слишком много попыток подряд. Попробуйте позже." });
    expect(mocks.submitForReview).not.toHaveBeenCalled();
  });

  it("PROFILE_INCOMPLETE маппится корректно", async () => {
    mocks.submitForReview.mockRejectedValue(new Error("PROFILE_INCOMPLETE"));

    const result = await submitMasterForReviewAction();

    expect(result).toEqual({ ok: false, error: "Заполните профиль полностью перед отправкой на модерацию." });
  });
});

describe("withdrawMasterSubmissionAction", () => {
  it("WITHDRAW_NOT_ALLOWED маппится корректно", async () => {
    mocks.withdrawSubmission.mockRejectedValue(new Error("WITHDRAW_NOT_ALLOWED"));

    const result = await withdrawMasterSubmissionAction();

    expect(result).toEqual({ ok: false, error: "Заявка не на модерации — отзывать нечего." });
  });
});

describe("изделия", () => {
  it("createMasterItemAction возвращает ITEM_LIMIT_REACHED по-русски", async () => {
    mocks.createMasterItem.mockRejectedValue(new Error("ITEM_LIMIT_REACHED"));

    const result = await createMasterItemAction({ title: "Что-то" });

    expect(result).toEqual({ ok: false, error: "Можно добавить не больше 12 изделий." });
  });

  it("deleteMasterItemAction успешно удаляет и ревалидирует", async () => {
    mocks.deleteMasterItem.mockResolvedValue({ ok: true });

    const result = await deleteMasterItemAction("item-1");

    expect(mocks.deleteMasterItem).toHaveBeenCalledWith(USER.id, "item-1");
    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/master");
  });
});

describe("фото", () => {
  it("deleteMasterImageAction успешно удаляет фото", async () => {
    mocks.deleteMasterImage.mockResolvedValue({ ok: true });

    const result = await deleteMasterImageAction("img-1");

    expect(mocks.deleteMasterImage).toHaveBeenCalledWith(USER.id, "img-1");
    expect(result).toEqual({ ok: true });
  });

  it("setMasterItemCoverAction маппит IMAGE_NOT_ELIGIBLE", async () => {
    mocks.setMasterItemCover.mockRejectedValue(new Error("IMAGE_NOT_ELIGIBLE"));

    const result = await setMasterItemCoverAction("item-1", "img-1");

    expect(result).toEqual({ ok: false, error: "Это фото нельзя сделать обложкой этого изделия." });
  });

  it("reorderMasterImagesAction прокидывает scope как есть и маппит IMAGE_REORDER_MISMATCH", async () => {
    mocks.reorderMasterImages.mockRejectedValue(new Error("IMAGE_REORDER_MISMATCH"));

    const result = await reorderMasterImagesAction({ itemId: null, imageIds: ["a", "b"] });

    expect(mocks.reorderMasterImages).toHaveBeenCalledWith(USER.id, { itemId: null, imageIds: ["a", "b"] });
    expect(result).toEqual({ ok: false, error: "Порядок фото уже изменился — обновите страницу." });
  });
});
