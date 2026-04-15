import { starterEquipmentProfileDefaults, type EquipmentBrewMethod, type EquipmentProfilePayload } from "../equipment-profiles/contracts";

export const buildStarterEquipmentProfileDefaults = (
  brewMethod: EquipmentBrewMethod = "biab_single_vessel"
): EquipmentProfilePayload => ({
  ...starterEquipmentProfileDefaults,
  name: brewMethod === "biab_single_vessel" ? "Starter 20L BIAB" : "Starter 20L profile",
  brewMethod,
  brewhouseEfficiencyPct: brewMethod === "biab_single_vessel" ? 68 : 72,
  grainAbsorptionLPerKg: brewMethod === "biab_single_vessel" ? 0.7 : 0.9,
  mashTunDeadspaceL: brewMethod === "biab_single_vessel" ? 0 : starterEquipmentProfileDefaults.mashTunDeadspaceL
});
