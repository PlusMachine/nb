import React from "react";

import { ShoppingLabView } from "@/components/shopping-lab/shopping-lab-view";
import { buildShoppingListForUser } from "@/features/shopping/service";
import { requireUser } from "@/lib/auth";

/**
 * Черновик IA раздела «Чего не хватает» (/app/shopping-lab, v2) — ЛАБОРАТОРИЯ,
 * не боевой роут: доступ только по прямому URL (в нав-меню не добавлен),
 * действия внутри пишут в РЕАЛЬНЫЕ данные склада пользователя (тот же
 * buildShoppingListForUser/сервер-экшены, что и боевая /app/shopping — здесь
 * лишь один список вместо двух под-табов v1: заголовок «Список покупок»,
 * добавление ручной позиции через модалку вместо инлайн-формы, «На склад» —
 * иконка вместо пилюли, см. shopping-lab-view.tsx). Боевые файлы
 * components/shopping/* и app/(app)/app/shopping/* не тронуты.
 */
export async function ShoppingLabContent() {
  const user = await requireUser();
  // includeOpportunities: true — тот же вызов, что у боевой /app/shopping;
  // §3.3 «Почти хватает на:» лаборатория просто не рендерит (см. shopping-lab-view.tsx),
  // но data-фетч держим идентичным боевому, чтобы черновик был на реальных данных.
  const list = await buildShoppingListForUser(user.id, { includeOpportunities: true });

  return (
    <main className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Список покупок — черновик IA
        </h1>
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Тестовая страница. Действия (отметки, перенос, добавление) меняют реальные данные вашего склада.
        </p>
      </div>
      <ShoppingLabView list={list} />
    </main>
  );
}
