"use client";

// =============================================================================
//  features/device-streams/components/session-bounds-control.tsx
//  «Изменить границы» (§5 F4.3, M3-C): маленькая кнопка + Dialog с двумя
//  datetime-local (паттерн — brew-journal.tsx: naive local time, конвертация в
//  абсолютный момент через `new Date(value).toISOString()` на сабмите — иначе
//  сервер распарсит наивное значение в своей TZ, не в TZ браузера). Конец можно
//  оставить пустым только у ещё не начатого поля — очистить УЖЕ заданный конец
//  (снова открыть завершённый сеанс) контракт updateSessionBoundsSchema не
//  поддерживает (endedAt: Date | undefined — «не менять», не «снять»), поэтому
//  пустое поле здесь означает «не трогать», а не «убрать».
// =============================================================================
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Dialog, DialogFooter, useToast } from "@nb/ui";

import { updateSessionBoundsAction } from "@/features/device-streams/actions";
import { pluralize } from "@/lib/pluralize";

const pad = (n: number): string => String(n).padStart(2, "0");

/** Эпоха (мс) → значение <input type="datetime-local"> в ЛОКАЛЬНОМ времени браузера. */
function toLocalInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SessionBoundsControl({
  sessionId,
  startedAt,
  endedAt
}: {
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [startValue, setStartValue] = useState("");
  const [endValue, setEndValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDialog = () => {
    setStartValue(toLocalInputValue(startedAt));
    setEndValue(endedAt !== null ? toLocalInputValue(endedAt) : "");
    setError(null);
    setOpen(true);
  };

  const submit = async () => {
    if (pending || !startValue) return;
    setPending(true);
    setError(null);
    try {
      const input: { startedAt?: Date; endedAt?: Date } = { startedAt: new Date(startValue) };
      if (endValue) {
        input.endedAt = new Date(endValue);
      }
      const result = await updateSessionBoundsAction(sessionId, input);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const detached = result.result.detachedReadingsCount;
      show({
        title: detached > 0 ? `Отвязано ${detached} ${pluralize(detached, ["точка", "точки", "точек"])}` : "Границы сеанса обновлены",
        tone: "success"
      });
      router.refresh();
      setOpen(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={openDialog}>
        Изменить границы
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !pending) setOpen(false);
        }}
        title="Границы сеанса"
        size="sm"
      >
        <div className="space-y-3 p-5">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Начало
            <input
              type="datetime-local"
              value={startValue}
              onChange={(event) => setStartValue(event.target.value)}
              disabled={pending}
              className="h-10 rounded-md border border-border bg-card px-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Конец {endedAt === null ? "(оставьте пустым — сеанс активен)" : ""}
            <input
              type="datetime-local"
              value={endValue}
              onChange={(event) => setEndValue(event.target.value)}
              disabled={pending}
              className="h-10 rounded-md border border-border bg-card px-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
            />
          </label>
          <p className="text-xs leading-5 text-muted-foreground">
            Точки за пределами новых границ будут отвязаны от сеанса (не удалены).
          </p>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Отмена
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={pending || !startValue}>
            {pending ? "Сохраняем…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
