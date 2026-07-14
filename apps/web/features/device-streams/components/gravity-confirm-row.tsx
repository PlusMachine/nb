"use client";

// =============================================================================
//  features/device-streams/components/gravity-confirm-row.tsx
//  «Записать OG/FG N с ареометра?» (§5 F4.4, M3-C) — строка-предложение в блоке
//  «Брожение». Значение уже посчитано на сервере (previewGravityFromCurve,
//  batch-ferment-block.tsx), это только кнопка подтверждения; автоматика сама
//  никогда не пишет (П2) — только по явному клику.
// =============================================================================
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button, useToast } from "@nb/ui";
import type { PreferredGravityUnit } from "@nb/auth";

import { confirmGravityFromCurveAction } from "@/features/device-streams/actions";
import { formatGravity } from "@/features/system/gravity-units";

const KIND_LABEL = { og: "OG", fg: "FG" } as const;

export function GravityConfirmRow({
  sessionId,
  kind,
  gravitySg,
  gravityUnit
}: {
  sessionId: string;
  kind: "og" | "fg";
  gravitySg: number;
  gravityUnit: PreferredGravityUnit;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending) return;
    setPending(true);
    try {
      const result = await confirmGravityFromCurveAction({ sessionId, kind });
      if (!result.ok) {
        show({ title: result.message, tone: "danger" });
        return;
      }
      show({ title: `${KIND_LABEL[kind]} записан: ${formatGravity(result.result.gravitySg, gravityUnit)}`, tone: "success" });
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
      <span className="text-foreground">
        Записать {KIND_LABEL[kind]} {formatGravity(gravitySg, gravityUnit)} с ареометра?
      </span>
      <Button type="button" variant="outline" size="sm" onClick={() => void submit()} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Записать
      </Button>
    </div>
  );
}
