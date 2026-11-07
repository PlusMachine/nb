"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { useOfflineBrewStore } from "./context";
import { listOfflineBrews, OFFLINE_BREW_CHANNEL, offlineBrewOwner } from "./storage";

function PendingBatch({ ownerId, batchId }: { ownerId: string; batchId: string }) {
  useOfflineBrewStore(ownerId, batchId);
  return null;
}

// Replay saved changes even when the user returns to the list instead of
// opening the brew again. The visible brew already has its own sender.
export function OfflineBrewPendingSync({ ownerId, activeBatchId }: { ownerId: string; activeBatchId?: string | null }) {
  const pathname = usePathname();
  const visible = activeBatchId === undefined ? /^\/app\/brew-batches\/([^/]+)\/?$/.exec(pathname)?.[1] : activeBatchId;
  const [pending, setPending] = useState<string>();

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (offlineBrewOwner() !== ownerId) return;
      void listOfflineBrews(ownerId).then(records => {
        if (!active || offlineBrewOwner() !== ownerId) return;
        setPending(records.find(record => record.queue.length && !record.block && record.batchId !== visible)?.batchId);
      }).catch(() => {});
    };
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(OFFLINE_BREW_CHANNEL);
    if (channel) channel.onmessage = event => { if (event.data?.ownerId === ownerId) refresh(); };
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      channel?.close();
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [ownerId, visible]);

  return pending && pending !== visible ? <PendingBatch key={`${ownerId}:${pending}`} ownerId={ownerId} batchId={pending} /> : null;
}
