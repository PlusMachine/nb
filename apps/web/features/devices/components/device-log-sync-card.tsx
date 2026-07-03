"use client";

// =============================================================================
//  features/devices/components/device-log-sync-card.tsx
//  Ручная синхронизация офлайн-журнала варки с устройства (P3, пакет 4-B).
//  Минимальный полезный путь: кнопка тянет GET /log[?name=] по LAN, разбирает
//  .jsonl и заливает НОВЫЕ строки в brew_telemetry/brew_log_events —
//  историю офлайн-варки (или варки, шедшей при потерянной связи) становится
//  видно на графике устройства (getDeviceHistory уже читает brew_telemetry по
//  deviceId). LAN-only (см. log-sync.ts) — на облачных/демо-устройствах кнопка
//  покажет понятную ошибку, а не молчаливый провал.
// =============================================================================
import { useState } from "react";

import { Button, Card, useToast } from "@nb/ui";

import { syncDeviceLogAction } from "@/features/devices/actions";
import type { LogSyncSummary } from "@/features/devices/log-sync";

const ERROR_TEXT: Record<string, string> = {
  NOT_FOUND: "Устройство не найдено",
  LOG_SYNC_UNSUPPORTED: "Синхронизация журнала доступна только для устройств в локальной сети (LAN)",
  INTERNAL_ERROR: "Внутренняя ошибка. Попробуйте позже"
};

const errText = (code: string | undefined): string => (code && ERROR_TEXT[code]) || "Не удалось синхронизировать журнал";

export function DeviceLogSyncCard({ deviceId }: { deviceId: string }) {
  const { show } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [lastSummary, setLastSummary] = useState<LogSyncSummary | null>(null);

  const runSync = async () => {
    setSyncing(true);
    try {
      const summary = await syncDeviceLogAction({ deviceId });
      setLastSummary(summary);
      const importedSamples = summary.files.reduce((sum, f) => sum + f.samplesImported, 0);
      if (summary.filesImported === 0 && summary.filesOnDevice === 0) {
        show({ title: "На устройстве нет сохранённых журналов варки", tone: "default" });
      } else if (summary.filesImported === 0) {
        show({ title: "Журнал уже синхронизирован", description: "Новых записей не найдено.", tone: "default" });
      } else {
        show({
          title: "Журнал синхронизирован",
          description: `Догружено файлов: ${summary.filesImported}, точек: ${importedSamples}.`,
          tone: "success"
        });
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      show({ title: "Не удалось синхронизировать журнал", description: errText(code), tone: "danger" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Офлайн-журнал варки</p>
          <p className="mt-1 text-xs text-zinc-500">
            Устройство ведёт полный журнал варки локально (SPIFFS), даже без сети. Синхронизируйте
            его сюда, чтобы офлайн-варки тоже появились в истории.
          </p>
        </div>
        <Button variant="outline" onClick={() => void runSync()} disabled={syncing}>
          {syncing ? "Синхронизация…" : "Синхронизировать журнал"}
        </Button>
      </div>

      {lastSummary ? (
        <p className="mt-3 text-xs text-zinc-500">
          На устройстве: {lastSummary.filesOnDevice} · Догружено: {lastSummary.filesImported} · Уже
          было: {lastSummary.filesSkipped}
          {lastSummary.filesFailed > 0 ? ` · Ошибок: ${lastSummary.filesFailed}` : ""}
        </p>
      ) : null}
    </Card>
  );
}
