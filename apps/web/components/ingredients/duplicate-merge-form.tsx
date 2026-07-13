"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Textarea } from "@nb/ui";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import { resolveIngredientPrimaryDisplayName } from "@/features/ingredients/presentation";

type PrefilledIngredient = {
  id: string;
  label: string;
};

type Props = {
  initialSource?: PrefilledIngredient | null;
  initialTarget?: PrefilledIngredient | null;
};

export const DuplicateMergeForm = ({ initialSource = null, initialTarget = null }: Props) => {
  const router = useRouter();
  const [source, setSource] = useState<string>(initialSource?.id ?? "");
  const [sourceLabel, setSourceLabel] = useState<string>(initialSource?.label ?? "");
  const [target, setTarget] = useState<string>(initialTarget?.id ?? "");
  const [targetLabel, setTargetLabel] = useState<string>(initialTarget?.label ?? "");
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInvalidSelection = source.length === 0 || target.length === 0 || source === target;

  const merge = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      const response = await fetch("/api/admin/ingredients/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceIngredientId: source, targetIngredientId: target, note })
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? "Не удалось объединить ингредиенты.");
      }

      setConfirmOpen(false);
      router.push("/admin/ingredients");
      router.refresh();
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="space-y-5">
      <AdminPageHeader
        title="Объединение дубликатов"
        description="Исходный ингредиент получит статус «объединён», все ссылки на него уедут на итоговую карточку."
        backHref="/admin/ingredients"
        backLabel="К каталогу"
      />

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Исходный ингредиент</p>
          <IngredientPicker
            includeCustom={false}
            value={sourceLabel}
            onSelectionInvalidated={() => setSource("")}
            onSelect={(item) => {
              setSource(item.id);
              setSourceLabel(resolveIngredientPrimaryDisplayName(item));
              setError(null);
            }}
            placeholder="Найдите исходный ингредиент"
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Итоговый ингредиент</p>
          <IngredientPicker
            includeCustom={false}
            value={targetLabel}
            onSelectionInvalidated={() => setTarget("")}
            onSelect={(item) => {
              setTarget(item.id);
              setTargetLabel(resolveIngredientPrimaryDisplayName(item));
              setError(null);
            }}
            placeholder="Найдите итоговый ингредиент"
          />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="merge-note" className="text-sm font-medium text-foreground">Комментарий</label>
          <Textarea
            id="merge-note"
            className="min-h-[96px]"
            placeholder="Останется в истории объединений"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        {source && target && source === target ? (
          <p role="alert" className="text-sm text-destructive">
            Исходный и итоговый ингредиент не могут быть одной карточкой.
          </p>
        ) : null}

        {error && !confirmOpen ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

        <Button
          size="md"
          type="button"
          disabled={isInvalidSelection || isSubmitting}
          onClick={() => {
            setError(null);
            setConfirmOpen(true);
          }}
        >
          Объединить
        </Button>
      </div>

      <ConfirmActionDialog
        open={confirmOpen}
        title="Объединить ингредиенты?"
        description={`«${sourceLabel}» получит статус «объединён» и уступит место карточке «${targetLabel}». Отменить объединение нельзя.`}
        confirmLabel="Объединить"
        pendingLabel="Объединяем..."
        pending={isSubmitting}
        error={error}
        onConfirm={merge}
        onClose={() => {
          if (isSubmitting) {
            return;
          }
          setConfirmOpen(false);
          setError(null);
        }}
      />
    </section>
  );
};
