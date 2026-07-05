"use client";

// =============================================================================
//  components/inventory/inventory-item-movements.tsx
//  Журнал движений по позиции склада (UX-находка #19): пополнения, ручные
//  списания и расход на варки — когда, сколько (со знаком) и по какой варке.
//  Данные тянутся клиентом при открытии деталей позиции (getInventoryItemMovements
//  Action), чтобы не грузить историю для каждой строки списка.
// =============================================================================
import { useEffect, useState } from "react";
import Link from "next/link";

import { getInventoryItemMovementsAction } from "@/app/(app)/app/ingredients/actions";
import type { InventoryItemMovementDto } from "@/features/inventory/contracts";

const TYPE_LABELS: Record<InventoryItemMovementDto["type"], string> = {
  consume: "Списание",
  reserve: "Резерв",
  release: "Возврат",
  adjustment: "Поправка"
};

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

// Компактный формат величины движения (нормализованные единицы → человеку).
const fmtQty = (quantity: number, unit: string) => {
  const abs = Math.abs(quantity);
  if (unit === "g" && abs >= 1000) return `${Number((abs / 1000).toFixed(3))} кг`;
  if (unit === "ml" && abs >= 1000) return `${Number((abs / 1000).toFixed(3))} л`;
  const label =
    unit === "g" ? "г" : unit === "ml" ? "мл" : unit === "item" ? "шт" : unit === "pack" ? "уп" : unit;
  return `${Number(abs.toFixed(3))} ${label}`;
};

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; movements: InventoryItemMovementDto[] };

export function InventoryItemMovements({
  inventoryItemId,
  open
}: {
  inventoryItemId: string;
  open: boolean;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ status: "loading" });
    getInventoryItemMovementsAction(inventoryItemId)
      .then((res) => {
        if (cancelled) return;
        setState(res.ok ? { status: "ready", movements: res.movements } : { status: "error" });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, inventoryItemId]);

  return (
    <section className="mt-6 space-y-2 border-t border-zinc-100 pt-4">
      <h3 className="text-sm font-semibold text-zinc-900">Движения</h3>

      {state.status === "loading" ? <p className="text-sm text-zinc-500">Загрузка…</p> : null}
      {state.status === "error" ? (
        <p className="text-sm text-rose-600" role="alert">
          Не удалось загрузить журнал движений.
        </p>
      ) : null}
      {state.status === "ready" && state.movements.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Движений по этой позиции пока нет. Здесь появятся пополнения, списания и расход на варки.
        </p>
      ) : null}

      {state.status === "ready" && state.movements.length > 0 ? (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200">
          {state.movements.map((movement) => {
            const positive = movement.quantityDeltaNormalized > 0;
            const context = movement.brewBatchName ?? movement.recipeTitle;
            return (
              <li key={movement.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-800">
                    {TYPE_LABELS[movement.type]}
                    {context ? (
                      <span className="font-normal text-zinc-500">
                        {" · "}
                        {movement.brewBatchId ? (
                          <Link
                            href={`/app/brew-batches/${movement.brewBatchId}`}
                            className="text-emerald-700 transition-colors hover:text-emerald-900"
                          >
                            {context}
                          </Link>
                        ) : (
                          context
                        )}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-zinc-400">{dateFmt.format(new Date(movement.createdAt))}</p>
                </div>
                <span
                  className={`shrink-0 tabular-nums font-semibold ${positive ? "text-emerald-700" : "text-zinc-700"}`}
                >
                  {positive ? "+" : "−"}
                  {fmtQty(movement.quantityDeltaNormalized, movement.normalizedUnit)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
