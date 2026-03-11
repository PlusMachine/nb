"use client";

import { useState } from "react";

import { IngredientPicker } from "@/components/ingredients/ingredient-picker";

export const DuplicateMergeForm = () => {
  const [source, setSource] = useState<string>("");
  const [target, setTarget] = useState<string>("");
  const [note, setNote] = useState("");

  return (
    <section className="space-y-3 rounded border p-4">
      <h1 className="text-xl font-semibold">Merge duplicate ingredients</h1>
      <div>
        <p className="mb-1 text-sm">Source ingredient (will be archived as merged)</p>
        <IngredientPicker onSelect={(item) => setSource(item.id)} />
      </div>
      <div>
        <p className="mb-1 text-sm">Target ingredient</p>
        <IngredientPicker onSelect={(item) => setTarget(item.id)} />
      </div>
      <textarea className="h-24 w-full rounded border p-2" placeholder="Resolution note" value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        className="rounded bg-black px-3 py-2 text-sm text-white"
        onClick={async () => {
          await fetch("/api/admin/ingredients/merge", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sourceIngredientId: source, targetIngredientId: target, note })
          });
          window.location.href = "/admin/ingredients";
        }}
        type="button"
      >
        Merge
      </button>
    </section>
  );
};
