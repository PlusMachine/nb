"use client";

import { useState } from "react";

import { IngredientPicker } from "@/components/ingredients/ingredient-picker";

type PrefilledIngredient = {
  id: string;
  label: string;
};

type Props = {
  initialSource?: PrefilledIngredient | null;
  initialTarget?: PrefilledIngredient | null;
};

export const DuplicateMergeForm = ({ initialSource = null, initialTarget = null }: Props) => {
  const [source, setSource] = useState<string>(initialSource?.id ?? "");
  const [sourceLabel, setSourceLabel] = useState<string>(initialSource?.label ?? "");
  const [target, setTarget] = useState<string>(initialTarget?.id ?? "");
  const [targetLabel, setTargetLabel] = useState<string>(initialTarget?.label ?? "");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInvalidSelection = source.length === 0 || target.length === 0 || source === target;

  return (
    <section className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-zinc-950">Объединение дубликатов</h1>
        <p className="text-sm text-zinc-500">
          Исходный ингредиент будет переведён в статус <strong className="font-medium text-zinc-700">merged</strong>,
          а все ссылки на него должны указывать на выбранный target.
        </p>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-zinc-700">Source ingredient</p>
        <p className="mb-2 text-xs text-zinc-500">Эта карточка будет помечена как merged.</p>
        <IngredientPicker
          value={sourceLabel}
          onSelectionInvalidated={() => setSource("")}
          onSelect={(item) => {
            setSource(item.id);
            setSourceLabel(item.displayNameRu ?? item.displayName);
            setError(null);
          }}
          placeholder="Найдите исходный ингредиент"
        />
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-zinc-700">Target ingredient</p>
        <p className="mb-2 text-xs text-zinc-500">Останется в каталоге как основная карточка.</p>
        <IngredientPicker
          value={targetLabel}
          onSelectionInvalidated={() => setTarget("")}
          onSelect={(item) => {
            setTarget(item.id);
            setTargetLabel(item.displayNameRu ?? item.displayName);
            setError(null);
          }}
          placeholder="Найдите итоговый ингредиент"
        />
      </div>

      <textarea
        className="h-28 w-full rounded-xl border border-zinc-200 p-3 text-sm"
        placeholder="Комментарий для истории merge"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {source && target && source === target ? (
        <p className="text-sm text-rose-600">Source и target не могут быть одной и той же карточкой.</p>
      ) : null}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <button
        className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
        onClick={async () => {
          if (isInvalidSelection) {
            return;
          }

          try {
            setIsSubmitting(true);
            setError(null);
            const response = await fetch("/api/admin/ingredients/merge", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sourceIngredientId: source, targetIngredientId: target, note })
            });

            if (!response.ok) {
              const data = await response.json() as { error?: string };
              throw new Error(data.error ?? "Не удалось выполнить merge.");
            }

            window.location.href = "/admin/ingredients";
          } catch (nextError) {
            setError((nextError as Error).message);
          } finally {
            setIsSubmitting(false);
          }
        }}
        type="button"
        disabled={isInvalidSelection || isSubmitting}
      >
        {isSubmitting ? "Сливаем..." : "Объединить"}
      </button>
    </section>
  );
};
