"use client";

import React from "react";
import { useState } from "react";
import { Link2 } from "lucide-react";
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

  if (count > 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          title="Ссылки на покупку"
        >
          <span className="inline-flex items-center gap-1">
            {marketplaces.slice(0, 5).map((marketplace) => (
              <PurchaseLinkMarketplaceBadge
                key={`inventory-link-badge-${reference.source}-${reference.id}-${marketplace}`}
                marketplace={marketplace}
                size="sm"
              />
            ))}
          </span>
          {count > 4 ? (
            <span className="text-[11px] text-muted-foreground">+{count - 4}</span>
          ) : null}
          <span className="hidden text-[11px] font-medium text-muted-foreground group-hover:inline">
            ссылка на покупку
          </span>
        </button>

        <IngredientPurchaseLinksDialog
          open={open}
          onClose={() => setOpen(false)}
          reference={reference}
          autoStartCreateWhenEmpty
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-1 rounded-lg py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground group-hover:inline-flex"
        title="Добавить ссылку на покупку"
      >
        <Link2 className="h-3 w-3" />
        <span>добавить ссылку на покупку</span>
      </button>

      <IngredientPurchaseLinksDialog
        open={open}
        onClose={() => setOpen(false)}
        reference={reference}
        autoStartCreateWhenEmpty
      />
    </>
  );
}
