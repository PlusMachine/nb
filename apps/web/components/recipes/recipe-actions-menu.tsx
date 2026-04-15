"use client";

import React from "react";
import { FileText, Timer } from "lucide-react";

export function RecipeActionsMenu({
  pending,
  onOpenImportExport,
  onOpenStartBrew
}: {
  pending: boolean;
  onOpenImportExport: () => void;
  onOpenStartBrew: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <button
        type="button"
        onClick={onOpenImportExport}
        disabled={pending}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-60"
      >
        <FileText className="h-4 w-4 text-zinc-400" />
        Импорт / экспорт
      </button>
      <button
        type="button"
        onClick={onOpenStartBrew}
        disabled={pending}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-900 bg-zinc-900 px-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60"
      >
        <Timer className="h-4 w-4" />
        Начать варку
      </button>
    </div>
  );
}
