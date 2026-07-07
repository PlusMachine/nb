"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Button, useToast } from "@nb/ui";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { MASTER_ITEM_MAX_COUNT, MASTER_ITEM_IMAGE_MAX_COUNT } from "@/features/masters/contracts";
import type { MasterItemDto } from "@/features/masters/service";

import {
  createMasterItemAction,
  deleteMasterItemAction,
  reorderMasterItemsAction,
  setMasterItemCoverAction,
  updateMasterItemAction
} from "./actions";
import { MasterImageManager, type MasterImageCardItem } from "./master-image-manager";

type ItemFormValues = { title: string; description: string; priceNote: string };

const emptyItemForm: ItemFormValues = { title: "", description: "", priceNote: "" };

const itemToFormValues = (item: MasterItemDto): ItemFormValues => ({
  title: item.title,
  description: item.description,
  priceNote: item.priceNote ?? ""
});

const inputClassName = "h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const textareaClassName = "min-h-[5rem] rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function ItemForm({
  values,
  onChange,
  disabled
}: {
  values: ItemFormValues;
  onChange: (next: ItemFormValues) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Название изделия</span>
        <input
          className={inputClassName}
          value={values.title}
          onChange={(event) => onChange({ ...values, title: event.target.value })}
          maxLength={160}
          disabled={disabled}
          placeholder="ЦКТ 60 л"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Описание</span>
        <textarea
          className={textareaClassName}
          value={values.description}
          onChange={(event) => onChange({ ...values, description: event.target.value })}
          maxLength={2000}
          disabled={disabled}
          placeholder="Характеристики, материалы, комплектация…"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:w-64">
        <span className="text-muted-foreground">Цена (свободный текст, опционально)</span>
        <input
          className={inputClassName}
          value={values.priceNote}
          onChange={(event) => onChange({ ...values, priceNote: event.target.value })}
          maxLength={80}
          disabled={disabled}
          placeholder="от 25 000 ₽ / по запросу"
        />
      </label>
    </div>
  );
}

function ItemCard({
  item,
  index,
  count,
  images,
  disabled,
  atProfileLimit,
  onImagesChange,
  onItemChange,
  onItemDeleted,
  onMove
}: {
  item: MasterItemDto;
  index: number;
  count: number;
  images: MasterImageCardItem[];
  disabled: boolean;
  atProfileLimit: boolean;
  onImagesChange: (images: MasterImageCardItem[]) => void;
  onItemChange: (item: MasterItemDto) => void;
  onItemDeleted: (itemId: string) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<ItemFormValues>(() => itemToFormValues(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const itemImages = images.filter((image) => image.itemId === item.id);

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    const result = await updateMasterItemAction(item.id, values);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onItemChange(result.item);
    setEditing(false);
    toast.show({ title: "Изделие сохранено", tone: "success" });
  };

  const handleDelete = async () => {
    setBusy(true);
    const result = await deleteMasterItemAction(item.id);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setConfirmDeleteOpen(false);
    onItemDeleted(item.id);
    toast.show({ title: "Изделие удалено", description: "Фото изделия перешли в общую галерею.", tone: "success" });
  };

  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-base font-semibold text-foreground">{item.title}</h3>
          {item.priceNote ? (
            <span className="mt-1 inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
              {item.priceNote}
            </span>
          ) : null}
          {item.description ? (
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{item.description}</p>
          ) : null}
        </div>

        {!disabled ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Переместить раньше"
              disabled={index === 0}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent disabled:opacity-30"
              onClick={() => onMove(-1)}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Переместить позже"
              disabled={index === count - 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent disabled:opacity-30"
              onClick={() => onMove(1)}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Редактировать изделие"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent"
              onClick={() => setEditing((current) => !current)}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Удалить изделие"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-destructive-border bg-card text-destructive hover:bg-destructive-subtle"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <ItemForm values={values} onChange={setValues} disabled={busy} />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => void handleSave()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Сохранить
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setEditing(false); setValues(itemToFormValues(item)); }}>
              Отменить
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 border-t border-border pt-4">
        <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Фото изделия ({itemImages.filter((i) => !i.isLocalOnly).length}/{MASTER_ITEM_IMAGE_MAX_COUNT})</p>
        <MasterImageManager
          itemId={item.id}
          images={itemImages}
          onChange={(nextItemImages) => {
            onImagesChange([...images.filter((image) => image.itemId !== item.id), ...nextItemImages]);
          }}
          disabled={disabled}
          atProfileLimit={atProfileLimit}
          scopeMaxCount={MASTER_ITEM_IMAGE_MAX_COUNT}
          coverImageId={item.coverImageId}
          onSetCover={disabled ? undefined : async (imageId) => {
            const result = await setMasterItemCoverAction(item.id, imageId);
            if (!result.ok) {
              toast.show({ title: "Не удалось назначить обложку", description: result.error, tone: "danger" });
              return;
            }
            onItemChange({ ...item, coverImageId: result.item.coverImageId });
          }}
          emptyLabel="Фото этого изделия ещё нет."
        />
      </div>

      <ConfirmActionDialog
        open={confirmDeleteOpen}
        title="Удалить изделие?"
        description="Карточка изделия будет удалена. Фото изделия не пропадут — перейдут в общую галерею."
        confirmLabel="Удалить изделие"
        pending={busy}
        error={error}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
      />
    </article>
  );
}

export function MasterItemsSection({
  items,
  images,
  disabled,
  atProfileLimit,
  onItemsChange,
  onImagesChange
}: {
  items: MasterItemDto[];
  images: MasterImageCardItem[];
  disabled: boolean;
  atProfileLimit: boolean;
  onItemsChange: (items: MasterItemDto[]) => void;
  onImagesChange: (images: MasterImageCardItem[]) => void;
}) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [createValues, setCreateValues] = useState<ItemFormValues>(emptyItemForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    const result = await createMasterItemAction(createValues);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onItemsChange([...items, result.item]);
    setCreating(false);
    setCreateValues(emptyItemForm);
    toast.show({ title: "Изделие добавлено", tone: "success" });
  };

  const handleMove = async (item: MasterItemDto, direction: -1 | 1) => {
    const index = items.findIndex((candidate) => candidate.id === item.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) {
      return;
    }

    const reordered = [...items];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    const previous = items;
    onItemsChange(reordered);

    const result = await reorderMasterItemsAction(reordered.map((candidate) => candidate.id));
    if (!result.ok) {
      onItemsChange(previous);
      toast.show({ title: "Не удалось изменить порядок", description: result.error, tone: "danger" });
      return;
    }

    onItemsChange(result.items);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Изделия ({items.length}/{MASTER_ITEM_MAX_COUNT})</h2>
        {!disabled && !creating && items.length < MASTER_ITEM_MAX_COUNT ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Добавить изделие
          </Button>
        ) : null}
      </div>

      {creating ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-border bg-card p-4">
          <ItemForm values={createValues} onChange={setCreateValues} disabled={busy} />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => void handleCreate()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Добавить
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { setCreating(false); setError(null); setCreateValues(emptyItemForm); }}>
              Отменить
            </Button>
          </div>
        </div>
      ) : null}

      {items.length ? (
        <div className="space-y-3">
          {items.map((item, index) => (
            <ItemCard
              key={item.id}
              item={item}
              index={index}
              count={items.length}
              images={images}
              disabled={disabled}
              atProfileLimit={atProfileLimit}
              onImagesChange={onImagesChange}
              onItemChange={(nextItem) => onItemsChange(items.map((candidate) => (candidate.id === nextItem.id ? nextItem : candidate)))}
              onItemDeleted={(itemId) => onItemsChange(items.filter((candidate) => candidate.id !== itemId))}
              onMove={(direction) => void handleMove(item, direction)}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-sm text-muted-foreground">
          Изделий пока нет.
        </p>
      )}
    </section>
  );
}
