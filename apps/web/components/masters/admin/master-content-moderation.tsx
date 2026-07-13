"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Hammer } from "lucide-react";
import { Badge, Button, Dialog, DialogFooter, Textarea, useToast } from "@nb/ui";

import {
  hideMasterImageAction,
  hideMasterItemAction,
  unhideMasterImageAction,
  unhideMasterItemAction
} from "@/app/(admin)/admin/masters/[id]/actions";
import type { MasterImageDto, MasterItemDto } from "@/features/masters/service";

const HIDE_REASON_MIN = 3;
const HIDE_REASON_MAX = 500;

type HideTarget = { kind: "item" | "image"; id: string; label: string };

const formatDate = (value: Date) =>
  new Date(value).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });

function Thumb({ image, className = "" }: { image: MasterImageDto | null; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-muted ${className}`}>
      {image?.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <Hammer className="h-5 w-5 text-muted-foreground/60" aria-hidden />
        </span>
      )}
      {image?.hiddenAt ? <span className="absolute inset-0 bg-background/70" aria-hidden /> : null}
    </div>
  );
}

export function MasterContentModeration({
  items,
  images
}: {
  items: MasterItemDto[];
  images: MasterImageDto[];
}) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const [hideTarget, setHideTarget] = useState<HideTarget | null>(null);
  const [reason, setReason] = useState("");
  const [hideError, setHideError] = useState<string | null>(null);

  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length >= HIDE_REASON_MIN && trimmedReason.length <= HIDE_REASON_MAX;

  const galleryImages = images.filter((image) => image.itemId === null);
  const itemImages = (itemId: string) => images.filter((image) => image.itemId === itemId);
  const itemCover = (item: MasterItemDto): MasterImageDto | null => {
    const own = itemImages(item.id);
    return own.find((image) => image.id === item.coverImageId) ?? own[0] ?? null;
  };

  const closeHideDialog = () => {
    setHideTarget(null);
    setReason("");
    setHideError(null);
  };

  const handleHide = () => {
    if (!hideTarget || !reasonValid) {
      return;
    }

    const target = hideTarget;
    startTransition(async () => {
      const result = target.kind === "item"
        ? await hideMasterItemAction(target.id, trimmedReason)
        : await hideMasterImageAction(target.id, trimmedReason);

      if (!result.ok) {
        setHideError(result.error);
        show({ title: "Не удалось скрыть", description: result.error, tone: "danger" });
        return;
      }

      closeHideDialog();
      show({ title: target.kind === "item" ? "Товар скрыт" : "Фото скрыто", tone: "success" });
      router.refresh();
    });
  };

  const handleUnhide = (target: HideTarget) => {
    startTransition(async () => {
      const result = target.kind === "item"
        ? await unhideMasterItemAction(target.id)
        : await unhideMasterImageAction(target.id);

      if (!result.ok) {
        show({ title: "Не удалось вернуть", description: result.error, tone: "danger" });
        return;
      }

      show({ title: target.kind === "item" ? "Товар возвращён" : "Фото возвращено", tone: "success" });
      router.refresh();
    });
  };

  const hideTitle = hideTarget?.kind === "image" ? "Скрыть фото?" : "Скрыть товар?";

  const renderImageButton = (image: MasterImageDto, label: string) =>
    image.hiddenAt ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={() => handleUnhide({ kind: "image", id: image.id, label })}
      >
        <Eye className="h-4 w-4" aria-hidden />
        Показать
      </Button>
    ) : (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={() => setHideTarget({ kind: "image", id: image.id, label })}
      >
        <EyeOff className="h-4 w-4" aria-hidden />
        Скрыть
      </Button>
    );

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Товары в Маркете</h2>
        <span className="text-xs text-muted-foreground">Всего: {items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          У мастера пока нет товаров.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const photos = itemImages(item.id);

            return (
              <li key={item.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start gap-3">
                  <Thumb image={itemCover(item)} className="h-16 w-16 shrink-0" />

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{item.title}</span>
                      {item.hiddenAt ? <Badge tone="danger" size="sm">Скрыт</Badge> : null}
                      {item.priceNote ? (
                        <span className="text-xs text-muted-foreground">{item.priceNote}</span>
                      ) : null}
                    </div>

                    {item.hiddenAt ? (
                      <p className="text-xs text-muted-foreground">
                        {formatDate(item.hiddenAt)}
                        {item.hiddenReason ? ` — ${item.hiddenReason}` : null}
                      </p>
                    ) : null}
                  </div>

                  {item.hiddenAt ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleUnhide({ kind: "item", id: item.id, label: item.title })}
                    >
                      Показать
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="dangerOutline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => setHideTarget({ kind: "item", id: item.id, label: item.title })}
                    >
                      Скрыть
                    </Button>
                  )}
                </div>

                {photos.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3">
                    {photos.map((image) => (
                      <li key={image.id} className="flex flex-col items-center gap-1">
                        <Thumb image={image} className="h-14 w-14" />
                        {renderImageButton(image, `фото товара «${item.title}»`)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Галерея</h2>
          <span className="text-xs text-muted-foreground">Всего: {galleryImages.length}</span>
        </div>

        {galleryImages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Фото вне товаров нет.</p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {galleryImages.map((image) => (
              <li key={image.id} className="flex flex-col items-center gap-1">
                <Thumb image={image} className="h-14 w-14" />
                {renderImageButton(image, "фото галереи")}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={hideTarget !== null}
        onOpenChange={(next) => {
          if (!next && !isPending) {
            closeHideDialog();
          }
        }}
        title={hideTitle}
        hideTitle
        size="md"
        guard={{ isDirty: () => isPending, onGuardedClose: () => {} }}
      >
        <div className="space-y-3 p-5">
          <h3 className="text-base font-semibold text-foreground">{hideTitle}</h3>

          <p className="text-sm text-muted-foreground">
            {hideTarget?.kind === "image"
              ? "Фото пропадёт из Маркета и со страницы мастера. Мастер сможет заменить его, но вернуть скрытое — только модератор."
              : `Товар «${hideTarget?.label ?? ""}» пропадёт из Маркета и со страницы мастера. Остальная витрина останется на месте.`}
          </p>

          <div className="grid gap-1.5">
            <label htmlFor="master-hide-reason" className="text-sm font-medium text-foreground">
              Причина
            </label>
            <Textarea
              id="master-hide-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={HIDE_REASON_MAX}
              placeholder="Например: фото не соответствует товару"
              disabled={isPending}
            />
          </div>

          {hideError ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground ring-1 ring-inset ring-destructive-border"
            >
              {hideError}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={closeHideDialog}>
            Отмена
          </Button>
          <Button type="button" variant="danger" disabled={isPending || !reasonValid} onClick={handleHide}>
            {isPending ? "Скрываем…" : "Скрыть"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
