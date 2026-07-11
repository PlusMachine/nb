import { describe, expect, it } from "vitest";

import {
  resolveConsumableInventoryBroadGroup,
  resolveConsumablePickerGroup
} from "../features/ingredients/consumables";
import type { ConsumableTechnicalData } from "../features/ingredients/contracts";

const buildTechnicalData = (overrides: Partial<ConsumableTechnicalData> = {}): ConsumableTechnicalData => ({
  type: "consumable",
  ...overrides
});

describe("resolveConsumablePickerGroup: usageStage packaging — эвристика последней надежды", () => {
  it("явная группа technical_additives не перебивается стадией розлива", () => {
    // Антиоксиданты/консерванты «для готового пива» вносятся при розливе
    // (usage_stage: packaging), но остаются техдобавками, а не тарой.
    const source = {
      technicalData: buildTechnicalData({
        pickerGroup: "technical_additives",
        usageStage: ["packaging", "finished_beer"]
      }),
      sourceCategory: "technical_additives",
      subcategory: "antioxidant",
      groupName: null,
      subtype: null,
      itemKind: null
    };

    expect(resolveConsumablePickerGroup(source)).toBe("technical_additives");
    expect(resolveConsumableInventoryBroadGroup(source)).toBe("inventory_additives");
  });

  it("без единого группового кандидата стадия розлива по-прежнему даёт packaging", () => {
    const source = {
      technicalData: buildTechnicalData({ usageStage: ["packaging"] }),
      sourceCategory: null,
      subcategory: null,
      groupName: null,
      subtype: null,
      itemKind: null
    };

    expect(resolveConsumablePickerGroup(source)).toBe("packaging");
    expect(resolveConsumableInventoryBroadGroup(source)).toBe("inventory_supplies");
  });

  it("не-техническая явная группа возвращается сразу, независимо от стадий", () => {
    const source = {
      technicalData: buildTechnicalData({
        pickerGroup: "citrus_zest",
        usageStage: ["packaging", "boil"]
      }),
      sourceCategory: null,
      subcategory: null,
      groupName: null,
      subtype: null,
      itemKind: null
    };

    expect(resolveConsumablePickerGroup(source)).toBe("citrus_zest");
    expect(resolveConsumableInventoryBroadGroup(source)).toBe("inventory_additives");
  });
});
