"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@nb/ui";

import {
  resolveIngredientProposalAction,
  type IngredientProposalAction
} from "@/app/(admin)/admin/ingredients/moderation/actions";
import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import {
  describeIngredientProposalPayload,
  formatIngredientProposalSourceLabel
} from "@/features/ingredients/proposal-presentation";

type QueueItem = {
  id: string;
  sourceDisplayName: string;
  sourceType: string;
  sourcePayload: Record<string, unknown>;
  status: string;
};

type QueueTarget = {
  id: string;
  displayName: string;
};

const successTitles: Record<IngredientProposalAction, string> = {
  approve: "Заявка принята",
  reject: "Заявка отклонена",
  merge: "Заявка объединена с ингредиентом"
};

const failureTitles: Record<IngredientProposalAction, string> = {
  approve: "Не удалось принять заявку",
  reject: "Не удалось отклонить заявку",
  merge: "Не удалось объединить заявку"
};

export const ModerationQueue = ({ initialItems }: { initialItems: QueueItem[] }) => {
  const router = useRouter();
  const { show } = useToast();
  const [items, setItems] = useState(initialItems);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [targets, setTargets] = useState<Record<string, QueueTarget>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const act = (id: string, action: IngredientProposalAction) => {
    setPendingId(id);
    startTransition(async () => {
      const result = await resolveIngredientProposalAction({
        id,
        action,
        resolutionNote: notes[id],
        targetIngredientId: targets[id]?.id
      });
      setPendingId(null);

      if (!result.ok) {
        show({ title: failureTitles[action], description: result.error, tone: "danger" });
        return;
      }

      setItems((state) => state.filter((item) => item.id !== id));
      show({ title: successTitles[action], tone: "success" });
      router.refresh();
    });
  };

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Заявок на ингредиенты нет.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pending = pendingId === item.id;
        const fields = describeIngredientProposalPayload(item.sourcePayload);
        const target = targets[item.id] ?? null;

        return (
          <article key={item.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">{item.sourceDisplayName}</h2>
              <p className="text-xs text-muted-foreground">
                {formatIngredientProposalSourceLabel(item.sourceType)}
              </p>
            </div>

            {fields.length > 0 ? (
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
                {fields.map((field) => (
                  <div key={field.key} className="contents">
                    <dt className="text-muted-foreground">{field.label}</dt>
                    <dd className="break-words text-foreground">{field.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {Object.keys(item.sourcePayload).length > 0 ? (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Исходные данные заявки</summary>
                <pre className="mt-2 overflow-auto rounded-md bg-muted p-2 text-xs text-foreground">
                  {JSON.stringify(item.sourcePayload, null, 2)}
                </pre>
              </details>
            ) : null}

            <textarea
              placeholder="Комментарий модератора (необязательно)"
              disabled={pending}
              onChange={(event) => setNotes((state) => ({ ...state, [item.id]: event.target.value }))}
              className="h-16 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />

            <div className="space-y-1">
              <IngredientPicker
                includeCustom={false}
                onSelect={(selected) =>
                  setTargets((state) => ({
                    ...state,
                    [item.id]: { id: selected.id, displayName: selected.displayName }
                  }))
                }
                placeholder="Найдите итоговый ингредиент"
                emptyCta={<p className="text-xs text-muted-foreground">Не нашли? Предложить / создать свой ингредиент</p>}
              />
              {target ? (
                <p className="text-xs text-muted-foreground">Объединить с: «{target.displayName}»</p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => act(item.id, "approve")}>
                {pending ? "Сохраняем…" : "Одобрить"}
              </Button>
              <Button type="button" variant="dangerOutline" size="sm" disabled={pending} onClick={() => act(item.id, "reject")}>
                Отклонить
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || !target}
                onClick={() => act(item.id, "merge")}
              >
                Объединить
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
};
