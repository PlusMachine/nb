"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@nb/ui";
import { listIngredientPurchaseLinksAction } from "@/app/(app)/app/ingredients/metadata-actions";
import type { UserIngredientReference } from "@/features/ingredients/contracts";
import {
  buildIngredientPurchaseLinkView,
  normalizeIngredientPurchaseLinkInput,
  normalizeIngredientPurchaseLinkInputs
} from "@/features/ingredients/purchase-links";
import { PurchaseLinkMarketplaceBadge } from "./ingredient-purchase-links-manager";

export const createIngredientPurchaseLinkRows = (urls: string[] = []) => urls;

export const saveIngredientPurchaseLinkRow = (
  rows: string[],
  draft: { mode: "new"; value: string } | { mode: "edit"; index: number; value: string }
) => {
  const normalizedUrl = normalizeIngredientPurchaseLinkInput(draft.value);
  if (!normalizedUrl) {
    throw new Error("INVALID_PURCHASE_LINK_URL");
  }

  const nextRows = draft.mode === "new"
    ? [...rows, normalizedUrl]
    : rows.map((row, rowIndex) => rowIndex === draft.index ? normalizedUrl : row);

  return normalizeIngredientPurchaseLinkInputs(nextRows);
};

export const removeIngredientPurchaseLinkRow = (
  rows: string[],
  index: number
) => rows.filter((_row, rowIndex) => rowIndex !== index);

export const extractIngredientPurchaseLinkUrls = (rows: string[]) => rows
  .map((row) => row.trim())
  .filter(Boolean);

type PurchaseLinksFieldState = {
  urls: string[];
  isLoaded: boolean;
};

type DraftState =
  | { mode: "new"; value: string }
  | { mode: "edit"; index: number; value: string };

type Props = {
  reference: UserIngredientReference | null;
  enabled: boolean;
  allowDraftWithoutReference?: boolean;
  onStateChange?: (state: PurchaseLinksFieldState) => void;
  testId?: string;
};

const buildDraftPreview = (
  draft: DraftState | null,
  rows: string[]
) => {
  if (!draft) {
    return null;
  }

  try {
    const normalizedUrl = normalizeIngredientPurchaseLinkInput(draft.value);
    if (!normalizedUrl) {
      return null;
    }

    return buildIngredientPurchaseLinkView({
      id: draft.mode === "edit" ? `draft-edit-${draft.index}` : "draft-new",
      url: normalizedUrl,
      normalizedUrl,
      position: draft.mode === "edit" ? draft.index : rows.length
    });
  } catch {
    return null;
  }
};

export function IngredientPurchaseLinksField({
  reference,
  enabled,
  allowDraftWithoutReference = false,
  onStateChange,
  testId
}: Props) {
  const referenceSource = reference?.source ?? null;
  const referenceId = reference?.id ?? null;
  const referenceKey = referenceSource && referenceId ? `${referenceSource}:${referenceId}` : "none";
  const [rows, setRows] = useState<string[]>(() => createIngredientPurchaseLinkRows());
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!referenceSource || !referenceId) {
      if (allowDraftWithoutReference) {
        setIsLoaded(true);
        setIsLoading(false);
        setMessage(null);
        setDraft(null);
        setDraftError(null);
        return;
      }

      setRows(createIngredientPurchaseLinkRows());
      setIsLoaded(false);
      setIsLoading(false);
      setMessage(null);
      setDraft(null);
      setDraftError(null);
      return;
    }

    const currentReference: UserIngredientReference = {
      source: referenceSource,
      id: referenceId
    };
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
        setDraft(null);
        setDraftError(null);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setRows(createIngredientPurchaseLinkRows());
        setIsLoaded(true);
        setMessage("Не удалось загрузить сохранённые ссылки.");
        setDraft(null);
        setDraftError(null);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [allowDraftWithoutReference, enabled, referenceId, referenceKey, referenceSource]);

  const urls = useMemo(() => extractIngredientPurchaseLinkUrls(rows), [rows]);
  const draftPreview = useMemo(() => buildDraftPreview(draft, rows), [draft, rows]);

  useEffect(() => {
    onStateChange?.({
      urls,
      isLoaded
    });
  }, [isLoaded, onStateChange, urls]);

  if (!enabled || (!reference && !allowDraftWithoutReference)) {
    return null;
  }

  const saveDraft = () => {
    if (!draft) {
      return;
    }

    try {
      setRows((current) => saveIngredientPurchaseLinkRow(current, draft));
      setDraft(null);
      setDraftError(null);
    } catch {
      setDraftError("Укажите корректную ссылку.");
    }
  };

  const cancelDraft = () => {
    setDraft(null);
    setDraftError(null);
  };

  return (
    <section className="space-y-3" data-testid={testId}>
      <div className="space-y-1">
        <h4 className="text-sm font-medium text-zinc-900">Ссылки на покупку</h4>
      </div>

      {isLoading ? (
        <p className="text-sm text-zinc-500">Загружаем ссылки...</p>
      ) : null}

      {rows.length > 0 ? (
        <div className="space-y-3">
          {rows.map((row, index) => {
            const preview = buildIngredientPurchaseLinkView({
              id: `saved-${index}`,
              url: row,
              normalizedUrl: row,
              position: index
            });
            const isEditing = draft?.mode === "edit" && draft.index === index;

            if (isEditing) {
              return (
                <div key={`purchase-link-row-${index}`} className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <input
                    type="url"
                    value={draft.value}
                    onChange={(event) => {
                      setDraft({
                        mode: "edit",
                        index,
                        value: event.target.value
                      });
                      setDraftError(null);
                    }}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    placeholder="https://..."
                  />
                  {draftPreview ? (
                    <div className="flex items-center gap-2 text-sm text-zinc-600">
                      <PurchaseLinkMarketplaceBadge marketplace={draftPreview.marketplace} />
                      <span className="font-medium text-zinc-900">{draftPreview.marketplaceLabel}</span>
                      <span className="text-zinc-400">•</span>
                      <span>{draftPreview.displayHost}</span>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={saveDraft}>
                      Готово
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={cancelDraft}>
                      Отмена
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div key={`purchase-link-row-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="min-w-0 flex items-center gap-2">
                  <PurchaseLinkMarketplaceBadge marketplace={preview.marketplace} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{preview.marketplaceLabel}</p>
                    <p className="truncate text-xs text-zinc-500">{preview.displayHost}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({
                        mode: "edit",
                        index,
                        value: row
                      });
                      setDraftError(null);
                    }}
                    className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                    aria-label="Редактировать ссылку"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRows((current) => removeIngredientPurchaseLinkRow(current, index));
                      setDraftError(null);
                    }}
                    className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    aria-label="Удалить ссылку"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {draft?.mode === "new" ? (
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
          <input
            type="url"
            value={draft.value}
            onChange={(event) => {
              setDraft({
                mode: "new",
                value: event.target.value
              });
              setDraftError(null);
            }}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            placeholder="https://..."
          />
          {draftPreview ? (
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <PurchaseLinkMarketplaceBadge marketplace={draftPreview.marketplace} />
              <span className="font-medium text-zinc-900">{draftPreview.marketplaceLabel}</span>
              <span className="text-zinc-400">•</span>
              <span>{draftPreview.displayHost}</span>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={saveDraft}>
              Готово
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={cancelDraft}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}

      {!isLoading && draft == null ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setDraft({
              mode: "new",
              value: ""
            });
            setDraftError(null);
          }}
        >
          <Plus className="h-4 w-4" />
          Добавить ссылку
        </Button>
      ) : null}

      {draftError ? <p role="alert" className="text-sm text-red-600">{draftError}</p> : null}
      {message ? <p role="alert" className="text-sm text-red-600">{message}</p> : null}
    </section>
  );
}
