"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@nb/ui";

import type {
  IngredientAliasDto,
  IngredientCatalogItemDto,
  IngredientPackageVariantDto,
  IngredientSourceDto
} from "@/features/ingredients/contracts";
import { ingredientDisplayModes } from "@/features/ingredients/contracts";
import {
  buildIngredientTypedSummary,
  resolveIngredientDisplayNames
} from "@/features/ingredients/presentation";
import {
  ingredientCategories,
  ingredientCategorySubtypes,
  resolveIngredientCategory,
  resolveIngredientSubtype,
  resolveLegacyIngredientType,
  type IngredientCategory,
  type IngredientSubtype
} from "@/features/ingredients/taxonomy";

type IngredientFormValue = Partial<IngredientCatalogItemDto> & { id?: string };

type AdminIngredientFieldVisibility = {
  primary: string[];
  advanced: string[];
};

const inputClassName = "mt-1 w-full rounded border border-border px-3 py-2";
const sectionClassName = "space-y-4 rounded-xl border border-border p-4";
const textareaClassName = `${inputClassName} min-h-[120px] font-mono text-xs`;

const formatEnumLabel = (value: string) => value
  .split("_")
  .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
  .join(" ");

const parseJson = <T,>(value: string, fallback: T, label: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`${label}: invalid JSON`);
  }
};

const stringifyJson = (value: unknown) => JSON.stringify(value, null, 2);

const readOptionalText = (formData: FormData, key: string) => {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
};

const readOptionalBoolean = (formData: FormData, key: string) => {
  const raw = formData.get(key);
  if (raw == null) {
    return false;
  }

  return raw === "on" || raw === "true";
};

export const getAdminIngredientSubtypeOptions = (
  category: IngredientCategory
): readonly IngredientSubtype[] => ingredientCategorySubtypes[category];

export const getNextAdminIngredientTaxonomyState = (
  current: { category: IngredientCategory; subtype: IngredientSubtype | null },
  next: { category?: IngredientCategory; subtype?: string | null }
) => {
  if (next.category) {
    const category = next.category;
    const subtype = current.subtype && (ingredientCategorySubtypes[category] as readonly string[]).includes(current.subtype)
      ? current.subtype
      : ingredientCategorySubtypes[category][0] ?? null;

    return { category, subtype };
  }

  if (next.subtype) {
    const subtype = resolveIngredientSubtype({
      category: current.category,
      subtype: next.subtype
    });

    if (subtype && (ingredientCategorySubtypes[current.category] as readonly string[]).includes(subtype)) {
      return {
        category: current.category,
        subtype
      };
    }
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
  if (category === "hop") {
    return {
      primary: ["names", "display", "aliases", "attributes"],
      advanced: ["sources"]
    };
  }

  if (category === "fermentable") {
    return {
      primary: ["names", "display", "aliases", "attributes"],
      advanced: ["sources", "quantity_defaults"]
    };
  }

  if (category === "yeast") {
    return {
      primary: ["names", "display", "aliases", "attributes"],
      advanced: ["sources"]
    };
  }

  if (category === "water_treatment") {
    return {
      primary: ["names", "display", "aliases", "attributes"],
      advanced: ["sources", "quantity_defaults", subtype === "acid" ? "unit_preview" : "unit_preview"]
    };
  }

  return {
    primary: ["names", "display", "aliases", "attributes"],
    advanced: ["sources", "quantity_defaults", "package_variants"]
  };
};

const buildInitialAliasJson = (initial?: IngredientFormValue) => stringifyJson(initial?.aliases ?? []);
const buildInitialSourcesJson = (initial?: IngredientFormValue) => stringifyJson(initial?.sources ?? []);
const buildInitialPackageVariantsJson = (initial?: IngredientFormValue) => stringifyJson(initial?.packageVariants ?? []);
const buildInitialAttributesJson = (initial?: IngredientFormValue) => stringifyJson(initial?.attributes ?? {});
const buildInitialQuantityDefaultsJson = (initial?: IngredientFormValue) => stringifyJson(initial?.quantityDefaults ?? null);

export const AdminIngredientForm = ({ initial }: { initial?: IngredientFormValue }) => {
  const initialCategory = resolveIngredientCategory({
    category: initial?.category,
    type: initial?.type,
    subtype: initial?.subtype ?? initial?.itemKind
  });
  const initialSubtype = resolveIngredientSubtype({
    category: initialCategory,
    type: initial?.type,
    subtype: initial?.subtype ?? initial?.itemKind
  }) ?? ingredientCategorySubtypes[initialCategory][0] ?? null;

  const [selectedCategory, setSelectedCategory] = useState<IngredientCategory>(initialCategory);
  const [selectedSubtype, setSelectedSubtype] = useState<IngredientSubtype | null>(initialSubtype);
  const [attributesJson, setAttributesJson] = useState(buildInitialAttributesJson(initial));
  const [aliasesJson, setAliasesJson] = useState(buildInitialAliasJson(initial));
  const [sourcesJson, setSourcesJson] = useState(buildInitialSourcesJson(initial));
  const [packageVariantsJson, setPackageVariantsJson] = useState(buildInitialPackageVariantsJson(initial));
  const [quantityDefaultsJson, setQuantityDefaultsJson] = useState(buildInitialQuantityDefaultsJson(initial));
  const [error, setError] = useState<string | null>(null);

  const subtypeOptions = getAdminIngredientSubtypeOptions(selectedCategory);
  const fieldVisibility = getAdminIngredientFieldVisibility(selectedCategory, selectedSubtype);
  const resolvedType = resolveLegacyIngredientType({
    category: selectedCategory,
    subtype: selectedSubtype
  });

  const preview = useMemo(() => {
    let attributes: Record<string, unknown> = {};

    try {
      attributes = parseJson<Record<string, unknown>>(attributesJson, {}, "attributes");
    } catch {
      attributes = {};
    }

    const primaryAndSecondary = resolveIngredientDisplayNames({
      type: resolvedType,
      countryCode: initial?.countryCode ?? null,
      countryName: initial?.countryName ?? null,
      nameRu: initial?.nameRu ?? null,
      nameEn: initial?.nameEn ?? null,
      displayModeRu: initial?.displayModeRu ?? "auto",
      displayNameOverrideRu: initial?.displayNameOverrideRu ?? null,
      secondaryNameOverrideRu: initial?.secondaryNameOverrideRu ?? null,
      hideSecondaryNameRu: initial?.hideSecondaryNameRu ?? false
    });

    return {
      ...primaryAndSecondary,
      summary: buildIngredientTypedSummary({
        type: resolvedType,
        category: selectedCategory,
        subtype: selectedSubtype,
        technicalData: {
          type: resolvedType,
          ...attributes
        }
      }) ?? null
    };
  }, [
    attributesJson,
    initial?.countryCode,
    initial?.displayModeRu,
    initial?.displayNameOverrideRu,
    initial?.hideSecondaryNameRu,
    initial?.nameEn,
    initial?.nameRu,
    initial?.secondaryNameOverrideRu,
    resolvedType,
    selectedCategory,
    selectedSubtype
  ]);

  return (
    <form
      className="space-y-5 rounded-2xl border border-border bg-card p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);

        const formData = new FormData(event.currentTarget);

        try {
          const attributes = parseJson<Record<string, unknown>>(attributesJson, {}, "attributes");
          const aliases = parseJson<Array<{
            id?: string;
            locale: IngredientAliasDto["locale"];
            alias: string;
            source?: string;
            isEnabled?: boolean;
          }>>(aliasesJson, [], "aliases");
          const sources = parseJson<Array<{
            id?: string;
            kind?: string | null;
            label?: string | null;
            url?: string | null;
            sourceBasis?: string | null;
            position?: number;
          }>>(sourcesJson, [], "sources");
          const packageVariants = parseJson<Array<{
            id: string;
            brand?: string | null;
            productNameRu?: string | null;
            countryNameRu?: string | null;
            packageAmount?: number | null;
            packageUnit?: string | null;
            stockContentAmount?: number | null;
            stockContentUnit?: string | null;
            sourceGroup?: string | null;
            sourceUrl?: string | null;
            isDefaultForStock?: boolean;
            position?: number;
          }>>(packageVariantsJson, [], "package variants");
          const quantityDefaults = parseJson<Record<string, unknown> | null>(
            quantityDefaultsJson,
            null,
            "quantity defaults"
          );

          const payload = {
            id: initial?.id,
            type: resolvedType,
            category: selectedCategory,
            itemKind: selectedSubtype,
            nameRu: readOptionalText(formData, "nameRu"),
            nameEn: readOptionalText(formData, "nameEn"),
            descriptionRu: readOptionalText(formData, "descriptionRu"),
            displayModeRu: String(formData.get("displayModeRu") ?? "auto"),
            displayNameOverrideRu: readOptionalText(formData, "displayNameOverrideRu"),
            secondaryNameOverrideRu: readOptionalText(formData, "secondaryNameOverrideRu"),
            hideSecondaryNameRu: readOptionalBoolean(formData, "hideSecondaryNameRu"),
            isActive: readOptionalBoolean(formData, "isActive"),
            inventoryEnabled: readOptionalBoolean(formData, "inventoryEnabled"),
            countryCode: readOptionalText(formData, "countryCode"),
            countryName: readOptionalText(formData, "countryName"),
            brand: readOptionalText(formData, "brand"),
            producer: readOptionalText(formData, "producer"),
            productCode: readOptionalText(formData, "productCode"),
            groupName: readOptionalText(formData, "groupName"),
            sourceCategory: readOptionalText(formData, "sourceCategory"),
            subcategory: readOptionalText(formData, "subcategory"),
            presentOnBirrf: formData.get("presentOnBirrf") === ""
              ? null
              : formData.get("presentOnBirrf") === "true",
            attributes,
            quantityDefaults,
            aliases: aliases.map((alias) => ({
              id: alias.id,
              locale: alias.locale,
              alias: alias.alias,
              source: alias.source ?? "admin",
              isEnabled: alias.isEnabled ?? true
            })),
            sources: sources.map((source, index) => ({
              id: source.id,
              kind: source.kind ?? null,
              label: source.label ?? null,
              url: source.url ?? null,
              sourceBasis: source.sourceBasis ?? null,
              position: source.position ?? index
            })),
            packageVariants: selectedCategory === "consumable"
              ? packageVariants.map((variant, index) => ({
                id: variant.id,
                brand: variant.brand ?? null,
                productNameRu: variant.productNameRu ?? null,
                countryNameRu: variant.countryNameRu ?? null,
                packageAmount: variant.packageAmount ?? null,
                packageUnit: variant.packageUnit ?? null,
                stockContentAmount: variant.stockContentAmount ?? null,
                stockContentUnit: variant.stockContentUnit ?? null,
                sourceGroup: variant.sourceGroup ?? null,
                sourceUrl: variant.sourceUrl ?? null,
                isDefaultForStock: variant.isDefaultForStock ?? false,
                position: variant.position ?? index
              }))
              : []
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

          window.location.href = `/admin/ingredients/${initial?.id ?? ""}`.replace(/\/$/, "") || "/admin/ingredients";
        } catch (submissionError) {
          setError(submissionError instanceof Error ? submissionError.message : "Request failed");
        }
      }}
    >
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          {initial?.id ? "Edit ingredient" : "Create ingredient"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Форма работает с новой моделью `ingredients`, а aliases/sources/package variants редактируются как source-of-truth.
        </p>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </header>

      <section className={sectionClassName}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Taxonomy</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            Category
            <select
              value={selectedCategory}
              onChange={(event) => {
                const nextCategory = event.target.value as IngredientCategory;
                const nextState = getNextAdminIngredientTaxonomyState({
                  category: selectedCategory,
                  subtype: selectedSubtype
                }, {
                  category: nextCategory
                });
                setSelectedCategory(nextState.category);
                setSelectedSubtype(nextState.subtype);
              }}
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
              value={selectedSubtype ?? ""}
              onChange={(event) => setSelectedSubtype(resolveIngredientSubtype({
                category: selectedCategory,
                subtype: event.target.value
              }))}
              className={inputClassName}
            >
              {subtypeOptions.map((subtype) => (
                <option key={subtype} value={subtype}>{formatEnumLabel(subtype)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Type
            <input value={resolvedType} readOnly className={`${inputClassName} bg-muted`} />
          </label>
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Names & Display</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            Name RU
            <input name="nameRu" defaultValue={initial?.nameRu ?? ""} className={inputClassName} />
          </label>
          <label className="text-sm">
            Name EN
            <input name="nameEn" defaultValue={initial?.nameEn ?? ""} className={inputClassName} />
          </label>
          <label className="text-sm">
            Display mode RU
            <select name="displayModeRu" defaultValue={initial?.displayModeRu ?? "auto"} className={inputClassName}>
              {ingredientDisplayModes.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Primary override
            <input name="displayNameOverrideRu" defaultValue={initial?.displayNameOverrideRu ?? ""} className={inputClassName} />
          </label>
          <label className="text-sm">
            Secondary override
            <input name="secondaryNameOverrideRu" defaultValue={initial?.secondaryNameOverrideRu ?? ""} className={inputClassName} />
          </label>
          <label className="flex items-center gap-2 pt-7 text-sm">
            <input name="hideSecondaryNameRu" type="checkbox" defaultChecked={initial?.hideSecondaryNameRu ?? false} />
            Hide secondary name
          </label>
        </div>
        <label className="block text-sm">
          Описание
          <textarea
            name="descriptionRu"
            defaultValue={initial?.descriptionRu ?? ""}
            rows={8}
            className={`${inputClassName} font-sans text-sm`}
          />
        </label>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Meta</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            Brand
            <input name="brand" defaultValue={initial?.brand ?? ""} className={inputClassName} />
          </label>
          <label className="text-sm">
            Producer
            <input name="producer" defaultValue={initial?.producer ?? ""} className={inputClassName} />
          </label>
          <label className="text-sm">
            Product code
            <input name="productCode" defaultValue={initial?.productCode ?? ""} className={inputClassName} />
          </label>
          <label className="text-sm">
            Country code
            <input name="countryCode" defaultValue={initial?.countryCode ?? ""} className={inputClassName} />
          </label>
          <label className="text-sm">
            Country name
            <input name="countryName" defaultValue={initial?.countryName ?? ""} className={inputClassName} />
          </label>
          <label className="text-sm">
            Group
            <input name="groupName" defaultValue={initial?.groupName ?? ""} className={inputClassName} />
          </label>
          <label className="text-sm">
            Source category
            <input name="sourceCategory" defaultValue={initial?.sourceCategory ?? ""} className={inputClassName} />
          </label>
          <label className="text-sm">
            Subcategory
            <input name="subcategory" defaultValue={initial?.subcategory ?? ""} className={inputClassName} />
          </label>
          <label className="text-sm">
            Present on BIRRF
            <select name="presentOnBirrf" defaultValue={initial?.presentOnBirrf == null ? "" : String(initial.presentOnBirrf)} className={inputClassName}>
              <option value="">Unknown</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pt-7 text-sm">
            <input name="isActive" type="checkbox" defaultChecked={initial?.isActive ?? true} />
            Active
          </label>
          <label className="flex items-center gap-2 pt-7 text-sm">
            <input name="inventoryEnabled" type="checkbox" defaultChecked={initial?.inventoryEnabled ?? true} />
            Inventory enabled
          </label>
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">JSON Editors</h2>
        <div className="grid gap-4">
          <label className="text-sm">
            Attributes
            <textarea
              value={attributesJson}
              onChange={(event) => setAttributesJson(event.target.value)}
              className={textareaClassName}
            />
          </label>
          <label className="text-sm">
            Aliases
            <textarea
              value={aliasesJson}
              onChange={(event) => setAliasesJson(event.target.value)}
              className={textareaClassName}
            />
          </label>
          <label className="text-sm">
            Sources
            <textarea
              value={sourcesJson}
              onChange={(event) => setSourcesJson(event.target.value)}
              className={textareaClassName}
            />
          </label>
          {selectedCategory === "consumable" ? (
            <label className="text-sm">
              Package variants
              <textarea
                value={packageVariantsJson}
                onChange={(event) => setPackageVariantsJson(event.target.value)}
                className={textareaClassName}
              />
            </label>
          ) : null}
          {(selectedCategory === "consumable" || selectedCategory === "water_treatment") ? (
            <label className="text-sm">
              Quantity defaults
              <textarea
                value={quantityDefaultsJson}
                onChange={(event) => setQuantityDefaultsJson(event.target.value)}
                className={textareaClassName}
              />
            </label>
          ) : null}
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Preview</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Catalog / Search</p>
            <p className="mt-2 font-medium text-foreground">{preview.primaryName || "No primary label"}</p>
            {preview.secondaryName ? <p className="text-sm text-muted-foreground">{preview.secondaryName}</p> : null}
            {preview.summary ? <p className="mt-2 text-sm text-muted-foreground">{preview.summary}</p> : null}
          </div>
          <div className="rounded-lg border border-border bg-muted p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Recipe / Inventory</p>
            <p className="mt-2 font-medium text-foreground">{preview.primaryName || "No primary label"}</p>
            <p className="text-sm text-muted-foreground">{resolvedType} / {selectedCategory} / {selectedSubtype ?? "none"}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Primary fields: {fieldVisibility.primary.join(", ")}
            </p>
            {fieldVisibility.advanced.length ? (
              <p className="text-sm text-muted-foreground">Advanced fields: {fieldVisibility.advanced.join(", ")}</p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        <Button type="submit" size="md">
          {initial?.id ? "Save ingredient" : "Create ingredient"}
        </Button>
        <Link href="/admin/ingredients" className="rounded-lg border border-border px-4 py-2 text-sm text-foreground">
          Cancel
        </Link>
      </div>
    </form>
  );
};
