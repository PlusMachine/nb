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

export function RemoteDisabledNotice({ message, brewBatchId }: { message: string; brewBatchId: string }) {
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950" role="status">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <p>{message}</p>
      </div>
      <a
        href={`/app/brew-batches/${brewBatchId}`}
        className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800"
      >
        Перейти к варке
      </a>
    </div>
  );
}
