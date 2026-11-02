"use client";

import { useState } from "react";
import { Button } from "@nb/ui";
import type { BrewBatchListItem } from "../contracts";
import { BatchComparisonDialog } from "./batch-comparison";
import { BrewBatchListRow } from "./brew-batch-list-row";

export function BatchList({ batches }: { batches: BrewBatchListItem[] }) {
  const [selected, setSelected] = useState<string[]>([]), [open, setOpen] = useState(false);
  const ids = selected.filter(id => batches.some(b => b.id === id));
  return <>
    {ids.length ? <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"><span role="status" className="text-sm">Выбрано: {ids.length} из 2</span><Button type="button" size="sm" disabled={ids.length !== 2} onClick={() => setOpen(true)}>Сравнить</Button><Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>Сбросить выбор</Button></div> : null}
    <ul className="space-y-2">{batches.map(batch => <BrewBatchListRow key={batch.id} batch={batch} selection={{ checked: ids.includes(batch.id), disabled: ids.length === 2 && !ids.includes(batch.id), onChange: checked => setSelected(old => checked ? [...old.filter(id => id !== batch.id), batch.id].slice(0, 2) : old.filter(id => id !== batch.id)) }} />)}</ul>
    <BatchComparisonDialog open={open} onOpenChange={setOpen} ids={ids} />
  </>;
}
