import { buildStarterEquipmentProfileDefaults } from "./defaults";

export const equipmentStarterPresets = [
  {
    id: "starter_biab_20l",
    label: "Starter 20L BIAB",
    description: "No sparge, 68% efficiency, 0.70 L/kg grain absorption.",
    profile: buildStarterEquipmentProfileDefaults("biab_single_vessel")
  },
  {
    id: "starter_sparge_20l",
    label: "Starter 20L mash + sparge",
    description: "Default sparge, 72% efficiency, 0.90 L/kg grain absorption.",
    profile: buildStarterEquipmentProfileDefaults("mash_sparge_two_vessel")
  }
];
