import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие server action курсов валют (app/(admin)/admin/settings/currency/actions.ts):
// невалидный ввод возвращается формой как ошибка (а не улетает в error boundary),
// успех пишется в аудит и ревалидирует склад.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  revalidatePath: vi.fn(),
  listSystemCurrencyRates: vi.fn(),
  upsertSystemCurrencyRates: vi.fn(),
  recordAuditEvent: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/features/system/currency-rates", () => ({
  listSystemCurrencyRates: mocks.listSystemCurrencyRates,
  upsertSystemCurrencyRates: mocks.upsertSystemCurrencyRates
}));
vi.mock("@/features/audit/service", () => ({ recordAuditEvent: mocks.recordAuditEvent }));

import { updateCurrencySettingsAction } from "../app/(admin)/admin/settings/currency/actions";

const ADMIN = { id: "admin-1", email: "admin@example.ru", role: "admin" };

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.requireRole.mockResolvedValue(ADMIN);
  mocks.listSystemCurrencyRates.mockResolvedValue({ RUB: 100, USD: 7900, EUR: 9170 });
});

describe("updateCurrencySettingsAction", () => {
  it("сохраняет курсы, пишет аудит и ревалидирует склад", async () => {
    const result = await updateCurrencySettingsAction({ usdRubRate: "81,5", eurRubRate: "95.25" });

    expect(result).toEqual({ ok: true });
    expect(mocks.requireRole).toHaveBeenCalledWith("admin");
    expect(mocks.upsertSystemCurrencyRates).toHaveBeenCalledWith({ RUB: 100, USD: 8150, EUR: 9525 });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "currency.update",
        actorUserId: ADMIN.id,
        actorEmail: ADMIN.email,
        payload: {
          previous: { USD: 7900, EUR: 9170 },
          next: { USD: 8150, EUR: 9525 }
        }
      })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/settings/currency");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/ingredients");
  });

  it("возвращает ошибку вместо исключения на пустом и нулевом курсе", async () => {
    const empty = await updateCurrencySettingsAction({ usdRubRate: "", eurRubRate: "95" });
    expect(empty).toEqual({ ok: false, error: "Курс USD → RUB должен быть больше нуля." });

    const zero = await updateCurrencySettingsAction({ usdRubRate: "81", eurRubRate: "0" });
    expect(zero).toEqual({ ok: false, error: "Курс EUR → RUB должен быть больше нуля." });

    expect(mocks.upsertSystemCurrencyRates).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("пробрасывает NEXT_REDIRECT из requireRole", async () => {
    const error = new Error("NEXT_REDIRECT") as Error & { digest: string };
    error.digest = "NEXT_REDIRECT;replace;/app;307;";
    mocks.requireRole.mockRejectedValue(error);

    await expect(updateCurrencySettingsAction({ usdRubRate: "81", eurRubRate: "95" })).rejects.toThrow("NEXT_REDIRECT");
  });
});
