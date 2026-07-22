"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { Dialog, useToast } from "@nb/ui";

import { copyPlainText } from "@/components/shared/copy-link-button";
import { buildShoppingListCopyText } from "@/features/shopping/copy-text";
import type { ShoppingListGroupDto, ShoppingManualItemDto } from "@/features/shopping/contracts";

/**
 * Кнопка-иконка «Скопировать список» (П3) в шапке блока «Добавить на склад».
 * Скрыта, если копировать нечего — buildShoppingListCopyText сама решает по
 * checked-флагам (не завязана на checkedCount, который считает и отмеченные
 * ручные позиции по другой семантике). Успех — тост; недоступный clipboard
 * (http, старый webview) — фолбэк-диалог с <textarea readOnly>, чтобы можно
 * было скопировать вручную.
 */
export function CopyListButton({
  groups,
  manualItems
}: {
  groups: ShoppingListGroupDto[];
  manualItems: ShoppingManualItemDto[];
}) {
  const { show } = useToast();
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const text = useMemo(() => buildShoppingListCopyText({ groups, manualItems }), [groups, manualItems]);

  useEffect(() => {
    if (fallbackOpen) {
      textareaRef.current?.select();
    }
  }, [fallbackOpen]);

  if (!text) {
    return null;
  }

  const handleClick = async () => {
    const ok = await copyPlainText(text);
    if (ok) {
      show({ title: "Список скопирован" });
      return;
    }
    setFallbackOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Скопировать список"
        title="Скопировать список"
        // h-11 w-11 — тач-таргет ≥44px, тот же приём, что у DialogCloseButton.
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Copy className="h-4 w-4" aria-hidden />
      </button>

      <Dialog
        open={fallbackOpen}
        onOpenChange={setFallbackOpen}
        title="Скопировать список"
        hideTitle
        description="Не удалось скопировать автоматически — выделите текст и скопируйте вручную."
        size="md"
      >
        <div className="space-y-3 p-5">
          <h3 className="text-base font-semibold text-foreground">Скопировать список</h3>
          <p className="text-sm text-muted-foreground">
            Не удалось скопировать автоматически — выделите текст ниже и скопируйте вручную.
          </p>
          <textarea
            ref={textareaRef}
            readOnly
            value={text}
            rows={10}
            className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground"
          />
        </div>
      </Dialog>
    </>
  );
}
