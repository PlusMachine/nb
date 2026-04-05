"use client";

import React from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createIngredientPurchaseLinkAction,
  deleteIngredientPurchaseLinkAction,
  listIngredientPurchaseLinksAction,
  updateIngredientPurchaseLinkAction
} from "@/app/(app)/app/ingredients/metadata-actions";
import type {
  IngredientPurchaseLinkDto,
  IngredientPurchaseLinkMarketplace,
  UserIngredientReference
} from "@/features/ingredients/contracts";
import {
  buildIngredientPurchaseLinkView,
  ingredientPurchaseLinkMarketplaceAbbreviations,
  ingredientPurchaseLinkMarketplaceLabels,
  normalizeIngredientPurchaseLinkInput
} from "@/features/ingredients/purchase-links";

type MarketplaceBadgeProps = {
  marketplace: IngredientPurchaseLinkMarketplace;
  className?: string;
};

export function PurchaseLinkMarketplaceBadge({
  marketplace,
  className = ""
}: MarketplaceBadgeProps) {
  const abbreviation = ingredientPurchaseLinkMarketplaceAbbreviations[marketplace];

  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 px-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600 ${className}`.trim()}
      title={ingredientPurchaseLinkMarketplaceLabels[marketplace]}
    >
      {abbreviation}
    </span>
  );
}

type IngredientPurchaseLinksEditorProps = {
  reference: UserIngredientReference;
  initialLinks?: IngredientPurchaseLinkDto[];
  enabled?: boolean;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
};

export function IngredientPurchaseLinksEditor({
  reference,
  initialLinks,
  enabled = true,
  emptyStateTitle = "Ссылок на покупку пока нет",
  emptyStateDescription = "Добавьте площадки, где вы обычно заказываете этот ингредиент."
}: IngredientPurchaseLinksEditorProps) {
  const referenceKey = `${reference.source}:${reference.id}`;
  const [links, setLinks] = useState<IngredientPurchaseLinkDto[]>(initialLinks ?? []);
  const [hasLoaded, setHasLoaded] = useState(Boolean(initialLinks));
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draftUrl, setDraftUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLinks(initialLinks ?? []);
    setHasLoaded(Boolean(initialLinks));
    setEditingId(null);
    setDraftUrl("");
    setMessage(null);
  }, [initialLinks, referenceKey]);

  useEffect(() => {
    if (!enabled || hasLoaded) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void listIngredientPurchaseLinksAction(reference)
      .then((nextLinks) => {
        if (cancelled) {
          return;
        }

        setLinks(nextLinks);
        setHasLoaded(true);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setMessage("Не удалось загрузить ссылки.");
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, hasLoaded, reference, referenceKey]);

  const draftPreview = useMemo(() => {
    try {
      const normalizedUrl = normalizeIngredientPurchaseLinkInput(draftUrl);
      if (!normalizedUrl) {
        return null;
      }

      return buildIngredientPurchaseLinkView({
        id: editingId ?? "draft",
        url: normalizedUrl,
        normalizedUrl,
        position: 0
      });
    } catch {
      return null;
    }
  }, [draftUrl, editingId]);

  const startCreate = () => {
    setEditingId("new");
    setDraftUrl("");
    setMessage(null);
  };

  const startEdit = (link: IngredientPurchaseLinkDto) => {
    setEditingId(link.id);
    setDraftUrl(link.url);
    setMessage(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftUrl("");
    setMessage(null);
  };

  const saveDraft = () => {
    startTransition(async () => {
      if (editingId === "new") {
        const result = await createIngredientPurchaseLinkAction({
          reference,
          url: draftUrl
        });

        if (!result.ok || !result.link) {
          setMessage(result.message ?? "Не удалось сохранить ссылку.");
          return;
        }

        setLinks((current) => [...current, result.link!].sort((left, right) => left.position - right.position));
        cancelEdit();
        return;
      }

      if (!editingId) {
        return;
      }

      const result = await updateIngredientPurchaseLinkAction({
        reference,
        purchaseLinkId: editingId,
        url: draftUrl
      });

      if (!result.ok || !result.link) {
        setMessage(result.message ?? "Не удалось обновить ссылку.");
        return;
      }

      setLinks((current) => current.map((link) => (
        link.id === editingId ? result.link! : link
      )));
      cancelEdit();
    });
  };

  const removeLink = (purchaseLinkId: string) => {
    startTransition(async () => {
      const result = await deleteIngredientPurchaseLinkAction({
        reference,
        purchaseLinkId
      });

      if (!result.ok) {
        setMessage(result.message ?? "Не удалось удалить ссылку.");
        return;
      }

      setLinks((current) => current.filter((link) => link.id !== purchaseLinkId));
      if (editingId === purchaseLinkId) {
        cancelEdit();
      }
    });
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <p className="text-sm text-zinc-500">Загружаем ссылки...</p>
      ) : null}

      {!isLoading && links.length === 0 && editingId == null ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-5">
          <p className="text-sm font-medium text-zinc-900">{emptyStateTitle}</p>
          <p className="mt-1 text-sm text-zinc-500">{emptyStateDescription}</p>
          <button
            type="button"
            onClick={startCreate}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
          >
            <Plus className="h-4 w-4" />
            Добавить ссылку
          </button>
        </div>
      ) : null}

      {links.length > 0 ? (
        <div className="space-y-2">
          {links.map((link) => {
            const isEditing = editingId === link.id;

            if (isEditing) {
              return (
                <div key={link.id} className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <label className="block text-sm font-medium text-zinc-900">
                    Ссылка на покупку
                    <input
                      type="url"
                      value={draftUrl}
                      onChange={(event) => setDraftUrl(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      placeholder="https://..."
                    />
                  </label>
                  {draftPreview ? (
                    <div className="flex items-center gap-2 text-sm text-zinc-600">
                      <PurchaseLinkMarketplaceBadge marketplace={draftPreview.marketplace} />
                      <span className="font-medium text-zinc-900">{draftPreview.marketplaceLabel}</span>
                      <span className="text-zinc-400">•</span>
                      <span>{draftPreview.displayHost}</span>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={saveDraft}
                      disabled={isPending}
                      className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {isPending ? "Сохраняем..." : "Сохранить"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={link.id} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                <div className="min-w-0 flex items-center gap-3">
                  <PurchaseLinkMarketplaceBadge marketplace={link.marketplace} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-950">{link.marketplaceLabel}</p>
                    <p className="truncate text-xs text-zinc-500">{link.displayHost}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                    aria-label={`Открыть ${link.marketplaceLabel}`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => startEdit(link)}
                    className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                    aria-label="Редактировать ссылку"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLink(link.id)}
                    className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
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

      {editingId === "new" ? (
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
          <label className="block text-sm font-medium text-zinc-900">
            Ссылка на покупку
            <input
              type="url"
              value={draftUrl}
              onChange={(event) => setDraftUrl(event.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </label>
          {draftPreview ? (
            <div className="flex items-center gap-2 text-sm text-zinc-600">
              <PurchaseLinkMarketplaceBadge marketplace={draftPreview.marketplace} />
              <span className="font-medium text-zinc-900">{draftPreview.marketplaceLabel}</span>
              <span className="text-zinc-400">•</span>
              <span>{draftPreview.displayHost}</span>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveDraft}
              disabled={isPending}
              className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {isPending ? "Сохраняем..." : "Добавить"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {links.length > 0 && editingId == null ? (
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
        >
          <Plus className="h-4 w-4" />
          Добавить ссылку
        </button>
      ) : null}

      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </div>
  );
}

type IngredientPurchaseLinksDialogProps = {
  open: boolean;
  onClose: () => void;
  reference: UserIngredientReference;
  initialLinks?: IngredientPurchaseLinkDto[];
  title?: string;
};

export function IngredientPurchaseLinksDialog({
  open,
  onClose,
  reference,
  initialLinks,
  title = "Ссылки на покупку"
}: IngredientPurchaseLinksDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl sm:max-w-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Покупка</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-950">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-200 bg-white p-2 text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-950"
            aria-label="Закрыть ссылки на покупку"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6">
          <IngredientPurchaseLinksEditor
            reference={reference}
            initialLinks={initialLinks}
            enabled={open}
          />
        </div>
      </div>
    </div>
  );

  if (typeof window === "undefined") {
    return content;
  }

  if (!mounted) {
    return null;
  }

  return createPortal(content, document.body);
}
