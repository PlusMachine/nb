"use client";

import { useState } from "react";
import { useBrewDayProgress, type BrewDayProgressController } from "../components/use-brew-day-progress";
import type { BrewDayProgress } from "../contracts";
import { useOfflineBrew } from "./context";

export function useBrewProgress(batchId: string, initial: BrewDayProgress, ownerId?: string): BrewDayProgressController {
  const offline = useOfflineBrew(batchId);
  const [error, setError] = useState<string | null>(null);
  const legacy = useBrewDayProgress(batchId, initial, offline ? undefined : ownerId);
  if (!offline?.snapshot) return legacy;
  return {
    progress: offline.snapshot.progress,
    pending: legacy.pending,
    now: legacy.now,
    error,
    queuedCount: offline.record?.queue.length ?? 0,
    offline: offline.network === "offline",
    retry: offline.retry,
    patchStep: async (stepId, { transfer, ...patch }) => {
      const result = await offline.save(transfer ? { kind: "transfer", input: transfer } : { kind: "step", stepId, patch });
      setError(result.ok ? null : result.message);
      return result.ok;
    }
  };
}
