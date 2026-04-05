"use client";

import React from "react";
import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { IngredientPurchaseLinksDialog, PurchaseLinkMarketplaceBadge } from "@/components/ingredients/ingredient-purchase-links-manager";
import type {
  IngredientPurchaseLinkSummaryDto,
  UserIngredientReference
} from "@/features/ingredients/contracts";

type Props = {
  reference: UserIngredientReference;
  summary?: IngredientPurchaseLinkSummaryDto;
};

export function InventoryPurchaseLinksTrigger({
  reference,
  summary
}: Props) {
  const [open, setOpen] = useState(false);
  const count = summary?.count ?? 0;
  const marketplaces = summary?.marketplaces ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={count > 0
          ? "inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
          : "inline-flex items-center gap-2 text-xs font-medium text-zinc-500 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-700"
        }
      >
        <ShoppingCart className="h-3.5 w-3.5" />
        <span>{count > 0 ? "Купить" : "Добавить ссылку"}</span>
        {count > 0 ? (
          <span className="inline-flex items-center gap-1">
            {marketplaces.slice(0, 3).map((marketplace) => (
              <PurchaseLinkMarketplaceBadge
                key={`inventory-link-badge-${reference.source}-${reference.id}-${marketplace}`}
                marketplace={marketplace}
                className="h-5 min-w-5 px-1 text-[9px]"
              />
            ))}
          </span>
        ) : null}
      </button>

      <IngredientPurchaseLinksDialog
        open={open}
        onClose={() => setOpen(false)}
        reference={reference}
      />
    </>
  );
}
