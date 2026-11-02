"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Dialog, DialogCloseButton, DialogFooter, DialogHeader } from "@nb/ui";
import { compareBatchesAction, listComparisonCandidatesAction } from "@/app/(app)/app/brew-batches/comparison-actions";
import { formatBrewBatchDisplayTitle } from "../contracts";
import type { BatchComparison } from "../comparison";

type Candidate = { id: string; name: string; brewNumber: number };
export function BatchComparisonDialog({ open, onOpenChange, ids, sourceId }: { open: boolean; onOpenChange: (open: boolean) => void; ids?: string[]; sourceId?: string }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]), [second, setSecond] = useState("");
  const [comparison, setComparison] = useState<BatchComparison | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const revision = useRef(0), comparing = useRef(false);
  const idsKey = ids?.join(",");
  useEffect(() => {
    ++revision.current; comparing.current = false;
    if (!open) return;
    let active = true; setComparison(null); setError(""); setBusy(true); setCandidates([]); setSecond("");
    if (sourceId) {
      listComparisonCandidatesAction().then(list => { if (!active) return; const rest = list.filter(b => b.id !== sourceId); setCandidates(rest); setSecond(rest[0]?.id ?? ""); }).catch(() => { if (active) setError("Не удалось загрузить список партий."); }).finally(() => { if (active) setBusy(false); });
    } else if (ids?.length === 2) {
      compareBatchesAction(ids).then(result => { if (active) { if (result.ok) setComparison(result.comparison); else setError(result.message); } }).catch(() => { if (active) setError("Не удалось сравнить партии."); }).finally(() => { if (active) setBusy(false); });
    } else setBusy(false);
    return () => { active = false; ++revision.current; };
  }, [open, sourceId, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Dialog open={open} onOpenChange={onOpenChange} title="Сравнение партий" hideTitle size="lg">
    <DialogHeader><h2 className="text-base font-semibold">Сравнение партий</h2><DialogCloseButton /></DialogHeader>
    <div className="space-y-4 p-4 sm:p-5" aria-busy={busy}>
      {busy ? <p role="status" className="text-sm text-muted-foreground">Загрузка…</p> : null}
      {sourceId && !comparison && !busy ? candidates.length ? <form className="space-y-3" onSubmit={async e => {
        e.preventDefault(); if (comparing.current || busy || !second) return;
        comparing.current = true; const token = revision.current; setBusy(true); setError("");
        try { const result = await compareBatchesAction([sourceId, second]); if (token !== revision.current) return; if (result.ok) setComparison(result.comparison); else setError(result.message); }
        catch { if (token === revision.current) setError("Не удалось сравнить партии."); } finally { if (token === revision.current) { comparing.current = false; setBusy(false); } }
      }}><label className="block text-sm">С чем сравнить<select className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-base text-foreground sm:text-sm" value={second} onChange={e => setSecond(e.target.value)}>{candidates.map(b => <option key={b.id} value={b.id}>{formatBrewBatchDisplayTitle(b.name, b.brewNumber)}</option>)}</select></label><Button type="submit" disabled={!second}>Сравнить</Button></form> : <p className="text-sm text-muted-foreground">Для сравнения нужна ещё одна партия.</p> : null}
      {comparison ? <>
        {sourceId ? <Button type="button" variant="ghost" size="sm" onClick={() => { setComparison(null); setError(""); }}>Выбрать другую партию</Button> : null}
        <div className="overflow-x-auto"><table className="w-full table-fixed text-left text-xs sm:text-sm"><thead><tr><th className="w-1/3 py-3 pr-2 font-normal text-muted-foreground">Параметр</th>{comparison.titles.map((title, i) => <th key={comparison.ids[i]} className="px-2 py-3 align-top font-medium"><Link className="break-words hover:underline" href={`/app/brew-batches/${comparison.ids[i]}`} onClick={() => onOpenChange(false)}>{title}</Link></th>)}</tr></thead><tbody>{comparison.rows.map(row => <tr key={row.label} className={`border-t border-border ${row.changed ? "bg-success-subtle/40" : ""}`}><th scope="row" className="break-words py-3 pr-2 align-top font-normal text-muted-foreground">{row.label}</th>{row.values.map((value, i) => <td key={i} className="break-words px-2 py-3 align-top tabular-nums">{value}</td>)}</tr>)}</tbody></table></div>
      </> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
    <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Закрыть</Button></DialogFooter>
  </Dialog>;
}
