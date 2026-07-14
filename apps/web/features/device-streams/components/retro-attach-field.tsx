"use client";

// =============================================================================
//  features/device-streams/components/retro-attach-field.tsx
//  Промпт ретро-привязки (§5 F2 «Ретро-привязка данных»): «Забрать данные с …
//  (N точек)?» — чекбокс, включённый по умолчанию (частый реальный случай:
//  поплавок кинули в сусло раньше, чем перевели партию в «Брожение»). Общий для
//  всех трёх точек входа F2 (переход в «Брожение», блок «Брожение» на партии,
//  карточка устройства) — везде ретро-привязка ключуется ТОЛЬКО deviceId.
//  Подгружает previewRetroAttachAction сам (без похода родителя за данными);
//  ничего не рендерит, пока не пришёл ответ ИЛИ нечего забирать (пусто — не
//  пояснительный текст, а просто нет строки).
// =============================================================================
import { useEffect, useState } from "react";

import { Checkbox } from "@nb/ui";

import { previewRetroAttachAction } from "@/features/device-streams/actions";
import type { RetroAttachPreview } from "@/features/device-streams/contracts";
import { pluralize } from "@/lib/pluralize";

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type Props = {
  deviceId: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function RetroAttachField({ deviceId, checked, onCheckedChange }: Props) {
  const [preview, setPreview] = useState<RetroAttachPreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    void previewRetroAttachAction(deviceId).then((result) => {
      if (cancelled) return;
      if (result.ok) setPreview(result.preview);
    });
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  if (!preview || preview.count === 0 || !preview.oldestTs) {
    return null;
  }

  return (
    <label className="flex items-start gap-2 text-sm text-foreground">
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
      Забрать данные с {dateFmt.format(new Date(preview.oldestTs))} ({preview.count} {pluralize(preview.count, ["точка", "точки", "точек"])})
    </label>
  );
}
