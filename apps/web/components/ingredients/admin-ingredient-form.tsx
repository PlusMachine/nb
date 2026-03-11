"use client";

import { useState } from "react";

import { ingredientTypes } from "@/features/ingredients/contracts";

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
  properties: Record<string, unknown>;
  status: "draft" | "active" | "archived" | "merged";
  visibility: "public" | "internal";
};

export const AdminIngredientForm = ({ initial }: { initial?: Partial<IngredientFormValue> & { id?: string } }) => {
  const [error, setError] = useState<string | null>(null);
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
          manufacturer: formData.get("manufacturer") || null,
          country: formData.get("country") || null,
          description: formData.get("description") || null,
          defaultUnit: formData.get("defaultUnit"),
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
        <label className="text-sm">Type<select name="type" defaultValue={initial?.type ?? "fermentable"} className="mt-1 w-full rounded border p-2">{ingredientTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label className="text-sm">Subtype<input name="subtype" defaultValue={initial?.subtype ?? ""} className="mt-1 w-full rounded border p-2" /></label>
        <label className="col-span-2 text-sm">Display name<input name="displayName" required defaultValue={initial?.displayName ?? ""} className="mt-1 w-full rounded border p-2" /></label>
        <label className="text-sm">Manufacturer<input name="manufacturer" defaultValue={initial?.manufacturer ?? ""} className="mt-1 w-full rounded border p-2" /></label>
        <label className="text-sm">Country<input name="country" defaultValue={initial?.country ?? ""} className="mt-1 w-full rounded border p-2" /></label>
        <label className="text-sm">Default unit<input name="defaultUnit" required defaultValue={initial?.defaultUnit ?? "g"} className="mt-1 w-full rounded border p-2" /></label>
        <label className="text-sm">Status<select name="status" defaultValue={initial?.status ?? "active"} className="mt-1 w-full rounded border p-2"><option>draft</option><option>active</option><option>archived</option><option>merged</option></select></label>
        <label className="text-sm">Visibility<select name="visibility" defaultValue={initial?.visibility ?? "public"} className="mt-1 w-full rounded border p-2"><option>public</option><option>internal</option></select></label>
        <label className="col-span-2 text-sm">Aliases (one per line)<textarea name="aliases" defaultValue={(initial?.aliases ?? []).join("\n")} className="mt-1 h-28 w-full rounded border p-2" /></label>
        <label className="col-span-2 text-sm">Description<textarea name="description" defaultValue={initial?.description ?? ""} className="mt-1 h-24 w-full rounded border p-2" /></label>
        <label className="col-span-2 text-sm">Properties JSON<textarea value={propertiesJson} onChange={(event) => setPropertiesJson(event.target.value)} className="mt-1 h-40 w-full rounded border p-2 font-mono text-xs" /></label>
      </div>
      <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">Save</button>
    </form>
  );
};
