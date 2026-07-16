"use client";

// =============================================================================
//  features/brew-controller/components/remote-disabled-notice.tsx
//  Честный REMOTE_DISABLED-баннер: устройство приняло рецепт, но удалённый
//  нагрев выключен на самом устройстве (opt-in гейт авторитетен). Партия уже
//  создана и переведена в 'brewing' — но НЕ уходим к ней молча: показываем
//  сообщение и ждём явного клика «Перейти к варке». Обычный <a>, не next/link —
//  переход может пересекать зоны (публичная витрина/пульт устройства → app).
// =============================================================================
import { AlertTriangle } from "lucide-react";

export function RemoteDisabledNotice({
  message,
  brewBatchId,
  query
}: {
  message: string;
  brewBatchId: string;
  /** Query-строка (без «?») — фидбэк списания склада довозится до страницы
   *  партии тем же способом, что и у виртуальной ветки (см. brew-picker-dialog.tsx). */
  query?: string;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-3 text-sm text-warning-subtle-foreground" role="status">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-subtle-foreground" aria-hidden />
        <p>{message}</p>
      </div>
      <a
        href={`/app/brew-batches/${brewBatchId}${query ? `?${query}` : ""}`}
        className="inline-flex items-center justify-center rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background hover:bg-foreground/90"
      >
        Перейти к варке
      </a>
    </div>
  );
}
