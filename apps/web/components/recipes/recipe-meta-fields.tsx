"use client";

import React from "react";

import { recipeStatuses, recipeVisibilities, type RecipeStatus, type RecipeVisibility } from "@/features/recipes/contracts";

type Props = {
  value: {
    title: string;
    description: string;
    authorNotes: string;
    status: RecipeStatus;
    visibility: RecipeVisibility;
    efficiency: string;
  };
  onChange: (patch: Partial<Props["value"]>) => void;
  fieldErrors?: Record<string, string>;
};

export function RecipeMetaFields({ value, onChange, fieldErrors }: Props) {
  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-base font-semibold">Основные параметры</h2>
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="title">Название</label>
        <input
          id="title"
          value={value.title}
          onChange={(event) => onChange({ title: event.target.value })}
          className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm"
          placeholder="Например, Czech Pils"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">Статус</label>
          <select
            value={value.status}
            onChange={(event) => onChange({ status: event.target.value as RecipeStatus })}
            className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm"
          >
            {recipeStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Видимость</label>
          <select
            value={value.visibility}
            onChange={(event) => onChange({ visibility: event.target.value as RecipeVisibility })}
            className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm"
          >
            {recipeVisibilities.map((visibility) => <option key={visibility} value={visibility}>{visibility}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="efficiency">Эффективность (%)</label>
        <input
          id="efficiency"
          type="number"
          min={1}
          max={100}
          value={value.efficiency}
          onChange={(event) => onChange({ efficiency: event.target.value })}
          className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm"
          placeholder="75"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="description">Описание</label>
        <textarea
          id="description"
          value={value.description}
          onChange={(event) => onChange({ description: event.target.value })}
          className="min-h-24 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="authorNotes">Заметки автора</label>
        <textarea
          id="authorNotes"
          value={value.authorNotes}
          onChange={(event) => onChange({ authorNotes: event.target.value })}
          className="min-h-24 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
        />
      </div>
      {fieldErrors?.title && <p className="text-sm text-red-600">{fieldErrors.title}</p>}
    </section>
  );
}
