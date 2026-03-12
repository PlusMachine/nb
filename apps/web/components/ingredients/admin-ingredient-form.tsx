"use client";

import { useState } from "react";

import { hopForms, ingredientTypes, yeastForms, yeastTypes } from "@/features/ingredients/contracts";
import { extractIngredientTechnicalFields } from "@/features/ingredients/technical-fields";

type IngredientFormValue = {
  id?: string;
  type: typeof ingredientTypes[number];
  subtype?: string | null;
  displayName: string;
  aliases: string[];
  manufacturer?: string | null;
  country?: string | null;
  description?: string | null;
  defaultUnit: string;
  fermentableColorEbc?: number | null;
  fermentableExtractYieldPct?: number | null;
  hopAlphaAcidPct?: number | null;
  hopForm?: typeof hopForms[number] | null;
  hopSeason?: string | null;
  yeastAttenuationPct?: number | null;
  yeastType?: typeof yeastTypes[number] | null;
  yeastForm?: typeof yeastForms[number] | null;
  yeastMinFermentationTempC?: number | null;
  yeastMaxFermentationTempC?: number | null;
  properties: Record<string, unknown>;
  status: "draft" | "active" | "archived" | "merged";
  visibility: "public" | "internal";
};

const inputClassName = "mt-1 w-full rounded border p-2";

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

export const AdminIngredientForm = ({ initial }: { initial?: Partial<IngredientFormValue> & { id?: string } }) => {
  const initialType = initial?.type ?? "fermentable";
  const initialTechnicalFields = extractIngredientTechnicalFields({
    type: initialType,
    manufacturer: initial?.manufacturer ?? null,
    country: initial?.country ?? null,
    fermentableColorEbc: initial?.fermentableColorEbc ?? null,
    fermentableExtractYieldPct: initial?.fermentableExtractYieldPct ?? null,
    hopAlphaAcidPct: initial?.hopAlphaAcidPct ?? null,
    hopForm: initial?.hopForm ?? null,
    hopSeason: initial?.hopSeason ?? null,
    yeastAttenuationPct: initial?.yeastAttenuationPct ?? null,
    yeastType: initial?.yeastType ?? null,
    yeastForm: initial?.yeastForm ?? null,
    yeastMinFermentationTempC: initial?.yeastMinFermentationTempC ?? null,
    yeastMaxFermentationTempC: initial?.yeastMaxFermentationTempC ?? null,
    properties: initial?.properties ?? {}
  });
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<typeof ingredientTypes[number]>(initialType);
  const [propertiesJson, setPropertiesJson] = useState(JSON.stringify(initial?.properties ?? {}, null, 2));

  return (
    <form
      className="space-y-3 rounded-lg border p-4"
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

        const payload = {
          type: formData.get("type"),
          subtype: formData.get("subtype") || null,
          displayName: formData.get("displayName"),
          aliases: String(formData.get("aliases") ?? "").split("\n").map((i) => i.trim()).filter(Boolean),
          manufacturer: readOptionalText(formData, "manufacturer"),
          country: readOptionalText(formData, "country"),
          description: readOptionalText(formData, "description"),
          defaultUnit: formData.get("defaultUnit"),
          fermentableColorEbc: readOptionalNumber(formData, "fermentableColorEbc"),
          fermentableExtractYieldPct: readOptionalNumber(formData, "fermentableExtractYieldPct"),
          hopAlphaAcidPct: readOptionalNumber(formData, "hopAlphaAcidPct"),
          hopForm: readOptionalText(formData, "hopForm"),
          hopSeason: readOptionalText(formData, "hopSeason"),
          yeastAttenuationPct: readOptionalNumber(formData, "yeastAttenuationPct"),
          yeastType: readOptionalText(formData, "yeastType"),
          yeastForm: readOptionalText(formData, "yeastForm"),
          yeastMinFermentationTempC: readOptionalNumber(formData, "yeastMinFermentationTempC"),
          yeastMaxFermentationTempC: readOptionalNumber(formData, "yeastMaxFermentationTempC"),
          properties,
          status: formData.get("status"),
          visibility: formData.get("visibility")
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
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Type<select name="type" defaultValue={initialType} onChange={(event) => setSelectedType(event.target.value as typeof ingredientTypes[number])} className={inputClassName}>{ingredientTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label className="text-sm">Subtype<input name="subtype" defaultValue={initial?.subtype ?? ""} className={inputClassName} /></label>
        <label className="col-span-2 text-sm">Display name<input name="displayName" required defaultValue={initial?.displayName ?? ""} className={inputClassName} /></label>
        <label className="text-sm">Manufacturer<input name="manufacturer" defaultValue={initial?.manufacturer ?? ""} className={inputClassName} required={selectedType === "fermentable"} /></label>
        <label className="text-sm">Country<input name="country" defaultValue={initial?.country ?? ""} className={inputClassName} required={selectedType === "hop"} /></label>
        <label className="text-sm">Default unit<input name="defaultUnit" required defaultValue={initial?.defaultUnit ?? "g"} className={inputClassName} /></label>
        <label className="text-sm">Status<select name="status" defaultValue={initial?.status ?? "active"} className={inputClassName}><option>draft</option><option>active</option><option>archived</option><option>merged</option></select></label>
        <label className="text-sm">Visibility<select name="visibility" defaultValue={initial?.visibility ?? "public"} className={inputClassName}><option>public</option><option>internal</option></select></label>
        {selectedType === "fermentable" ? (
          <>
            <label className="text-sm">Color (EBC)<input name="fermentableColorEbc" required type="number" step="0.1" min="0" defaultValue={initialTechnicalFields.fermentableColorEbc ?? ""} className={inputClassName} /></label>
            <label className="text-sm">Extract yield (%)<input name="fermentableExtractYieldPct" required type="number" step="0.1" min="0" max="100" defaultValue={initialTechnicalFields.fermentableExtractYieldPct ?? ""} className={inputClassName} /></label>
          </>
        ) : null}
        {selectedType === "hop" ? (
          <>
            <label className="text-sm">Alpha acid (%)<input name="hopAlphaAcidPct" required type="number" step="0.1" min="0" max="100" defaultValue={initialTechnicalFields.hopAlphaAcidPct ?? ""} className={inputClassName} /></label>
            <label className="text-sm">Hop form<select name="hopForm" required defaultValue={initialTechnicalFields.hopForm ?? ""} className={inputClassName}><option value="">Select form</option>{hopForms.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-sm">Season<input name="hopSeason" defaultValue={initialTechnicalFields.hopSeason ?? ""} className={inputClassName} placeholder="2024" /></label>
          </>
        ) : null}
        {selectedType === "yeast" ? (
          <>
            <label className="text-sm">Attenuation (%)<input name="yeastAttenuationPct" required type="number" step="0.1" min="0" max="100" defaultValue={initialTechnicalFields.yeastAttenuationPct ?? ""} className={inputClassName} /></label>
            <label className="text-sm">Yeast type<select name="yeastType" required defaultValue={initialTechnicalFields.yeastType ?? ""} className={inputClassName}><option value="">Select type</option>{yeastTypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-sm">Yeast form<select name="yeastForm" required defaultValue={initialTechnicalFields.yeastForm ?? ""} className={inputClassName}><option value="">Select form</option>{yeastForms.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-sm">Min ferm. temp (°C)<input name="yeastMinFermentationTempC" required type="number" step="0.1" defaultValue={initialTechnicalFields.yeastMinFermentationTempC ?? ""} className={inputClassName} /></label>
            <label className="text-sm">Max ferm. temp (°C)<input name="yeastMaxFermentationTempC" required type="number" step="0.1" defaultValue={initialTechnicalFields.yeastMaxFermentationTempC ?? ""} className={inputClassName} /></label>
          </>
        ) : null}
        <label className="col-span-2 text-sm">Aliases (one per line)<textarea name="aliases" defaultValue={(initial?.aliases ?? []).join("\n")} className="mt-1 h-28 w-full rounded border p-2" /></label>
        <label className="col-span-2 text-sm">Description<textarea name="description" defaultValue={initial?.description ?? ""} className="mt-1 h-24 w-full rounded border p-2" /></label>
        <label className="col-span-2 text-sm">Properties JSON<textarea value={propertiesJson} onChange={(event) => setPropertiesJson(event.target.value)} className="mt-1 h-40 w-full rounded border p-2 font-mono text-xs" /></label>
      </div>
      <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">Save</button>
    </form>
  );
};
