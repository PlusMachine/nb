import { buildStarterEquipmentProfileDefaults } from "./defaults";

export const equipmentStarterPresets = [
  {
    id: "starter_20l",
    label: "Профиль оборудования (1)",
    description: "Эффективность 70%, поглощение воды зерном 0.80 л/кг.",
    profile: buildStarterEquipmentProfileDefaults()
  }
];
