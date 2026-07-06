"use client";

import React from "react";
import { FileText, Timer } from "lucide-react";

import { Button } from "@nb/ui";

export function RecipeActionsMenu({
  pending,
  onOpenImportExport,
  onOpenBrew
}: {
  pending: boolean;
  onOpenImportExport: () => void;
  onOpenBrew: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="md"
        onClick={onOpenImportExport}
        disabled={pending}
      >
        <FileText className="h-4 w-4 text-muted-foreground" />
        Импорт / экспорт
      </Button>
      <Button
        type="button"
        size="md"
        onClick={onOpenBrew}
        disabled={pending}
      >
        <Timer className="h-4 w-4" />
        Сварить
      </Button>
    </div>
  );
}
