"use client";

import { Plus } from "lucide-react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { RecipeImageCard, type RecipeImageCardItem } from "./recipe-image-card";

function SortableRecipeImageCard({
  item,
  onDelete,
  onOpen,
  onRetry,
  onSetCover
}: {
  item: RecipeImageCardItem;
  onDelete: (item: RecipeImageCardItem) => void;
  onOpen: (item: RecipeImageCardItem) => void;
  onRetry: (item: RecipeImageCardItem) => void;
  onSetCover: (item: RecipeImageCardItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition
      }}
    >
      <RecipeImageCard
        item={item}
        reorderMode
        dragAttributes={attributes}
        dragListeners={listeners}
        onDelete={() => onDelete(item)}
        onOpen={() => onOpen(item)}
        onRetry={() => onRetry(item)}
        onSetCover={() => onSetCover(item)}
      />
    </div>
  );
}

function AddMoreTile({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Добавить фото"
      className={`flex shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-border text-muted-foreground transition hover:border-muted-foreground hover:bg-accent hover:text-foreground active:bg-muted ${className ?? ""}`}
    >
      <Plus className="h-5 w-5" />
    </button>
  );
}

export function RecipeImageGrid({
  items,
  reorderMode,
  onAddMore,
  onDelete,
  onOpen,
  onRetry,
  onSetCover,
  onReorder
}: {
  items: RecipeImageCardItem[];
  reorderMode: boolean;
  onAddMore?: () => void;
  onDelete: (item: RecipeImageCardItem) => void;
  onOpen: (item: RecipeImageCardItem) => void;
  onRetry: (item: RecipeImageCardItem) => void;
  onSetCover: (item: RecipeImageCardItem) => void;
  onReorder: (orderedIds: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  if (!items.length) {
    return null;
  }

  const cover = items.find((item) => item.isCover && item.status === "ready")
    ?? items.find((item) => item.status === "ready")
    ?? items[0];
  const secondaryItems = items.filter((item) => item.id !== cover.id);

  if (reorderMode) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event: DragEndEvent) => {
          if (!event.over || event.active.id === event.over.id) {
            return;
          }

          const oldIndex = items.findIndex((item) => item.id === event.active.id);
          const newIndex = items.findIndex((item) => item.id === event.over?.id);
          if (oldIndex < 0 || newIndex < 0) {
            return;
          }

          onReorder(arrayMove(items, oldIndex, newIndex).map((item) => item.id));
        }}
      >
        <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item) => (
              <SortableRecipeImageCard
                key={item.id}
                item={item}
                onDelete={onDelete}
                onOpen={onOpen}
                onRetry={onRetry}
                onSetCover={onSetCover}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  const hasSidebar = secondaryItems.length > 0;

  return (
    <div className="space-y-2">
      {/* Desktop: cover + sidebar grid / Mobile: cover only */}
      <div className={hasSidebar ? "lg:grid lg:grid-cols-[1fr_12.5rem] lg:gap-2" : ""}>
        {/* Cover image */}
        <div className="overflow-hidden rounded-2xl">
          <RecipeImageCard
            item={cover}
            variant="cover"
            onDelete={() => onDelete(cover)}
            onOpen={() => onOpen(cover)}
            onRetry={() => onRetry(cover)}
            onSetCover={() => onSetCover(cover)}
          />
        </div>

        {/* Desktop thumbnail sidebar */}
        {hasSidebar ? (
          <div className="hidden lg:grid lg:grid-cols-2 lg:content-start lg:gap-1.5">
            {secondaryItems.map((item) => (
              <div key={item.id} className="aspect-square overflow-hidden rounded-xl">
                <RecipeImageCard
                  item={item}
                  variant="thumb"
                  onDelete={() => onDelete(item)}
                  onOpen={() => onOpen(item)}
                  onRetry={() => onRetry(item)}
                  onSetCover={() => onSetCover(item)}
                />
              </div>
            ))}
            {onAddMore ? (
              <AddMoreTile onClick={onAddMore} className="aspect-square rounded-xl" />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Mobile + tablet horizontal strip (secondary thumbnails) */}
      {(secondaryItems.length > 0 || onAddMore) ? (
        <div className="flex snap-x gap-2 overflow-x-auto pb-0.5 lg:hidden [scrollbar-width:none]">
          {secondaryItems.map((item) => (
            <div key={item.id} className="aspect-square w-[4.5rem] shrink-0 snap-start overflow-hidden rounded-xl sm:w-20">
              <RecipeImageCard
                item={item}
                variant="thumb"
                onDelete={() => onDelete(item)}
                onOpen={() => onOpen(item)}
                onRetry={() => onRetry(item)}
                onSetCover={() => onSetCover(item)}
              />
            </div>
          ))}
          {onAddMore ? (
            <AddMoreTile onClick={onAddMore} className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-xl sm:h-20 sm:w-20" />
          ) : null}
        </div>
      ) : null}

      {/* Desktop: "+" button when only 1 image (no sidebar) */}
      {!hasSidebar && onAddMore ? (
        <div className="hidden lg:block">
          <button
            type="button"
            onClick={onAddMore}
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground transition hover:border-muted-foreground hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Добавить фото
          </button>
        </div>
      ) : null}
    </div>
  );
}
