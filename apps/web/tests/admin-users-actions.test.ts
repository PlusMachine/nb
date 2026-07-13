import { beforeEach, describe, expect, it, vi } from "vitest";

// Server actions раздела «Пользователи»: сервис и гейты мокаются, проверяется
// только сам слой actions — маппинг кодов ошибок в русские сообщения,
// revalidatePath и обязательный проброс NEXT_REDIRECT из requireRole.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  changeUserRole: vi.fn(),
  blockUserAccount: vi.fn(),
  unblockUserAccount: vi.fn(),
  anonymizeUserAccount: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
// contracts.ts берёт список ролей из @nb/auth — мок обязан его отдать,
// иначе isUserRole упадёт на undefined ещё до проверки роли.
vi.mock("@nb/auth", () => ({ ROLES: ["user", "editor", "moderator", "admin"] }));
vi.mock("@/features/admin-users/service", () => ({
  changeUserRole: mocks.changeUserRole,
  blockUserAccount: mocks.blockUserAccount,
  unblockUserAccount: mocks.unblockUserAccount,
  anonymizeUserAccount: mocks.anonymizeUserAccount
}));

import {
  anonymizeUserAction,
  blockUserAction,
  changeUserRoleAction,
  unblockUserAction
} from "../app/(admin)/admin/users/actions";

const ADMIN = { id: "admin-1", email: "admin@mail.ru", role: "admin" as const };
const TARGET = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.requireRole.mockResolvedValue(ADMIN);
});

describe("changeUserRoleAction", () => {
  it("зовёт сервис с актором и ревалидирует обе страницы", async () => {
    mocks.changeUserRole.mockResolvedValue(undefined);

    await expect(changeUserRoleAction(TARGET, "editor")).resolves.toEqual({ ok: true });

    expect(mocks.requireRole).toHaveBeenCalledWith("admin");
    expect(mocks.changeUserRole).toHaveBeenCalledWith({
      actor: { id: ADMIN.id, email: ADMIN.email },
      userId: TARGET,
      role: "editor"
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/users/${TARGET}`);
  });

  it("неизвестную роль до сервиса не пускает", async () => {
    await expect(changeUserRoleAction(TARGET, "superuser")).resolves.toEqual({
      ok: false,
      error: "Неизвестная роль."
    });
    expect(mocks.changeUserRole).not.toHaveBeenCalled();
  });

  it("переводит код отказа в человеческое сообщение", async () => {
    mocks.changeUserRole.mockRejectedValue(new Error("LAST_ADMIN"));

    await expect(changeUserRoleAction(TARGET, "user")).resolves.toEqual({
      ok: false,
      error: "Это последний администратор. Сначала назначьте другого."
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("свою роль не меняет", async () => {
    mocks.changeUserRole.mockRejectedValue(new Error("ROLE_SELF"));

    await expect(changeUserRoleAction(ADMIN.id, "user")).resolves.toEqual({
      ok: false,
      error: "Свою роль сменить нельзя — попросите другого администратора."
    });
  });

  it("незнакомую ошибку не показывает сырой", async () => {
    mocks.changeUserRole.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(changeUserRoleAction(TARGET, "user")).resolves.toEqual({
      ok: false,
      error: "Не удалось выполнить операцию."
    });
  });

  it("пробрасывает NEXT_REDIRECT из requireRole", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/app;307;" });
    mocks.requireRole.mockRejectedValue(redirect);

    await expect(changeUserRoleAction(TARGET, "user")).rejects.toBe(redirect);
  });
});

describe("blockUserAction / unblockUserAction", () => {
  it("передаёт причину блокировки как есть", async () => {
    mocks.blockUserAccount.mockResolvedValue({ masterSlug: null });

    await expect(blockUserAction(TARGET, "  спам в рецептах ")).resolves.toEqual({ ok: true });
    expect(mocks.blockUserAccount).toHaveBeenCalledWith({
      actor: { id: ADMIN.id, email: ADMIN.email },
      userId: TARGET,
      reason: "  спам в рецептах "
    });
  });

  it("у мастера блокировка сбрасывает кэш витрины", async () => {
    mocks.blockUserAccount.mockResolvedValue({ masterSlug: "kuznec-ivan" });

    await expect(blockUserAction(TARGET, "спам в рецептах")).resolves.toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/market");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/masters/kuznec-ivan");
  });

  it("без витрины лишних путей не ревалидирует", async () => {
    mocks.blockUserAccount.mockResolvedValue({ masterSlug: null });

    await blockUserAction(TARGET, "спам в рецептах");
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/market");
  });

  it("короткую причину сервис отбивает, действие показывает текст", async () => {
    mocks.blockUserAccount.mockRejectedValue(new Error("REASON_TOO_SHORT"));

    await expect(blockUserAction(TARGET, "ок")).resolves.toEqual({
      ok: false,
      error: "Причина — от 3 символов."
    });
  });

  it("разблокировка ревалидирует карточку", async () => {
    mocks.unblockUserAccount.mockResolvedValue(undefined);

    await expect(unblockUserAction(TARGET)).resolves.toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/users/${TARGET}`);
  });
});

describe("anonymizeUserAction", () => {
  it("передаёт подтверждение в сервис", async () => {
    mocks.anonymizeUserAccount.mockResolvedValue({ masterSlug: null });

    await expect(anonymizeUserAction(TARGET, "brewer@mail.ru")).resolves.toEqual({ ok: true });
    expect(mocks.anonymizeUserAccount).toHaveBeenCalledWith({
      actor: { id: ADMIN.id, email: ADMIN.email },
      userId: TARGET,
      confirmation: "brewer@mail.ru"
    });
  });

  it("у мастера обезличивание сбрасывает кэш витрины", async () => {
    mocks.anonymizeUserAccount.mockResolvedValue({ masterSlug: "kuznec-ivan" });

    await expect(anonymizeUserAction(TARGET, "brewer@mail.ru")).resolves.toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/market");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/masters/kuznec-ivan");
  });

  it("несовпадение подтверждения — понятный отказ", async () => {
    mocks.anonymizeUserAccount.mockRejectedValue(new Error("CONFIRMATION_MISMATCH"));

    await expect(anonymizeUserAction(TARGET, "не тот")).resolves.toEqual({
      ok: false,
      error: "Подтверждение не совпадает с данными аккаунта."
    });
  });
});
