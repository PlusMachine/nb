"use client";

import React from "react";

export default function IngredientsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <section className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
        <h1 className="text-lg font-semibold">Не удалось загрузить \"Мои ингредиенты\"</h1>
        <p className="text-sm">Попробуйте обновить страницу. Если ошибка повторяется, вернитесь позже.</p>
        <div>
          <button type="button" onClick={reset} className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm">
            Повторить
          </button>
        </div>
      </section>
    </main>
  );
}
