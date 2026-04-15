"use client";

import React, { useEffect, useState } from "react";
import { Timer, X } from "lucide-react";

export type StartBrewResult = {
  ok: boolean;
  message: string;
  brewBatchId?: string | null;
} | null;

export function StartBrewModal({
  open,
  pending,
  result,
  onStart,
  onClose
}: {
  open: boolean;
  pending: boolean;
  result: StartBrewResult;
  onStart: (options: { consumeIngredients: boolean }) => void | Promise<void>;
  onClose: () => void;
}) {
  const [consumeIngredients, setConsumeIngredients] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, pending]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Начать варку" onClick={() => !pending && onClose()}>
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <Timer className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-950">Начать варку</h3>
              <p className="mt-1 text-sm leading-6 text-zinc-600">Рецепт будет сохранен, затем будет создана партия для варки.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={pending} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {result?.ok ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950" role="status" aria-live="polite">
            <p className="font-semibold">Партия добавлена в план варки.</p>
            <p className="mt-1 text-xs leading-5 text-emerald-800">{result.message}</p>
          </div>
        ) : (
          <>
            {result ? (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900" role="alert">
                {result.message}
              </div>
            ) : null}

            <div className="space-y-2">
              <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 ${!consumeIngredients ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white"}`}>
                <input type="radio" checked={!consumeIngredients} onChange={() => setConsumeIngredients(false)} className="mt-1" />
                <span>
                  <span className="block text-sm font-semibold text-zinc-900">Пока не списывать</span>
                  <span className="text-xs leading-5 text-zinc-500">Партия будет создана, склад останется без изменений.</span>
                </span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 ${consumeIngredients ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white"}`}>
                <input type="radio" checked={consumeIngredients} onChange={() => setConsumeIngredients(true)} className="mt-1" />
                <span>
                  <span className="block text-sm font-semibold text-zinc-900">Списать ингредиенты со склада</span>
                  <span className="text-xs leading-5 text-zinc-500">Списание будет выполнено только после нажатия кнопки ниже.</span>
                </span>
              </label>
            </div>
          </>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 disabled:opacity-50">
            {result?.ok ? "Закрыть" : "Отмена"}
          </button>
          {result?.ok ? null : (
            <button type="button" onClick={() => void onStart({ consumeIngredients })} disabled={pending} className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {pending ? "Готовим..." : "Начать варку"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
