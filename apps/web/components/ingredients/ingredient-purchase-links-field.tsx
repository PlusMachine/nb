"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { listIngredientPurchaseLinksAction } from "@/app/(app)/app/ingredients/metadata-actions";
import type { UserIngredientReference } from "@/features/ingredients/contracts";
import {
  buildIngredientPurchaseLinkView,
  normalizeIngredientPurchaseLinkInput
} from "@/features/ingredients/purchase-links";
import { PurchaseLinkMarketplaceBadge } from "./ingredient-purchase-links-manager";

const ensureTrailingBlankRow = (rows: string[]) => {
  const normalizedRows = rows.length > 0 ? rows : [""];
  const filledRows = normalizedRows.filter((row) => row.trim().length > 0);
  return [...filledRows, ""];
};

export const createIngredientPurchaseLinkRows = (urls: string[] = []) => ensureTrailingBlankRow(urls);

const isRecognizedPurchaseLink = (value: string) => {
  try {
    return Boolean(normalizeIngredientPurchaseLinkInput(value));
  } catch {
    return false;
  }
};

export const updateIngredientPurchaseLinkRows = (
  rows: string[],
  index: number,
  value: string
) => {
  const nextRows = rows.map((row, rowIndex) => rowIndex === index ? value : row);
  const isLastRow = index === nextRows.length - 1;

  if (isLastRow && isRecognizedPurchaseLink(value)) {
    return [...ensureTrailingBlankRow(nextRows)];
  }

  return ensureTrailingBlankRow(nextRows);
};

export const removeIngredientPurchaseLinkRow = (
  rows: string[],
  index: number
) => ensureTrailingBlankRow(rows.filter((_row, rowIndex) => rowIndex !== index));

export const extractIngredientPurchaseLinkUrls = (rows: string[]) => rows
  .map((row) => row.trim())
  .filter(Boolean);

type PurchaseLinksFieldState = {
  urls: string[];
  isLoaded: boolean;
};

type Props = {
  reference: UserIngredientReference | null;
  enabled: boolean;
  allowDraftWithoutReference?: boolean;
  onStateChange?: (state: PurchaseLinksFieldState) => void;
  testId?: string;
};

export function IngredientPurchaseLinksField({
  reference,
  enabled,
  allowDraftWithoutReference = false,
  onStateChange,
  testId
}: Props) {
  const referenceKey = reference ? `${reference.source}:${reference.id}` : "none";
  const [rows, setRows] = useState<string[]>(() => createIngredientPurchaseLinkRows());
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!reference && !allowDraftWithoutReference) {
      setRows(createIngredientPurchaseLinkRows());
      setIsLoaded(false);
      setMessage(null);
      return;
    }

    if (!reference && allowDraftWithoutReference) {
      setIsLoaded(true);
      setMessage(null);
      return;
    }

    const currentReference = reference;
    if (!currentReference) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setMessage(null);

    void listIngredientPurchaseLinksAction(currentReference)
      .then((links) => {
        if (cancelled) {
          return;
        }

        setRows(createIngredientPurchaseLinkRows(links.map((link) => link.url)));
        setIsLoaded(true);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setRows(createIngredientPurchaseLinkRows());
        setIsLoaded(true);
        setMessage("Не удалось загрузить сохранённые ссылки.");
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [allowDraftWithoutReference, enabled, reference, referenceKey]);

  const urls = useMemo(() => extractIngredientPurchaseLinkUrls(rows), [rows]);

  useEffect(() => {
    onStateChange?.({
      urls,
      isLoaded
    });
  }, [isLoaded, onStateChange, urls]);

  if (!enabled || (!reference && !allowDraftWithoutReference)) {
    return null;
  }

  return (
    <section className="space-y-3" data-testid={testId}>
      <div className="space-y-1">
        <h4 className="text-sm font-medium text-zinc-900">Ссылки на покупку</h4>
        <p className="text-xs text-zinc-500">Площадки определяются автоматически по URL.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-zinc-500">Загружаем ссылки...</p>
      ) : null}

      <div className="space-y-3">
        {rows.map((row, index) => {
          const preview = (() => {
            try {
              const normalizedUrl = normalizeIngredientPurchaseLinkInput(row);
              if (!normalizedUrl) {
                return null;
              }

              return buildIngredientPurchaseLinkView({
                id: `draft-${index}`,
                url: normalizedUrl,
                normalizedUrl,
                position: index
              });
            } catch {
              return null;
            }
          })();
          const isFilled = row.trim().length > 0;

          return (
            <div key={`purchase-link-row-${index}`} className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex items-start gap-2">
                <input
                  type="url"
                  value={row}
                  onChange={(event) => {
                    setRows((current) => updateIngredientPurchaseLinkRows(current, index, event.target.value));
                  }}
                  className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="https://..."
                />
                {isFilled ? (
                  <button
                    type="button"
                    onClick={() => setRows((current) => removeIngredientPurchaseLinkRow(current, index))}
                    className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    aria-label="Удалить ссылку"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              {preview ? (
                <div className="flex items-center gap-2 text-sm text-zinc-600">
                  <PurchaseLinkMarketplaceBadge marketplace={preview.marketplace} />
                  <span className="font-medium text-zinc-900">{preview.marketplaceLabel}</span>
                  <span className="text-zinc-400">•</span>
                  <span>{preview.displayHost}</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </section>
  );
}
