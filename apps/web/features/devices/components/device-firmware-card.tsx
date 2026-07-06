"use client";

// =============================================================================
//  features/devices/components/device-firmware-card.tsx
//  Блок «Прошивка» на странице настроек устройства (F3, docs/brewforge-
//  firmware-releases.md §6): текущая версия; при доступном обновлении — версия,
//  changelog и кнопка «Обновить» (POST /api/devices/:id/ota → облако
//  {"cmd":"ota"} либо LAN POST /ota через транспортный слой). Кнопка доступна
//  только когда устройство в сети и в режиме ожидания (IDLE) — настоящий гейт
//  всё равно на устройстве. Прогресс OTA прилетает в .../log и виден в журнале —
//  отдельного прогресс-бара нет.
// =============================================================================
import { useState } from "react";

import { Button, Card, useToast } from "@nb/ui";

export type FirmwareUpdateInfo = {
  version: string;
  notes: string;
};

export function DeviceFirmwareCard({
  deviceId,
  currentFw,
  update,
  canStart,
  disabledHint
}: {
  deviceId: string;
  currentFw: string | null;
  update: FirmwareUpdateInfo | null;
  /** true — устройство в сети и в IDLE (кнопку можно жать). */
  canStart: boolean;
  /** Почему кнопка недоступна (показывается только при update && !canStart). */
  disabledHint: string | null;
}) {
  const { show } = useToast();
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);

  const startUpdate = async () => {
    setStarting(true);
    try {
      const res = await fetch(`/api/devices/${deviceId}/ota`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        show({
          title: "Не удалось запустить обновление",
          description: json?.error ?? "Проверьте, что устройство в сети.",
          tone: "danger"
        });
        return;
      }
      setStarted(true);
      show({
        title: "Обновление запущено, устройство перезагрузится",
        description: "Ход обновления — в журнале устройства.",
        tone: "success"
      });
    } catch {
      show({ title: "Не удалось запустить обновление", tone: "danger" });
    } finally {
      setStarting(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Прошивка</p>
          <p className="mt-1 text-sm text-foreground">
            Версия: <span className="font-medium text-foreground">{currentFw ?? "—"}</span>
            {update ? (
              <>
                {" · "}доступно обновление{" "}
                <span className="font-medium text-foreground">{update.version}</span>
              </>
            ) : null}
          </p>
        </div>
        {update ? (
          <Button onClick={() => void startUpdate()} disabled={!canStart || starting || started}>
            {starting ? "Запуск…" : started ? "Обновление запущено" : "Обновить"}
          </Button>
        ) : null}
      </div>

      {update?.notes ? (
        <p className="mt-3 whitespace-pre-line border-t border-border pt-3 text-xs text-muted-foreground">
          {update.notes}
        </p>
      ) : null}

      {update && !canStart && !started && disabledHint ? (
        <p className="mt-2 text-xs text-muted-foreground">{disabledHint}</p>
      ) : null}
    </Card>
  );
}
