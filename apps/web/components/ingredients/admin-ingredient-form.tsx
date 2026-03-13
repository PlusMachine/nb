"use client";

import { useState } from "react";

import {
  ingredientCompletenessLevels,
  ingredientMatchPolicies,
  type IngredientCatalogItemDto
} from "@/features/ingredients/contracts";
import {
  extractIngredientTechnicalFields,
  miscUsagePhaseLabels,
  miscUsagePhases,
  waterPrepPhysicalFormLabels,
  waterPrepPhysicalForms,
  yeastFlocculationLabels,
  yeastFlocculationLevels,
  yeastFormLabels,
  yeastForms
} from "@/features/ingredients/technical-fields";
import {
  ingredientCategories,
  ingredientCategorySubtypes,
  ingredientDisplayUnits,
  isIngredientSubtypeForCategory,
  resolveIngredientCategory,
  resolveIngredientSubtype,
  resolveIngredientUnits,
  type IngredientCategory,
  type IngredientDisplayUnit,
  type IngredientSubtype
} from "@/features/ingredients/taxonomy";

type IngredientFormValue = Partial<IngredientCatalogItemDto> & { id?: string };

type AdminIngredientFieldVisibility = {
  primary: string[];
  advanced: string[];
};

const inputClassName = "mt-1 w-full rounded border p-2";
const sectionClassName = "space-y-3 rounded-lg border p-4";

const formatEnumLabel = (value: string) => value
  .split("_")
  .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
  .join(" ");

const readOptionalText = (formData: FormData, key: string) => {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
};

const readOptionalNumber = (formData: FormData, key: string) => {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const readOptionalBoolean = (formData: FormData, key: string) => {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) {
    return null;
  }

  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  return null;
};

const readStringArray = (formData: FormData, key: string) => String(formData.get(key) ?? "")
  .split(/[\n,]/)
  .map((item) => item.trim())
  .filter(Boolean);

export const getAdminIngredientSubtypeOptions = (
  category: IngredientCategory
): readonly IngredientSubtype[] => ingredientCategorySubtypes[category];

export const getNextAdminIngredientTaxonomyState = (
  current: { category: IngredientCategory; subtype: IngredientSubtype | null },
  next: { category?: IngredientCategory; subtype?: string | null }
) => {
  if (next.category) {
    const category = next.category;
    const subtype = current.subtype && isIngredientSubtypeForCategory(category, current.subtype)
      ? current.subtype
      : ingredientCategorySubtypes[category][0] ?? null;

    return { category, subtype };
  }

  if (next.subtype && isIngredientSubtypeForCategory(current.category, next.subtype)) {
    return { category: current.category, subtype: next.subtype };
  }

  return {
    category: current.category,
    subtype: ingredientCategorySubtypes[current.category][0] ?? null
  };
};

export const getAdminIngredientFieldVisibility = (
  category: IngredientCategory,
  subtype: IngredientSubtype | null
): AdminIngredientFieldVisibility => {
  if (category === "fermentable") {
    return {
      primary: ["fermentableColorEbc", "fermentableExtractYieldPct"],
      advanced: [
        "fermentableProteinPct",
        "fermentableMoisturePct",
        "fermentableMaxUsagePercent",
        "fermentableDiastaticPowerLintner",
        "fermentableUsageFlags"
      ]
    };
  }

  if (category === "hop") {
    return {
      primary: ["hopAlphaAcidPct", "harvestYear"],
      advanced: ["hopBetaAcidPct", "hopTotalOilMlPer100g", "hopNotes"]
    };
  }

  if (category === "yeast") {
    return {
      primary: [
        "yeastForm",
        "yeastAttenuationPct",
        "yeastMinFermentationTempC",
        "yeastMaxFermentationTempC",
        "yeastPackageSize",
        "yeastPackageUnit"
      ],
      advanced: [
        "yeastFlocculation",
        "yeastAlcoholTolerancePct",
        "yeastPhenolic",
        "yeastDiastaticus"
      ]
    };
  }

  if (category === "water_prep") {
    return {
      primary: [
        ...(subtype === "salt" || subtype === "base" ? ["waterPrepCompound"] : []),
        ...(subtype === "acid" ? ["waterPrepAcidType"] : []),
        "waterPrepPhysicalForm",
        ...(subtype === "acid" || subtype === "base" ? ["waterPrepStrengthPct"] : []),
        "waterPrepPurityPct"
      ],
      advanced: []
    };
  }

  return {
    primary: ["miscUsagePhase", "miscDoseHint"],
    advanced: []
  };
};

const resolveInitialCategory = (initial?: IngredientFormValue): IngredientCategory => (
  resolveIngredientCategory({
    category: initial?.category,
    type: initial?.type,
    subtype: initial?.subtype,
    displayName: initial?.displayName,
    properties: initial?.properties ?? {},
    hopForm: initial?.hopForm,
    yeastType: initial?.yeastType,
    yeastForm: initial?.yeastForm
  })
);

const resolveInitialSubtype = (
  initialCategory: IngredientCategory,
  initial?: IngredientFormValue
): IngredientSubtype => {
  const resolvedSubtype = resolveIngredientSubtype({
    category: initial?.category ?? initialCategory,
    type: initial?.type,
    subtype: initial?.subtype,
    displayName: initial?.displayName,
    properties: initial?.properties ?? {},
    hopForm: initial?.hopForm,
    yeastType: initial?.yeastType,
    yeastForm: initial?.yeastForm
  });

  if (resolvedSubtype && isIngredientSubtypeForCategory(initialCategory, resolvedSubtype)) {
    return resolvedSubtype;
  }

  return ingredientCategorySubtypes[initialCategory][0];
};

const isLiquidStrengthSubtype = (category: IngredientCategory, subtype: IngredientSubtype | null) => (
  category === "water_prep" && (subtype === "acid" || subtype === "base")
);

export const AdminIngredientForm = ({ initial }: { initial?: IngredientFormValue }) => {
  const initialCategory = resolveInitialCategory(initial);
  const initialSubtype = resolveInitialSubtype(initialCategory, initial);
  const initialTechnicalFields = extractIngredientTechnicalFields({
    category: initial?.category ?? initialCategory,
    subtype: initial?.subtype ?? initialSubtype,
    type: initial?.type ?? null,
    technicalData: initial?.technicalData ?? null,
    manufacturer: initial?.manufacturer ?? null,
    country: initial?.country ?? null,
    harvestYear: initial?.harvestYear ?? null,
    fermentableColorEbc: initial?.fermentableColorEbc ?? null,
    fermentableExtractYieldPct: initial?.fermentableExtractYieldPct ?? null,
    fermentableProteinPct: initial?.fermentableProteinPct ?? null,
    fermentableMoisturePct: initial?.fermentableMoisturePct ?? null,
    fermentableMaxUsagePercent: initial?.fermentableMaxUsagePercent ?? null,
    fermentableDiastaticPowerLintner: initial?.fermentableDiastaticPowerLintner ?? null,
    fermentableUsageFlags: initial?.fermentableUsageFlags ?? null,
    hopAlphaAcidPct: initial?.hopAlphaAcidPct ?? null,
    hopBetaAcidPct: initial?.hopBetaAcidPct ?? null,
    hopTotalOilMlPer100g: initial?.hopTotalOilMlPer100g ?? null,
    hopForm: initial?.hopForm ?? null,
    hopSeason: initial?.hopSeason ?? null,
    hopNotes: initial?.hopNotes ?? null,
    yeastAttenuationPct: initial?.yeastAttenuationPct ?? null,
    yeastType: initial?.yeastType ?? null,
    yeastForm: initial?.yeastForm ?? null,
    yeastMinFermentationTempC: initial?.yeastMinFermentationTempC ?? null,
    yeastMaxFermentationTempC: initial?.yeastMaxFermentationTempC ?? null,
    yeastFlocculation: initial?.yeastFlocculation ?? null,
    yeastAlcoholTolerancePct: initial?.yeastAlcoholTolerancePct ?? null,
    yeastPackageSize: initial?.yeastPackageSize ?? null,
    yeastPackageUnit: initial?.yeastPackageUnit ?? null,
    yeastPhenolic: initial?.yeastPhenolic ?? null,
    yeastDiastaticus: initial?.yeastDiastaticus ?? null,
    waterPrepCompound: initial?.waterPrepCompound ?? null,
    waterPrepAcidType: initial?.waterPrepAcidType ?? null,
    waterPrepStrengthPct: initial?.waterPrepStrengthPct ?? null,
    waterPrepPurityPct: initial?.waterPrepPurityPct ?? null,
    waterPrepPhysicalForm: initial?.waterPrepPhysicalForm ?? null,
    miscUsagePhase: initial?.miscUsagePhase ?? null,
    miscDoseHint: initial?.miscDoseHint ?? null,
    properties: initial?.properties ?? {}
  });
  const initialYeastForm = initialTechnicalFields.yeastForm ?? "";
  const initialWaterPrepPhysicalForm = initialTechnicalFields.waterPrepPhysicalForm ?? "";
  const initialUnits = resolveIngredientUnits({
    category: initialCategory,
    subtype: initialSubtype,
    yeastForm: initialYeastForm || undefined,
    defaultDisplayUnit: initial?.defaultDisplayUnit ?? initial?.defaultUnit ?? undefined
  });

  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<IngredientCategory>(initialCategory);
  const [selectedSubtype, setSelectedSubtype] = useState<IngredientSubtype>(initialSubtype);
  const [selectedYeastForm, setSelectedYeastForm] = useState(initialYeastForm);
  const [selectedWaterPrepPhysicalForm, setSelectedWaterPrepPhysicalForm] = useState(initialWaterPrepPhysicalForm);
  const [selectedDefaultDisplayUnit, setSelectedDefaultDisplayUnit] = useState<IngredientDisplayUnit>(initialUnits.defaultDisplayUnit);
  const [taxonomyRevision, setTaxonomyRevision] = useState(0);
  const [propertiesJson, setPropertiesJson] = useState(JSON.stringify(initial?.properties ?? {}, null, 2));

  const subtypeOptions = getAdminIngredientSubtypeOptions(selectedCategory);
  const unitOptions = resolveIngredientUnits({
    category: selectedCategory,
    subtype: selectedSubtype,
    yeastForm: selectedCategory === "yeast" ? selectedYeastForm || undefined : undefined
  });
  const fieldVisibility = getAdminIngredientFieldVisibility(selectedCategory, selectedSubtype);
  const useInitialTaxonomyValues = selectedCategory === initialCategory && selectedSubtype === initialSubtype;
  const strengthRequired = isLiquidStrengthSubtype(selectedCategory, selectedSubtype)
    && (selectedWaterPrepPhysicalForm === "liquid" || selectedWaterPrepPhysicalForm === "solution");

  const setNextUnit = (nextCategory: IngredientCategory, nextSubtype: IngredientSubtype, nextYeastForm?: string | null) => {
    const nextUnits = resolveIngredientUnits({
      category: nextCategory,
      subtype: nextSubtype,
      yeastForm: nextCategory === "yeast" ? nextYeastForm || undefined : undefined
    });

    setSelectedDefaultDisplayUnit((current) => (
      nextUnits.allowedUnits.includes(current) ? current : nextUnits.defaultDisplayUnit
    ));
  };

  const handleCategoryChange = (nextCategory: IngredientCategory) => {
    const nextState = getNextAdminIngredientTaxonomyState({
      category: selectedCategory,
      subtype: selectedSubtype
    }, {
      category: nextCategory
    });

    const nextSubtype = nextState.subtype ?? ingredientCategorySubtypes[nextCategory][0];
    const restoreInitialValues = nextCategory === initialCategory && nextSubtype === initialSubtype;

    setSelectedCategory(nextCategory);
    setSelectedSubtype(nextSubtype);
    setSelectedYeastForm(nextCategory === "yeast" && restoreInitialValues ? initialYeastForm : "");
    setSelectedWaterPrepPhysicalForm(
      nextCategory === "water_prep" && restoreInitialValues ? initialWaterPrepPhysicalForm : ""
    );
    setNextUnit(nextCategory, nextSubtype, nextCategory === "yeast" && restoreInitialValues ? initialYeastForm : null);
    setTaxonomyRevision((value) => value + 1);
  };

  const handleSubtypeChange = (nextSubtypeValue: string) => {
    const nextState = getNextAdminIngredientTaxonomyState({
      category: selectedCategory,
      subtype: selectedSubtype
    }, {
      subtype: nextSubtypeValue
    });

    const nextSubtype = nextState.subtype ?? subtypeOptions[0];
    const restoreInitialValues = selectedCategory === initialCategory && nextSubtype === initialSubtype;

    setSelectedSubtype(nextSubtype);
    setSelectedYeastForm(selectedCategory === "yeast" && restoreInitialValues ? initialYeastForm : selectedYeastForm);
    setSelectedWaterPrepPhysicalForm(
      selectedCategory === "water_prep" && restoreInitialValues ? initialWaterPrepPhysicalForm : ""
    );
    setNextUnit(
      selectedCategory,
      nextSubtype,
      selectedCategory === "yeast" ? (restoreInitialValues ? initialYeastForm : selectedYeastForm) : null
    );
    setTaxonomyRevision((value) => value + 1);
  };

  const handleYeastFormChange = (nextValue: string) => {
    setSelectedYeastForm(nextValue);

    const nextUnits = resolveIngredientUnits({
      category: selectedCategory,
      subtype: selectedSubtype,
      yeastForm: nextValue || undefined
    });

    setSelectedDefaultDisplayUnit((current) => (
      nextUnits.allowedUnits.includes(current) ? current : nextUnits.defaultDisplayUnit
    ));
  };

  const renderAdvancedFields = () => {
    if (selectedCategory === "fermentable") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Protein (%)
            <input
              name="fermentableProteinPct"
              type="number"
              step="0.1"
              min="0"
              max="100"
              defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.fermentableProteinPct ?? "" : ""}
              className={inputClassName}
            />
          </label>
          <label className="text-sm">
            Moisture (%)
            <input
              name="fermentableMoisturePct"
              type="number"
              step="0.1"
              min="0"
              max="100"
              defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.fermentableMoisturePct ?? "" : ""}
              className={inputClassName}
            />
          </label>
          <label className="text-sm">
            Max usage (%)
            <input
              name="fermentableMaxUsagePercent"
              type="number"
              step="0.1"
              min="0"
              max="100"
              defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.fermentableMaxUsagePercent ?? "" : ""}
              className={inputClassName}
            />
          </label>
          <label className="text-sm">
            Diastatic power (Lintner)
            <input
              name="fermentableDiastaticPowerLintner"
              type="number"
              step="0.1"
              min="0"
              defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.fermentableDiastaticPowerLintner ?? "" : ""}
              className={inputClassName}
            />
          </label>
          <label className="col-span-2 text-sm">
            Usage flags
            <textarea
              name="fermentableUsageFlags"
              defaultValue={useInitialTaxonomyValues ? (initialTechnicalFields.fermentableUsageFlags ?? []).join("\n") : ""}
              className="mt-1 h-24 w-full rounded border p-2"
              placeholder="mash only&#10;late addition"
            />
          </label>
        </div>
      );
    }

    if (selectedCategory === "hop") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Beta acid (%)
            <input
              name="hopBetaAcidPct"
              type="number"
              step="0.1"
              min="0"
              max="100"
              defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.hopBetaAcidPct ?? "" : ""}
              className={inputClassName}
            />
          </label>
          <label className="text-sm">
            Total oil (ml/100g)
            <input
              name="hopTotalOilMlPer100g"
              type="number"
              step="0.01"
              min="0"
              max="20"
              defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.hopTotalOilMlPer100g ?? "" : ""}
              className={inputClassName}
            />
          </label>
          <label className="col-span-2 text-sm">
            Notes
            <textarea
              name="hopNotes"
              defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.hopNotes ?? "" : ""}
              className="mt-1 h-24 w-full rounded border p-2"
            />
          </label>
        </div>
      );
    }

    if (selectedCategory === "yeast") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Flocculation
            <select
              name="yeastFlocculation"
              defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.yeastFlocculation ?? "" : ""}
              className={inputClassName}
            >
              <option value="">Unknown</option>
              {yeastFlocculationLevels.map((value) => (
                <option key={value} value={value}>{yeastFlocculationLabels[value]}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Alcohol tolerance (%)
            <input
              name="yeastAlcoholTolerancePct"
              type="number"
              step="0.1"
              min="0"
              max="100"
              defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.yeastAlcoholTolerancePct ?? "" : ""}
              className={inputClassName}
            />
          </label>
          <label className="text-sm">
            Phenolic
            <select
              name="yeastPhenolic"
              defaultValue={useInitialTaxonomyValues
                ? initialTechnicalFields.yeastPhenolic == null
                  ? ""
                  : String(initialTechnicalFields.yeastPhenolic)
                : ""}
              className={inputClassName}
            >
              <option value="">Unknown</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="text-sm">
            Diastaticus
            <select
              name="yeastDiastaticus"
              defaultValue={useInitialTaxonomyValues
                ? initialTechnicalFields.yeastDiastaticus == null
                  ? ""
                  : String(initialTechnicalFields.yeastDiastaticus)
                : ""}
              className={inputClassName}
            >
              <option value="">Unknown</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
        </div>
      );
    }

    return null;
  };

  return (
    <form
      className="space-y-4 rounded-lg border p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);

        const formData = new FormData(event.currentTarget);
        let properties: Record<string, unknown> = {};
        try {
          properties = JSON.parse(propertiesJson);
        } catch {
          setError("Properties must be valid JSON");
          return;
        }

        const units = resolveIngredientUnits({
          category: selectedCategory,
          subtype: selectedSubtype,
          yeastForm: selectedCategory === "yeast" ? selectedYeastForm || undefined : undefined,
          defaultDisplayUnit: selectedDefaultDisplayUnit
        });

        const payload = {
          category: selectedCategory,
          subtype: selectedSubtype,
          canonicalFamilyName: readOptionalText(formData, "canonicalFamilyName"),
          familyDisplayNameRu: readOptionalText(formData, "familyDisplayNameRu"),
          familyDisplayNameEn: readOptionalText(formData, "familyDisplayNameEn"),
          matchPolicy: readOptionalText(formData, "matchPolicy"),
          displayName: String(formData.get("displayName") ?? "").trim(),
          aliases: readStringArray(formData, "aliases"),
          brandName: readOptionalText(formData, "brandName"),
          manufacturer: readOptionalText(formData, "manufacturer"),
          country: readOptionalText(formData, "country"),
          harvestYear: selectedCategory === "hop" ? readOptionalNumber(formData, "harvestYear") : null,
          description: readOptionalText(formData, "description"),
          defaultUnit: selectedDefaultDisplayUnit,
          defaultDisplayUnit: selectedDefaultDisplayUnit,
          allowedUnits: units.allowedUnits,
          measurementDimension: units.measurementDimension,
          completenessLevel: readOptionalText(formData, "completenessLevel"),
          fermentableColorEbc: selectedCategory === "fermentable" ? readOptionalNumber(formData, "fermentableColorEbc") : null,
          fermentableExtractYieldPct: selectedCategory === "fermentable" ? readOptionalNumber(formData, "fermentableExtractYieldPct") : null,
          fermentableProteinPct: selectedCategory === "fermentable" ? readOptionalNumber(formData, "fermentableProteinPct") : null,
          fermentableMoisturePct: selectedCategory === "fermentable" ? readOptionalNumber(formData, "fermentableMoisturePct") : null,
          fermentableMaxUsagePercent: selectedCategory === "fermentable" ? readOptionalNumber(formData, "fermentableMaxUsagePercent") : null,
          fermentableDiastaticPowerLintner: selectedCategory === "fermentable" ? readOptionalNumber(formData, "fermentableDiastaticPowerLintner") : null,
          fermentableUsageFlags: selectedCategory === "fermentable" ? readStringArray(formData, "fermentableUsageFlags") : [],
          hopAlphaAcidPct: selectedCategory === "hop" ? readOptionalNumber(formData, "hopAlphaAcidPct") : null,
          hopBetaAcidPct: selectedCategory === "hop" ? readOptionalNumber(formData, "hopBetaAcidPct") : null,
          hopTotalOilMlPer100g: selectedCategory === "hop" ? readOptionalNumber(formData, "hopTotalOilMlPer100g") : null,
          hopNotes: selectedCategory === "hop" ? readOptionalText(formData, "hopNotes") : null,
          yeastForm: selectedCategory === "yeast" ? readOptionalText(formData, "yeastForm") : null,
          yeastAttenuationPct: selectedCategory === "yeast" ? readOptionalNumber(formData, "yeastAttenuationPct") : null,
          yeastMinFermentationTempC: selectedCategory === "yeast" ? readOptionalNumber(formData, "yeastMinFermentationTempC") : null,
          yeastMaxFermentationTempC: selectedCategory === "yeast" ? readOptionalNumber(formData, "yeastMaxFermentationTempC") : null,
          yeastFlocculation: selectedCategory === "yeast" ? readOptionalText(formData, "yeastFlocculation") : null,
          yeastAlcoholTolerancePct: selectedCategory === "yeast" ? readOptionalNumber(formData, "yeastAlcoholTolerancePct") : null,
          yeastPackageSize: selectedCategory === "yeast" ? readOptionalNumber(formData, "yeastPackageSize") : null,
          yeastPackageUnit: selectedCategory === "yeast" ? readOptionalText(formData, "yeastPackageUnit") : null,
          yeastPhenolic: selectedCategory === "yeast" ? readOptionalBoolean(formData, "yeastPhenolic") : null,
          yeastDiastaticus: selectedCategory === "yeast" ? readOptionalBoolean(formData, "yeastDiastaticus") : null,
          waterPrepCompound: selectedCategory === "water_prep" ? readOptionalText(formData, "waterPrepCompound") : null,
          waterPrepAcidType: selectedCategory === "water_prep" ? readOptionalText(formData, "waterPrepAcidType") : null,
          waterPrepStrengthPct: selectedCategory === "water_prep" ? readOptionalNumber(formData, "waterPrepStrengthPct") : null,
          waterPrepPurityPct: selectedCategory === "water_prep" ? readOptionalNumber(formData, "waterPrepPurityPct") : null,
          waterPrepPhysicalForm: selectedCategory === "water_prep" ? readOptionalText(formData, "waterPrepPhysicalForm") : null,
          miscUsagePhase: selectedCategory === "misc" ? readOptionalText(formData, "miscUsagePhase") : null,
          miscDoseHint: selectedCategory === "misc" ? readOptionalText(formData, "miscDoseHint") : null,
          properties,
          status: String(formData.get("status") ?? "active"),
          visibility: String(formData.get("visibility") ?? "public")
        };

        const method = initial?.id ? "PATCH" : "POST";
        const endpoint = initial?.id ? `/api/admin/ingredients/${initial.id}` : "/api/admin/ingredients";
        const response = await fetch(endpoint, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const data = await response.json() as { error?: string };
          setError(data.error ?? "Request failed");
          return;
        }

        window.location.href = "/admin/ingredients";
      }}
    >
      <h1 className="text-xl font-semibold">{initial?.id ? "Edit ingredient" : "Create ingredient"}</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className={sectionClassName}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600">Taxonomy</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Category
            <select
              name="category"
              value={selectedCategory}
              onChange={(event) => handleCategoryChange(event.target.value as IngredientCategory)}
              className={inputClassName}
            >
              {ingredientCategories.map((category) => (
                <option key={category} value={category}>{formatEnumLabel(category)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Subtype
            <select
              name="subtype"
              value={selectedSubtype}
              onChange={(event) => handleSubtypeChange(event.target.value)}
              className={inputClassName}
            >
              {subtypeOptions.map((subtype) => (
                <option key={subtype} value={subtype}>{formatEnumLabel(subtype)}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2 text-sm">
            Canonical family
            <input
              name="canonicalFamilyName"
              defaultValue={initial?.family?.canonicalName ?? initial?.displayName ?? ""}
              className={inputClassName}
              placeholder="Cascade"
            />
          </label>
          <label className="text-sm">
            Match policy
            <select name="matchPolicy" defaultValue={initial?.family?.matchPolicy ?? ""} className={inputClassName}>
              <option value="">Auto</option>
              {ingredientMatchPolicies.map((value) => (
                <option key={value} value={value}>{formatEnumLabel(value)}</option>
              ))}
            </select>
          </label>
          <details className="rounded border p-3">
            <summary className="cursor-pointer text-sm font-medium">Family localization</summary>
            <div className="mt-3 grid gap-3">
              <label className="text-sm">
                Family display name (RU)
                <input
                  name="familyDisplayNameRu"
                  defaultValue={initial?.family?.displayNameRu ?? ""}
                  className={inputClassName}
                />
              </label>
              <label className="text-sm">
                Family display name (EN)
                <input
                  name="familyDisplayNameEn"
                  defaultValue={initial?.family?.displayNameEn ?? ""}
                  className={inputClassName}
                />
              </label>
            </div>
          </details>
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600">Identity</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-sm">
            Display name
            <input name="displayName" required defaultValue={initial?.displayName ?? ""} className={inputClassName} />
          </label>
          <label className="text-sm">
            Brand
            <input name="brandName" defaultValue={initial?.brandName ?? ""} className={inputClassName} />
          </label>
          <label className="text-sm">
            Manufacturer
            <input name="manufacturer" defaultValue={initial?.manufacturer ?? ""} className={inputClassName} />
          </label>
          <label className="text-sm">
            Country
            <input name="country" defaultValue={initial?.country ?? ""} className={inputClassName} />
          </label>
          <label className="text-sm">
            Completeness
            <select name="completenessLevel" defaultValue={initial?.completenessLevel ?? ""} className={inputClassName}>
              <option value="">Auto</option>
              {ingredientCompletenessLevels.map((value) => (
                <option key={value} value={value}>{formatEnumLabel(value)}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2 text-sm">
            Aliases (one per line)
            <textarea name="aliases" defaultValue={(initial?.aliases ?? []).join("\n")} className="mt-1 h-24 w-full rounded border p-2" />
          </label>
          <label className="col-span-2 text-sm">
            Description
            <textarea name="description" defaultValue={initial?.description ?? ""} className="mt-1 h-24 w-full rounded border p-2" />
          </label>
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600">Units</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Default display unit
            <select
              name="defaultDisplayUnit"
              value={selectedDefaultDisplayUnit}
              onChange={(event) => setSelectedDefaultDisplayUnit(event.target.value as IngredientDisplayUnit)}
              className={inputClassName}
            >
              {unitOptions.allowedUnits.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Measurement dimension
            <input value={unitOptions.measurementDimension} readOnly className={`${inputClassName} bg-neutral-50`} />
          </label>
          <p className="col-span-2 text-xs text-neutral-600">
            Allowed units: {unitOptions.allowedUnits.join(", ")}
          </p>
        </div>
      </section>

      <section key={`technical-${taxonomyRevision}-${selectedCategory}-${selectedSubtype}`} className={sectionClassName}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600">Technical fields</h2>
        <div className="grid grid-cols-2 gap-3">
          {selectedCategory === "fermentable" ? (
            <>
              <label className="text-sm">
                Color (EBC)
                <input
                  name="fermentableColorEbc"
                  required
                  type="number"
                  step="0.1"
                  min="0.1"
                  defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.fermentableColorEbc ?? "" : ""}
                  className={inputClassName}
                />
              </label>
              <label className="text-sm">
                Extract yield (%)
                <input
                  name="fermentableExtractYieldPct"
                  required
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.fermentableExtractYieldPct ?? "" : ""}
                  className={inputClassName}
                />
              </label>
            </>
          ) : null}

          {selectedCategory === "hop" ? (
            <>
              <label className="text-sm">
                Alpha acid (%)
                <input
                  name="hopAlphaAcidPct"
                  required
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.hopAlphaAcidPct ?? "" : ""}
                  className={inputClassName}
                />
              </label>
              <label className="text-sm">
                Harvest year
                <input
                  name="harvestYear"
                  type="number"
                  min="1900"
                  max="2200"
                  defaultValue={useInitialTaxonomyValues ? initial?.harvestYear ?? "" : ""}
                  className={inputClassName}
                />
              </label>
            </>
          ) : null}

          {selectedCategory === "yeast" ? (
            <>
              <label className="text-sm">
                Form
                <select
                  name="yeastForm"
                  required
                  value={selectedYeastForm}
                  onChange={(event) => handleYeastFormChange(event.target.value)}
                  className={inputClassName}
                >
                  <option value="">Select form</option>
                  {yeastForms.map((value) => (
                    <option key={value} value={value}>{yeastFormLabels[value]}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Attenuation (%)
                <input
                  name="yeastAttenuationPct"
                  required
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.yeastAttenuationPct ?? "" : ""}
                  className={inputClassName}
                />
              </label>
              <label className="text-sm">
                Temp min (°C)
                <input
                  name="yeastMinFermentationTempC"
                  type="number"
                  step="0.1"
                  defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.yeastMinFermentationTempC ?? "" : ""}
                  className={inputClassName}
                />
              </label>
              <label className="text-sm">
                Temp max (°C)
                <input
                  name="yeastMaxFermentationTempC"
                  type="number"
                  step="0.1"
                  defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.yeastMaxFermentationTempC ?? "" : ""}
                  className={inputClassName}
                />
              </label>
              <label className="text-sm">
                Package size
                <input
                  name="yeastPackageSize"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.yeastPackageSize ?? "" : ""}
                  className={inputClassName}
                />
              </label>
              <label className="text-sm">
                Package unit
                <select
                  name="yeastPackageUnit"
                  defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.yeastPackageUnit ?? "" : ""}
                  className={inputClassName}
                >
                  <option value="">Unknown</option>
                  {ingredientDisplayUnits.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          {selectedCategory === "water_prep" ? (
            <>
              {selectedSubtype === "salt" || selectedSubtype === "base" ? (
                <label className="text-sm">
                  Compound
                  <input
                    name="waterPrepCompound"
                    required
                    defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.waterPrepCompound ?? "" : ""}
                    className={inputClassName}
                  />
                </label>
              ) : null}
              {selectedSubtype === "acid" ? (
                <label className="text-sm">
                  Acid type
                  <input
                    name="waterPrepAcidType"
                    required
                    defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.waterPrepAcidType ?? "" : ""}
                    className={inputClassName}
                  />
                </label>
              ) : null}
              <label className="text-sm">
                Physical form
                <select
                  name="waterPrepPhysicalForm"
                  value={selectedWaterPrepPhysicalForm}
                  onChange={(event) => setSelectedWaterPrepPhysicalForm(event.target.value)}
                  className={inputClassName}
                >
                  <option value="">Unknown</option>
                  {waterPrepPhysicalForms.map((value) => (
                    <option key={value} value={value}>{waterPrepPhysicalFormLabels[value]}</option>
                  ))}
                </select>
              </label>
              {selectedSubtype === "acid" || selectedSubtype === "base" ? (
                <label className="text-sm">
                  Strength (%)
                  <input
                    name="waterPrepStrengthPct"
                    required={strengthRequired}
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="100"
                    defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.waterPrepStrengthPct ?? "" : ""}
                    className={inputClassName}
                  />
                </label>
              ) : null}
              <label className="text-sm">
                Purity (%)
                <input
                  name="waterPrepPurityPct"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.waterPrepPurityPct ?? "" : ""}
                  className={inputClassName}
                />
              </label>
            </>
          ) : null}

          {selectedCategory === "misc" ? (
            <>
              <label className="text-sm">
                Usage phase
                <select
                  name="miscUsagePhase"
                  defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.miscUsagePhase ?? "" : ""}
                  className={inputClassName}
                >
                  <option value="">Unknown</option>
                  {miscUsagePhases.map((value) => (
                    <option key={value} value={value}>{miscUsagePhaseLabels[value]}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Dose hint
                <input
                  name="miscDoseHint"
                  defaultValue={useInitialTaxonomyValues ? initialTechnicalFields.miscDoseHint ?? "" : ""}
                  className={inputClassName}
                />
              </label>
            </>
          ) : null}
        </div>

        {fieldVisibility.advanced.length > 0 ? (
          <details className="rounded border p-3">
            <summary className="cursor-pointer text-sm font-medium">Advanced fields</summary>
            <div className="mt-3">
              {renderAdvancedFields()}
            </div>
          </details>
        ) : null}
      </section>

      <section className={sectionClassName}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-600">Publishing</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Status
            <select name="status" defaultValue={initial?.status ?? "active"} className={inputClassName}>
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="archived">archived</option>
              <option value="merged">merged</option>
            </select>
          </label>
          <label className="text-sm">
            Visibility
            <select name="visibility" defaultValue={initial?.visibility ?? "public"} className={inputClassName}>
              <option value="public">public</option>
              <option value="internal">internal</option>
            </select>
          </label>
        </div>
      </section>

      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium">Legacy compatibility</summary>
        <label className="mt-3 block text-sm">
          Properties JSON
          <textarea
            value={propertiesJson}
            onChange={(event) => setPropertiesJson(event.target.value)}
            className="mt-1 h-40 w-full rounded border p-2 font-mono text-xs"
          />
        </label>
      </details>

      <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">Save</button>
    </form>
  );
};
