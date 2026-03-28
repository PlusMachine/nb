"use client";

import { useState } from "react";

import { IngredientPicker } from "@/components/ingredients/ingredient-picker";

type QueueItem = {
  id: string;
  sourceDisplayName: string;
  sourceType: string;
  sourcePayload: Record<string, unknown>;
  status: string;
};

export const ModerationQueue = ({ initialItems }: { initialItems: QueueItem[] }) => {
  const [items, setItems] = useState(initialItems);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [targets, setTargets] = useState<Record<string, string>>({});

  const act = async (id: string, action: "approve" | "reject" | "merge") => {
    const response = await fetch(`/api/admin/proposed-ingredients/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, resolutionNote: notes[id], targetIngredientId: targets[id] })
    });
    if (response.ok) {
      setItems((state) => state.filter((item) => item.id !== id));
    }
  };

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article key={item.id} className="rounded border p-3">
          <h2 className="font-semibold">{item.sourceDisplayName}</h2>
          <p className="text-xs text-zinc-500">{item.sourceType}</p>
          <pre className="mt-2 overflow-auto rounded bg-zinc-50 p-2 text-xs">{JSON.stringify(item.sourcePayload, null, 2)}</pre>
          <textarea placeholder="resolution note" className="mt-2 h-20 w-full rounded border p-2 text-sm" onChange={(e) => setNotes((s) => ({ ...s, [item.id]: e.target.value }))} />
          <div className="mt-2">
            <IngredientPicker
              includeCustom={false}
              onSelect={(selected) => setTargets((s) => ({ ...s, [item.id]: selected.id }))}
              placeholder="Find merge target"
              emptyCta={<p className="text-xs text-zinc-500">Не нашли? Предложить / создать свой ингредиент</p>}
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button className="rounded border px-2 py-1 text-sm" onClick={() => void act(item.id, "approve")}>Approve</button>
            <button className="rounded border px-2 py-1 text-sm" onClick={() => void act(item.id, "reject")}>Reject</button>
            <button className="rounded border px-2 py-1 text-sm" onClick={() => void act(item.id, "merge")}>Merge</button>
          </div>
        </article>
      ))}
    </div>
  );
};
