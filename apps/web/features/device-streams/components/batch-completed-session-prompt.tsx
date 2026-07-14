"use client";

// =============================================================================
//  features/device-streams/components/batch-completed-session-prompt.tsx
//  Мягкий промпт при завершении варки (§5 F2 «Завершение сеанса»): партия ушла
//  в «Завершена», а у неё остались активные сеансы ареометра — предлагаем
//  освободить устройство(-а). Решение (см. отчёт M2-C): НЕ встраиваем чекбокс в
//  общий ConfirmActionDialog завершения варки (он переиспользуется по всему
//  приложению, любое усложнение его API било бы по всем вызывающим), а
//  показываем отдельный маленький промпт ПОСЛЕ перехода — тот же
//  query-параметр-приём, что just-fermenting-prompt.tsx (appendQueryOnSuccess
//  на BrewTransitionButton). Тон — primary, не danger: завершение сеанса не
//  удаляет данные, это просто «отпустить устройство».
// =============================================================================
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button, Dialog, DialogFooter, useToast } from "@nb/ui";

import { endActiveSessionsForBatchAction, listActiveSessionsForBatchAction } from "@/features/device-streams/actions";
import type { FermentSessionDto } from "@/features/device-streams/contracts";

export function BatchCompletedSessionPrompt({ brewBatchId }: { brewBatchId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { show } = useToast();
  const flag = searchParams.get("just-completed");

  const [sessions, setSessions] = useState<FermentSessionDto[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const clearQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("just-completed");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!flag) return;
    let cancelled = false;
    void listActiveSessionsForBatchAction(brewBatchId).then((result) => {
      if (cancelled) return;
      const list = result.ok ? result.sessions : [];
      if (list.length === 0) {
        clearQuery();
        return;
      }
      setSessions(list);
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flag]);

  const dismiss = () => {
    setOpen(false);
    clearQuery();
  };

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    try {
      const result = await endActiveSessionsForBatchAction(brewBatchId, "batch_completed");
      if (!result.ok) {
        show({ title: result.message, tone: "danger" });
        return;
      }
      show({ title: "Сеанс ареометра завершён", tone: "success" });
      router.refresh();
      dismiss();
    } finally {
      setPending(false);
    }
  };

  if (!open) {
    return null;
  }

  const single = sessions.length === 1;
  const description = single
    ? `«${sessions[0]!.deviceName}» всё ещё пишет данные по этой партии. Завершить сеанс, чтобы освободить устройство для следующей варки?`
    : `${sessions.length} устройства всё ещё пишут данные по этой партии. Завершить сеансы, чтобы освободить их для следующей варки?`;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && dismiss()} title="Завершить сеанс ареометра?" size="sm">
      <div className="p-5 text-sm text-muted-foreground">{description}</div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={dismiss} disabled={pending}>
          Оставить активным
        </Button>
        <Button type="button" onClick={() => void confirm()} disabled={pending}>
          {pending ? "Завершаем…" : single ? "Завершить сеанс" : "Завершить сеансы"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
