import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const equipmentProfile = {
  id: "00000000-0000-4000-8000-000000000301",
  userId: "00000000-0000-4000-8000-000000000002",
  name: "Garage BIAB",
  brewMethod: "biab_single_vessel",
  batchTargetType: "fermenter",
  targetBatchVolumeL: 20,
  boilTimeMin: 60,
  brewhouseEfficiencyPct: 75,
  mashEfficiencyPct: null,
  evaporationRateLPerHr: 3,
  trubChillerLossL: 1,
  fermenterLossL: 0,
  mashTunDeadspaceL: 0,
  spargeVesselDeadspaceL: 0,
  grainAbsorptionLPerKg: 0.75,
  coolingShrinkagePct: 4,
  topUpWaterL: 0,
  mashThicknessLPerKg: 3,
  maxMashVolumeL: null,
  maxKettleVolumeL: null,
  hopUtilizationFactor: 1,
  altitudeM: 0,
  notes: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000002", email: "u@example.com" })),
  listEquipmentProfiles: vi.fn(async () => [equipmentProfile]),
  createEquipmentProfile: vi.fn(async () => equipmentProfile),
  updateEquipmentProfile: vi.fn(async () => equipmentProfile),
  deleteEquipmentProfile: vi.fn(async () => equipmentProfile),
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
  createEquipmentProfile: mocks.createEquipmentProfile,
  updateEquipmentProfile: mocks.updateEquipmentProfile,
  deleteEquipmentProfile: mocks.deleteEquipmentProfile
}));

const buildFormData = () => {
  const formData = new FormData();
  formData.set("name", "Garage BIAB");
  formData.set("brewMethod", "biab_single_vessel");
  formData.set("batchTargetType", "fermenter");
  formData.set("targetBatchVolumeL", "20");
  formData.set("boilTimeMin", "60");
  formData.set("brewhouseEfficiencyPct", "75");
  formData.set("mashEfficiencyPct", "");
  formData.set("evaporationRateLPerHr", "3");
  formData.set("trubChillerLossL", "1");
  formData.set("fermenterLossL", "0");
  formData.set("mashTunDeadspaceL", "0");
  formData.set("spargeVesselDeadspaceL", "0");
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
  it("renders reusable equipment profile management", async () => {
    const { default: EquipmentProfilesPage } = await import("../app/(app)/app/equipment/page");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let html = "";
    try {
      html = renderToStaticMarkup(await EquipmentProfilesPage());
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(mocks.listEquipmentProfiles).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000002");
    expect(html).toContain("Профили оборудования");
    expect(html).toContain("Garage BIAB");
    expect(html).toContain("Объем партии");
    expect(html).toContain("Расширенные параметры");
  });

  it("creates equipment profile from form data", async () => {
    const { createEquipmentProfileAction } = await import("../app/(app)/app/equipment/actions");

    await expect(createEquipmentProfileAction(buildFormData())).rejects.toThrow("NEXT_REDIRECT:/app/equipment");
    expect(mocks.createEquipmentProfile).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
      expect.objectContaining({ name: "Garage BIAB", targetBatchVolumeL: 20 })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/equipment");
  });
});
