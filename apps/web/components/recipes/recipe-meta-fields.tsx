"use client";

import React from "react";

import {
  recipePublicationStateLabels,
  recipePublicationStates,
  type RecipePublicationState
} from "@/features/recipes/contracts";

type Props = {
  value: {
    title: string;
    description: string;
    authorNotes: string;
    publicationState: RecipePublicationState;
    efficiency: string;
  };
  onChange: (patch: Partial<Props["value"]>) => void;
  fieldErrors?: Record<string, string>;
};

export function RecipeMetaFields({ value, onChange, fieldErrors }: Props) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-base font-semibold">Основные параметры</h2>
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="title">Название</label>
        <input
          id="title"
          value={value.title}
          onChange={(event) => onChange({ title: event.target.value })}
          className="h-10 w-full rounded-md border border-border px-3 text-sm"
          placeholder="Например, Czech Pils"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Публикация</label>
        <select
          value={value.publicationState}
          onChange={(event) => onChange({ publicationState: event.target.value as RecipePublicationState })}
          className="h-10 w-full rounded-md border border-border px-3 text-sm"
        >
          {recipePublicationStates.map((publicationState) => (
            <option key={publicationState} value={publicationState}>
              {recipePublicationStateLabels[publicationState]}
            </option>
          ))}
        </select>
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
          className="h-10 w-full rounded-md border border-border px-3 text-sm"
          placeholder="75"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="description">Описание</label>
        <textarea
          id="description"
          value={value.description}
          onChange={(event) => onChange({ description: event.target.value })}
          className="min-h-24 w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="authorNotes">Заметки автора</label>
        <textarea
          id="authorNotes"
          value={value.authorNotes}
          onChange={(event) => onChange({ authorNotes: event.target.value })}
          className="min-h-24 w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>
      {fieldErrors?.title && <p className="text-sm text-destructive">{fieldErrors.title}</p>}
    </section>
  );
}
