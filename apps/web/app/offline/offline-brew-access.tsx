"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@nb/ui";

import { brewBatchStatusLabels } from "@/features/brew-batches/contracts";
import { OFFLINE_BREW_VERSION, supportsOfflineBrew } from "@/features/brew-batches/offline/model";
import { OfflineBrewPendingSync } from "@/features/brew-batches/offline/pending-sync";
import { OfflineBrewSession } from "@/features/brew-batches/offline/session";
import { listOfflineBrews, offlineBrewOwner, type OfflineBrewRecord } from "@/features/brew-batches/offline/storage";

export function OfflineBrewAccess({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<OfflineBrewRecord[]>([]);
  const [selected, setSelected] = useState<OfflineBrewRecord>();
  const [showList, setShowList] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let mounted = true;
    const owner = offlineBrewOwner();
    const path = window.location.pathname.replace(/\/$/, "");
    const requested = /^\/app\/brew-batches\/([^/]+)$/.exec(path)?.[1];
    if (!owner) {
      setMissing(Boolean(requested));
      return;
    }
    void listOfflineBrews(owner).then(records => {
      if (!mounted || offlineBrewOwner() !== owner) return;
      const accessible = records.filter(record => record.snapshot.version === OFFLINE_BREW_VERSION && (supportsOfflineBrew(record.snapshot) || record.queue.length))
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      setSaved(accessible);
      if (requested) {
        const match = accessible.find(record => record.batchId === requested);
        setSelected(match);
        setMissing(!match);
      }
      setShowList(accessible.length > 0 && (path === "/app" || path === "/app/brew-batches" || path === "/offline"));
    }).catch(() => { if (mounted) setMissing(Boolean(requested)); });
    return () => { mounted = false; };
  }, []);

  if (selected || showList) return <main className="mx-auto min-h-screen max-w-3xl space-y-5 bg-background px-4 py-6 text-foreground">
    {saved[0] ? <OfflineBrewPendingSync ownerId={saved[0].ownerId} activeBatchId={selected?.batchId ?? null} /> : null}
    {selected ? <>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => { setSelected(undefined); setShowList(true); }}>Сохранённые варки</Button>
        <a className="text-sm text-primary underline" href={`/app/brew-batches/${selected.batchId}`}>Открыть онлайн</a>
      </div>
      <OfflineBrewSession key={`${selected.ownerId}:${selected.batchId}`} ownerId={selected.ownerId} batchId={selected.batchId} />
    </> : <>
      <h1 className="text-2xl font-semibold">Сохранённые варки</h1>
      <ul className="space-y-2">{saved.map(record => <li key={record.batchId}>
        <button type="button" className="w-full rounded-xl border border-border bg-card p-4 text-left" onClick={() => setSelected(record)}>
          <span className="block break-words font-medium">{record.snapshot.title}</span>
          <span className="text-sm text-muted-foreground">{brewBatchStatusLabels[record.snapshot.status]}</span>
        </button>
      </li>)}</ul>
      <Button type="button" variant="ghost" size="sm" onClick={() => setShowList(false)}>Другие действия без сети</Button>
    </>}
  </main>;

  return <>
    {missing || saved.length > 0 ? <div className="space-y-2 border-b border-border bg-card p-4 text-center text-sm">
      {missing ? <p>Чтобы открыть эту партию без сети, сначала откройте её с интернетом и дождитесь сохранения.</p> : null}
      {saved.length > 0 ? <Button type="button" variant="outline" size="sm" onClick={() => setShowList(true)}>Сохранённые варки</Button> : null}
    </div> : null}
    {children}
  </>;
}
