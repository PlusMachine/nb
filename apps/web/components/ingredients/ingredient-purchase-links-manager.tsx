"use client";

import React from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Dialog, DialogCloseButton } from "@nb/ui";
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

/* ── Favicon URLs per marketplace ───────────────────────────────── */

const marketplaceFaviconUrl: Record<IngredientPurchaseLinkMarketplace, string | null> = {
  ozon:           "https://www.google.com/s2/favicons?domain=ozon.ru&sz=64",
  wildberries:    "https://www.google.com/s2/favicons?domain=wildberries.ru&sz=64",
  avito:          "https://www.google.com/s2/favicons?domain=avito.ru&sz=64",
  yandex_market:  "https://www.google.com/s2/favicons?domain=market.yandex.ru&sz=64",
  russkaya_dymka: "https://www.google.com/s2/favicons?domain=rdshop.ru&sz=64",
  kolba:          "https://www.google.com/s2/favicons?domain=kolba.ru&sz=64",
  birrf:          "https://www.google.com/s2/favicons?domain=xn--90aoy.xn--p1ai&sz=64",
  other:          null
};

const marketplaceFallbackBg: Record<IngredientPurchaseLinkMarketplace, string> = {
  ozon:           "#005BFF",
  wildberries:    "#CB11AB",
  avito:          "#00AAFF",
  yandex_market:  "#FC3F1D",
  russkaya_dymka: "#8B3A3A",
  kolba:          "#2D6A4F",
  birrf:          "#1B4F72",
  other:          "#71717A"
};

const marketplaceFallbackShort: Record<IngredientPurchaseLinkMarketplace, string> = {
  ozon:           "O",
  wildberries:    "W",
  avito:          "A",
  yandex_market:  "Я",
  russkaya_dymka: "Р",
  kolba:          "К",
  birrf:          "Б",
  other:          "?"
};

/* ─────────────────────────────────────────────────────────────────── */

type MarketplaceBadgeProps = {
  marketplace: IngredientPurchaseLinkMarketplace;
  className?: string;
  /** sm — 20px для карточек; md — 28px для модалки */
  size?: "sm" | "md";
};

export function PurchaseLinkMarketplaceBadge({
  marketplace,
  className = "",
  size = "md"
}: MarketplaceBadgeProps) {
  const [imgError, setImgError] = React.useState(false);
  const faviconUrl = marketplaceFaviconUrl[marketplace];
  const label = ingredientPurchaseLinkMarketplaceLabels[marketplace];
  const showFavicon = faviconUrl && !imgError;

  const px = size === "sm" ? "h-5 w-5" : "h-7 w-7";

  if (showFavicon) {
    return (
      <span
        title={label}
        aria-label={label}
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-zinc-200 ${px} ${className}`.trim()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={faviconUrl}
          alt=""
          aria-hidden="true"
          className="h-3/4 w-3/4 object-contain"
          onError={() => setImgError(true)}
        />
      </span>
    );
  }

  return (
    <span
      title={label}
      aria-label={label}
      style={{ backgroundColor: marketplaceFallbackBg[marketplace] }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-white ${px} ${size === "sm" ? "text-[10px]" : "text-xs"} font-bold leading-none ${className}`.trim()}
    >
      {marketplaceFallbackShort[marketplace]}
    </span>
  );
}

type IngredientPurchaseLinksEditorProps = {
  reference: UserIngredientReference;
  initialLinks?: IngredientPurchaseLinkDto[];
  enabled?: boolean;
  autoStartCreateWhenEmpty?: boolean;
  onRequestClose?: () => void;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
};

export const resolveIngredientPurchaseLinkInitialEditingId = ({
  autoStartCreateWhenEmpty = false,
  linksCount
}: {
  autoStartCreateWhenEmpty?: boolean;
  linksCount?: number | null;
}): string | "new" | null => (
  autoStartCreateWhenEmpty && linksCount === 0 ? "new" : null
);

export const shouldCloseIngredientPurchaseLinksOnCancel = ({
  editingId,
  linksCount
}: {
  editingId: string | "new" | null;
  linksCount: number;
}) => (
  editingId === "new" && linksCount === 0
);

export function IngredientPurchaseLinksEditor({
  reference,
  initialLinks,
  enabled = true,
  autoStartCreateWhenEmpty = false,
  onRequestClose,
  emptyStateTitle = "Ссылок на покупку пока нет",
  emptyStateDescription = "Добавьте площадки, где вы обычно заказываете этот ингредиент."
}: IngredientPurchaseLinksEditorProps) {
  const referenceSource = reference.source;
  const referenceId = reference.id;
  const referenceKey = `${referenceSource}:${referenceId}`;
  const [links, setLinks] = useState<IngredientPurchaseLinkDto[]>(initialLinks ?? []);
  const [hasLoaded, setHasLoaded] = useState(Boolean(initialLinks));
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | "new" | null>(() => (
    resolveIngredientPurchaseLinkInitialEditingId({
      autoStartCreateWhenEmpty,
      linksCount: initialLinks?.length
    })
  ));
  const [draftUrl, setDraftUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const nextEditingId = resolveIngredientPurchaseLinkInitialEditingId({
      autoStartCreateWhenEmpty,
      linksCount: initialLinks?.length
    });

    setLinks(initialLinks ?? []);
    setHasLoaded(Boolean(initialLinks));
    setEditingId(nextEditingId);
    setDraftUrl("");
    setMessage(null);
  }, [autoStartCreateWhenEmpty, initialLinks, referenceKey]);

  useEffect(() => {
    if (!enabled || hasLoaded) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void listIngredientPurchaseLinksAction({
      source: referenceSource,
      id: referenceId
    })
      .then((nextLinks) => {
        if (cancelled) {
          return;
        }

        const nextEditingId = resolveIngredientPurchaseLinkInitialEditingId({
          autoStartCreateWhenEmpty,
          linksCount: nextLinks.length
        });

        setLinks(nextLinks);
        setHasLoaded(true);
        setEditingId(nextEditingId);
        setDraftUrl("");
        setMessage(null);
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
  }, [autoStartCreateWhenEmpty, enabled, hasLoaded, referenceId, referenceKey, referenceSource]);

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
    if (shouldCloseIngredientPurchaseLinksOnCancel({ editingId, linksCount: links.length })) {
      onRequestClose?.();
      return;
    }

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
                    <Button type="button" size="sm" onClick={saveDraft} disabled={isPending}>
                      {isPending ? "Сохраняем..." : "Сохранить"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>
                      Отмена
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={link.id}
                className="flex items-stretch gap-2 rounded-2xl border border-zinc-200 bg-white p-1"
              >
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Открыть ${link.marketplaceLabel}`}
                  className="group flex min-w-0 flex-1 items-center gap-3 rounded-[1rem] px-3 py-3 transition-colors hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                >
                  <PurchaseLinkMarketplaceBadge marketplace={link.marketplace} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-950">{link.marketplaceLabel}</p>
                    <p className="truncate text-xs text-zinc-500">{link.displayHost}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500 group-focus-visible:text-zinc-500" />
                </a>
                <div className="flex shrink-0 items-center gap-1 pr-1">
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
        <div className="space-y-3">
          <input
            type="url"
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            placeholder="https://..."
            aria-label="Ссылка"
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
            <Button type="button" size="sm" onClick={saveDraft} disabled={isPending}>
              {isPending ? "Сохраняем..." : "Добавить"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>
              Отмена
            </Button>
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

      {message ? <p role="alert" className="text-sm text-red-600">{message}</p> : null}
    </div>
  );
}

type IngredientPurchaseLinksDialogProps = {
  open: boolean;
  onClose: () => void;
  reference: UserIngredientReference;
  initialLinks?: IngredientPurchaseLinkDto[];
  autoStartCreateWhenEmpty?: boolean;
  title?: string;
};

export function IngredientPurchaseLinksDialog({
  open,
  onClose,
  reference,
  initialLinks,
  autoStartCreateWhenEmpty = false,
  title = "Ссылки на покупку"
}: IngredientPurchaseLinksDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      hideTitle
      size="lg"
    >
      <div className="p-5">
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 className="text-2xl font-semibold text-zinc-950">{title}</h2>
          <DialogCloseButton aria-label="Закрыть ссылки на покупку" />
        </div>

        <IngredientPurchaseLinksEditor
          reference={reference}
          initialLinks={initialLinks}
          enabled={open}
          autoStartCreateWhenEmpty={autoStartCreateWhenEmpty}
          onRequestClose={onClose}
        />
      </div>
    </Dialog>
  );
}
