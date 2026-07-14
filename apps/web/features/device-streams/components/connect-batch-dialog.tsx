"use client";

// =============================================================================
//  features/device-streams/components/connect-batch-dialog.tsx
//  Диалог «выбрать партию (fermenting/brewing) → привязать ЭТО устройство»
//  (§5 F2, вход №3 «Карточка устройства»). Зеркалит connect-device-dialog.tsx
//  (та же ретро-привязка, тот же экшен createFermentSessionAction), но выбор —
//  наоборот: устройство фиксировано пропом, партия выбирается из свежего списка
//  (список партий может поменяться, пока карточка устройства открыта — грузим
//  его при каждом открытии диалога, а не пропом с первого рендера страницы).
// =============================================================================
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Dialog, DialogFooter, Select, useToast } from "@nb/ui";

import {
  createFermentSessionAction,
  listAttachableBrewBatchesAction,
  type AttachableBrewBatch
} from "@/features/device-streams/actions";

import { RetroAttachField } from "./retro-attach-field";

type Props = {
  open: boolean;
  deviceId: string;
  onClose: () => void;
  onAttached?: () => void;
};

export function ConnectBatchDialog({ open, deviceId, onClose, onAttached }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<AttachableBrewBatch[]>([]);
  const [brewBatchId, setBrewBatchId] = useState("");
  const [retroAttach, setRetroAttach] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setRetroAttach(true);
    let cancelled = false;
    void listAttachableBrewBatchesAction().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setBatches(result.batches);
        setBrewBatchId(result.batches[0]?.id ?? "");
      } else {
        setError(result.message);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const submit = async () => {
    if (!brewBatchId || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await createFermentSessionAction({ deviceId, brewBatchId, retroAttach });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      show({ title: "Устройство привязано к партии", tone: "success" });
      router.refresh();
      if (onAttached) {
        onAttached();
      } else {
        onClose();
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()} title="Привязать к партии" size="sm">
      <div className="space-y-3 p-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Загружаем партии…</p>
        ) : batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Нет партий в статусе «Варка» или «Брожение» — сначала начните варку.
          </p>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Партия
              <Select value={brewBatchId} onChange={(event) => setBrewBatchId(event.target.value)}>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.name}
                  </option>
                ))}
              </Select>
            </label>
            {brewBatchId ? <RetroAttachField deviceId={deviceId} checked={retroAttach} onCheckedChange={setRetroAttach} /> : null}
          </>
        )}

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Отмена
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={pending || !brewBatchId || loading}>
          {pending ? "Привязываем…" : "Привязать"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
