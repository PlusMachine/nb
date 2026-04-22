import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const equipmentProfile = {
  id: "00000000-0000-4000-8000-000000000301",
  userId: "00000000-0000-4000-8000-000000000002",
  name: "Garage BIAB",
  brewMethod: "biab_single_vessel",
  targetBatchVolumeL: 20,
  boilTimeMin: 60,
  brewhouseEfficiencyPct: 75,
  mashEfficiencyPct: null as number | null,
  evaporationRateLPerHr: 3,
  trubChillerLossL: 1,
  fermenterLossL: 0,
  mashTunDeadspaceL: 0,
  spargeVesselDeadspaceL: 0,
  grainAbsorptionLPerKg: 0.75,
  coolingShrinkagePct: 4,
  topUpWaterL: 0,
  mashThicknessLPerKg: 3,
  maxMashVolumeL: null as number | null,
  maxKettleVolumeL: null as number | null,
  hopUtilizationFactor: 1,
  altitudeM: 0,
  isDefault: true,
  notes: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const secondaryEquipmentProfile = {
  ...equipmentProfile,
  id: "00000000-0000-4000-8000-000000000302",
  name: "Pilot Kettle",
  targetBatchVolumeL: 12,
  brewhouseEfficiencyPct: 68,
  evaporationRateLPerHr: 2.5,
  trubChillerLossL: 0.7,
  fermenterLossL: 0.3,
  mashTunDeadspaceL: 0.5,
  spargeVesselDeadspaceL: 0.2,
  maxMashVolumeL: 14,
  maxKettleVolumeL: 18,
  isDefault: false
};

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000002", email: "u@example.com" })),
  listEquipmentProfiles: vi.fn(async () => [equipmentProfile]),
  getEquipmentProfile: vi.fn(async () => equipmentProfile),
  createEquipmentProfile: vi.fn(async () => equipmentProfile),
  updateEquipmentProfile: vi.fn(async () => equipmentProfile),
  deleteEquipmentProfile: vi.fn(async () => equipmentProfile),
  duplicateEquipmentProfile: vi.fn(async () => secondaryEquipmentProfile),
  setDefaultEquipmentProfile: vi.fn(async () => secondaryEquipmentProfile),
  revalidatePath: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  })
}));

vi.mock("../lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../features/equipment-profiles/service", () => ({
  listEquipmentProfiles: mocks.listEquipmentProfiles,
  getEquipmentProfile: mocks.getEquipmentProfile,
  createEquipmentProfile: mocks.createEquipmentProfile,
  updateEquipmentProfile: mocks.updateEquipmentProfile,
  deleteEquipmentProfile: mocks.deleteEquipmentProfile,
  duplicateEquipmentProfile: mocks.duplicateEquipmentProfile,
  setDefaultEquipmentProfile: mocks.setDefaultEquipmentProfile
}));

const buildFormData = () => {
  const formData = new FormData();
  formData.set("name", "Garage BIAB");
  formData.set("brewMethod", "mash_sparge_two_vessel");
  formData.set("targetBatchVolumeL", "20");
  formData.set("boilTimeMin", "60");
  formData.set("brewhouseEfficiencyPct", "75");
  formData.set("evaporationRateLPerHr", "3");
  formData.set("trubChillerLossL", "1");
  formData.set("fermenterLossL", "0");
  formData.set("mashTunDeadspaceL", "0.4");
  formData.set("spargeVesselDeadspaceL", "0.2");
  formData.set("grainAbsorptionLPerKg", "0.75");
  formData.set("coolingShrinkagePct", "4");
  formData.set("topUpWaterL", "0");
  formData.set("mashThicknessLPerKg", "3");
  formData.set("maxMashVolumeL", "");
  formData.set("maxKettleVolumeL", "");
  formData.set("hopUtilizationFactor", "1");
  formData.set("altitudeM", "0");
  formData.set("notes", "");
  return formData;
};

describe("equipment profiles page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listEquipmentProfiles.mockResolvedValue([equipmentProfile, secondaryEquipmentProfile]);
    mocks.getEquipmentProfile.mockResolvedValue(equipmentProfile);
    mocks.createEquipmentProfile.mockResolvedValue(equipmentProfile);
    mocks.updateEquipmentProfile.mockResolvedValue(equipmentProfile);
    mocks.deleteEquipmentProfile.mockResolvedValue(equipmentProfile);
    mocks.duplicateEquipmentProfile.mockResolvedValue(secondaryEquipmentProfile);
    mocks.setDefaultEquipmentProfile.mockResolvedValue(secondaryEquipmentProfile);
  });

  it("renders summary-first profile cards without open edit forms by default", async () => {
    const { default: EquipmentProfilesPage } = await import("../app/(app)/app/equipment/page");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let html = "";
    try {
      html = renderToStaticMarkup(await EquipmentProfilesPage({}));
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(mocks.listEquipmentProfiles).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000002");
    expect(html).toContain("Профили оборудования");
    expect(html).toContain("2 профиля");
    expect(html).toContain("основной: Garage BIAB");
    expect(html).toContain("Garage BIAB");
    expect(html).toContain("Pilot Kettle");
    expect(html).toContain("Основной");
    expect(html).toContain("Типичный объем партии");
    expect(html).toContain("Эффективность");
    expect(html).toContain("Испарение");
    expect(html).toContain("Редактировать");
    expect(html).toContain("Дублировать");
    expect(html).toContain("Сделать основным");
    expect(html).toContain("Удалить");
    expect(html).not.toContain("Новый профиль");
    expect(html).not.toContain("Сохранить профиль");
    expect(html).not.toContain("В мастер рецептов");
    expect(html).not.toContain("Сохраните размеры варочника");
    expect(html).not.toContain("Сначала обзор");
    expect(html).not.toContain("Объем котла");
    expect(html).not.toContain("Dead space");
    expect(html).not.toContain("Что будет рассчитано");
    expect(html).not.toContain("мин кипячения");
    expect(html.match(/Создать профиль/g) ?? []).toHaveLength(1);
    expect(html.match(/name="name"/g) ?? []).toHaveLength(0);
    expect(html).not.toContain("Тип системы");
    expect(html).not.toContain("BIAB / однопосудник");
    expect(html).not.toContain("В затор");
    expect(html).not.toContain("В промывку");
    expect(html).not.toContain("brewMethod");
    expect(html).not.toContain("mashEfficiencyPct");
    expect(html.match(/name="mashTunDeadspaceL"/g) ?? []).toHaveLength(0);
    expect(html.match(/name="spargeVesselDeadspaceL"/g) ?? []).toHaveLength(0);
    expect(html.match(/name="topUpWaterL"/g) ?? []).toHaveLength(0);
  });

  it("opens the create form only after the create CTA route is selected", async () => {
    const { default: EquipmentProfilesPage } = await import("../app/(app)/app/equipment/page");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let html = "";
    try {
      html = renderToStaticMarkup(await EquipmentProfilesPage({
        searchParams: Promise.resolve({ mode: "create" })
      }));
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(html).toContain("Новый профиль");
    expect(html).toContain("Профиль оборудования (1)");
    expect(html).toContain("Создать профиль");
    expect(html).not.toContain("Начните с рабочих значений");
    expect(html.match(/Создать профиль/g) ?? []).toHaveLength(1);
    expect(html).toContain("Типичный объем партии, л");
    expect(html).toContain("Испарение, л/ч");
    expect(html).toContain("Гидромодуль, л/кг");
    expect(html).not.toContain("Потери</h3>");
    expect(html).not.toContain("Потери и кипячение");
    expect(html).not.toContain("Кипячение, мин");
    expect(html).not.toContain("Вода / затор");
    expect(html).toContain("Еще параметры (опционально)");
    expect(html).toContain("Макс. объем котла, л (опц)");
    expect(html).toContain("Макс. объем заторника, л (опц.)");
    expect(html).not.toContain("Dead space заторника");
    expect(html).not.toContain("Dead space промывки");
    expect(html).not.toContain("Долив воды");
    expect(html.match(/name="name"/g) ?? []).toHaveLength(1);
  });

  it("opens only the selected profile editor inline", async () => {
    const { default: EquipmentProfilesPage } = await import("../app/(app)/app/equipment/page");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let html = "";
    try {
      html = renderToStaticMarkup(await EquipmentProfilesPage({
        searchParams: Promise.resolve({ edit: secondaryEquipmentProfile.id })
      }));
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(html).toContain("Garage BIAB");
    expect(html).toContain("Pilot Kettle");
    expect(html).toContain("Сохранить профиль");
    expect(html).toContain("Испарение, л/ч");
    expect(html).toContain("Гидромодуль, л/кг");
    expect(html).not.toContain("Потери</h3>");
    expect(html).not.toContain("Вода / затор");
    expect(html).toContain("Еще параметры (опционально)");
    expect(html).not.toContain("Кипячение, мин");
    expect(html).not.toContain("Дополнительно");
    expect(html).not.toContain("Dead space заторника");
    expect(html).not.toContain("Dead space промывки");
    expect(html).not.toContain("Долив воды");
    expect(html.match(/name="name"/g) ?? []).toHaveLength(1);
  });

  it("builds the next default equipment profile name from existing profiles", async () => {
    const { buildNextEquipmentProfileName } = await import("../features/equipment/defaults");

    expect(buildNextEquipmentProfileName([])).toBe("Профиль оборудования (1)");
    expect(buildNextEquipmentProfileName([{ name: "Профиль оборудования (1)" }])).toBe("Профиль оборудования (2)");
    expect(buildNextEquipmentProfileName([
      { name: "Профиль оборудования (1)" },
      { name: "Профиль оборудования (3)" },
      { name: "Garage BIAB" }
    ])).toBe("Профиль оборудования (2)");
  });

  it("creates equipment profile from form data", async () => {
    const { createEquipmentProfileAction } = await import("../app/(app)/app/equipment/actions");

    await expect(createEquipmentProfileAction(buildFormData())).rejects.toThrow("NEXT_REDIRECT:/app/equipment");
    expect(mocks.createEquipmentProfile).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
      expect.objectContaining({
        name: "Garage BIAB",
        brewMethod: "mash_sparge_two_vessel",
        targetBatchVolumeL: 20,
        mashTunDeadspaceL: 0.4,
        spargeVesselDeadspaceL: 0.2,
        topUpWaterL: 0
      })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/equipment");
  });

  it("updates equipment profile from the focused editor form", async () => {
    const { updateEquipmentProfileAction } = await import("../app/(app)/app/equipment/actions");
    const formData = buildFormData();
    mocks.getEquipmentProfile.mockResolvedValueOnce({ ...equipmentProfile, mashEfficiencyPct: 81 });

    await expect(updateEquipmentProfileAction(equipmentProfile.id, formData)).rejects.toThrow("NEXT_REDIRECT:/app/equipment");
    expect(mocks.updateEquipmentProfile).toHaveBeenLastCalledWith(
      "00000000-0000-4000-8000-000000000002",
      equipmentProfile.id,
      expect.objectContaining({
        brewMethod: "mash_sparge_two_vessel",
        mashEfficiencyPct: 81,
        targetBatchVolumeL: 20
      })
    );
  });

  it("deletes equipment profile from the card action", async () => {
    const { deleteEquipmentProfileAction } = await import("../app/(app)/app/equipment/actions");

    await expect(deleteEquipmentProfileAction(equipmentProfile.id)).rejects.toThrow("NEXT_REDIRECT:/app/equipment");
    expect(mocks.deleteEquipmentProfile).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
      equipmentProfile.id
    );
  });

  it("duplicates equipment profile from the card action", async () => {
    const { duplicateEquipmentProfileAction } = await import("../app/(app)/app/equipment/actions");

    await expect(duplicateEquipmentProfileAction(equipmentProfile.id)).rejects.toThrow("NEXT_REDIRECT:/app/equipment");
    expect(mocks.duplicateEquipmentProfile).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
      equipmentProfile.id
    );
  });

  it("marks a profile as default from the card action", async () => {
    const { setDefaultEquipmentProfileAction } = await import("../app/(app)/app/equipment/actions");

    await expect(setDefaultEquipmentProfileAction(secondaryEquipmentProfile.id)).rejects.toThrow("NEXT_REDIRECT:/app/equipment");
    expect(mocks.setDefaultEquipmentProfile).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
      secondaryEquipmentProfile.id
    );
  });
});
