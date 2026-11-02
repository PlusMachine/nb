import { describe, expect, it } from "vitest";

import {
  buildCatalogPackageContentRows,
  buildCatalogReferenceRows,
  buildCatalogReferenceSections
} from "../features/ingredients/catalog-reference-details";
import { extractIngredientTechnicalData, extractIngredientTechnicalFields, getIngredientColorLovibond } from "../features/ingredients/technical-fields";

describe("catalog reference characteristics", () => {
  it("retains published EBC and protein without changing the color used in calculations", () => {
    const source = { type: "fermentable", attributes: {
      color_lovibond: 5,
      color_ebc_exact: 12.34,
      protein_pct: 14,
      extract_pct_dry_basis: 80,
      recommended_max_pct: 30,
      normalization_review_flags: ["hopping_state_not_confirmed"]
    } };
    const data = extractIngredientTechnicalData(source);
    expect(data).toMatchObject({ colorEbcExact: 12.34, proteinPct: 14 });
    expect(getIngredientColorLovibond(source)).toBe(5);
    expect(extractIngredientTechnicalFields(source)).toEqual({ fermentableColorLovibond: 5, fermentableExtractYieldPct: 80 });
    expect(buildCatalogReferenceRows(data)).toContainEqual({ label: "Цвет из источника", value: "12.34 EBC" });
    expect(buildCatalogReferenceSections(data)[0].value).toContain("Охмелённость продукта не подтверждена");
  });

  it("exposes water reference ions, dosage and storage without replacing concentration settings", () => {
    const source = { type: "water_treatment", attributes: {
      unit_preferred: "g",
      default_concentration_pct: 88,
      storage_notes_ru: "Хранить герметично.",
      typical_dose_reference: { mg_per_l: 9, approx_tablet_per_l: 1 / 75 },
      ion_contributions_ppm_per_g_per_l: { Ca: 232.8, SO4: 558, Na: 0 },
      ion_contributions_ppm_per_g_per_gal: { Ca: 61.5, SO4: 147.4 }
    } };
    const data = extractIngredientTechnicalData(source);
    expect(data).toMatchObject({ defaultConcentrationPct: 88, ionContributionsPpmPerGPerL: { Ca: 232.8, SO4: 558, Na: 0 } });
    expect(extractIngredientTechnicalFields(source)).toEqual({ unitPreferred: "g" });
    expect(buildCatalogReferenceRows(data)).toContainEqual({ label: "Добавка ионов при дозировке 1 г/л", value: "Ca: 232.8; SO₄: 558; Na: 0 ppm" });
    expect(buildCatalogReferenceSections(data)).toContainEqual({ label: "Хранение", value: "Хранить герметично." });
    expect(buildCatalogReferenceSections(data).find((section) => section.label === "Дозировка из источника")?.value).toContain("0.0133 табл./л");
  });

  it("associates secondary contents with the correct package and keeps raw reference units", () => {
    const data = extractIngredientTechnicalData({ type: "consumable", attributes: {
      capacity_per_piece: { amount: 330, unit: "ml" },
      closure_standard: "26mm crown",
      package_content_details: [
        { package_variant_id: "tablets", content_per_piece: { amount: 10, unit: "g_each" }, content_per_package: { amount: 120, unit: "g" } },
        { package_variant_id: "co2", content_per_piece: { amount: 16, unit: "g" }, content_per_package: { amount: 160, unit: "g_co2" } }
      ]
    } });
    expect(data).toMatchObject({ packageContentDetails: [{ contentPerPiece: { amount: 10, unit: "g_each" } }, { contentPerPackage: { amount: 160, unit: "g_co2" } }] });
    expect(buildCatalogReferenceRows(data)).toContainEqual({ label: "Вместимость единицы", value: "330 мл" });
    expect(buildCatalogPackageContentRows(data, "tablets")).toEqual([{ label: "На единицу", value: "10 г" }, { label: "В упаковке", value: "120 г" }]);
    expect(buildCatalogPackageContentRows(data, "co2")).toContainEqual({ label: "В упаковке", value: "160 г CO₂" });
    expect(buildCatalogPackageContentRows(data, "missing")).toEqual([]);
  });

  it("preserves source annotations and makes oil unit caveats readable", () => {
    const data = extractIngredientTechnicalData({ type: "hop", attributes: {
      oil_value_unit_warning: "source anomaly / likely mg vs mL mismatch",
      source_metadata: [{ url: "https://example.com/hop", confidence: "medium", page: 49 }]
    } });
    expect(data).toMatchObject({ sourceMetadata: [{ url: "https://example.com/hop", confidence: "medium", page: 49 }] });
    expect(buildCatalogReferenceSections(data)[0].value).toContain("несоответствие единиц измерения масел");
  });

  it("omits missing or invalid optional reference information", () => {
    expect(buildCatalogReferenceRows(null)).toEqual([]);
    expect(buildCatalogReferenceSections({ type: "consumable" })).toEqual([]);
    const data = extractIngredientTechnicalData({ type: "consumable", attributes: {
      capacity_per_piece: { amount: "330", unit: "ml" },
      package_content_details: [{ content_per_piece: { amount: 10, unit: "g" } }]
    } });
    expect(buildCatalogReferenceRows(data)).toEqual([]);
    expect(buildCatalogPackageContentRows(data, "missing")).toEqual([]);
  });
});
