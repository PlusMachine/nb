"use client";

// =============================================================================
//  AlarmsPanel — управление авариями по мотивам ISA-18.2:
//   - приоритет по риску (critical/high/medium), баннер активных сверху;
//   - текст «что + что делать» (не голый код бита);
//   - acknowledge (локально — «увидел») + Сбросить аварии (CLEAR_FAULT, fail-safe);
//   - журнал по ФРОНТАМ (raised/cleared) — дедуп/анти-дребезг латчащихся аварий.
//
//  Авторитет — faultMask устройства (decodeFaults). Нагрев на плате блокируют
//  интерлоки §5; портал лишь показывает и предлагает сброс.
// =============================================================================
import { useEffect, useRef, useState } from "react";
import { AlertOctagon, AlertTriangle, Check } from "lucide-react";

import { FAULT_BITS, type Fault } from "@nb/brewforge-protocol";
import { Button } from "@nb/ui";

import { FAULT_META, sortActiveFaults, type FaultPriority } from "@/features/brew-controller/faults";

const PRIORITY_STYLE: Record<FaultPriority, { box: string; chip: string; label: string }> = {
  critical: { box: "border-red-300 bg-red-50", chip: "bg-red-600 text-white", label: "критично" },
  high: { box: "border-amber-300 bg-amber-50", chip: "bg-amber-500 text-white", label: "важно" },
  medium: { box: "border-yellow-200 bg-yellow-50", chip: "bg-yellow-400 text-yellow-950", label: "внимание" },
};

type LogEntry = { fault: Fault; kind: "raised" | "cleared"; at: number };

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

type Props = {
  faultMask: number;
  hasDevice: boolean;
  onClear: () => void;
  /** CLEAR_FAULT недоступен (нет связи и т.п.). Сам гейт — на сервере (fail-safe). */
  clearDisabled?: boolean;
};

export function AlarmsPanel({ faultMask, hasDevice, onClear, clearDisabled }: Props) {
  const active = sortActiveFaults(faultMask);

  // Локальный acknowledge — сбрасывается, когда авария уходит (по имени бита).
  const [acked, setAcked] = useState<Set<Fault>>(new Set());
  const [log, setLog] = useState<LogEntry[]>([]);
  const prevMask = useRef(0);

  // Журнал по фронтам: пишем событие лишь при появлении/исчезновении бита (анти-дребезг),
  // а не на каждый кадр телеметрии. Ack снимаем с исчезнувших аварий.
  useEffect(() => {
    const prev = prevMask.current;
    if (faultMask === prev) return;
    prevMask.current = faultMask;

    const events: LogEntry[] = [];
    const removed: Fault[] = [];
    for (const name of Object.keys(FAULT_BITS) as Fault[]) {
      const bit = FAULT_BITS[name];
      const was = (prev & bit) !== 0;
      const now = (faultMask & bit) !== 0;
      if (!was && now) events.push({ fault: name, kind: "raised", at: Date.now() });
      else if (was && !now) {
        events.push({ fault: name, kind: "cleared", at: Date.now() });
        removed.push(name);
      }
    }
    if (events.length > 0) setLog((l) => [...events.reverse(), ...l].slice(0, 50));
    if (removed.length > 0) {
      setAcked((s) => {
        const next = new Set(s);
        for (const f of removed) next.delete(f);
        return next;
      });
    }
  }, [faultMask]);

  if (!hasDevice) return null;

  const hasActive = active.length > 0;

  // Баннер-только (§4/§6): нет активных и пустой журнал → ничего не рисуем.
  if (!hasActive && log.length === 0) return null;

  // Журнал аварий (свёрнут) — общий для обоих состояний.
  const journal =
    log.length > 0 ? (
      <details className={hasActive ? "mt-3" : ""}>
        <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-700">
          Журнал аварий ({log.length})
        </summary>
        <ul className="mt-2 space-y-1 text-xs text-zinc-500">
          {log.map((e, i) => (
            <li key={`${e.fault}-${e.at}-${i}`} className="flex items-center gap-2">
              <span className="tabular-nums text-zinc-400">{fmtTime(e.at)}</span>
              <span className={e.kind === "raised" ? "text-red-600" : "text-emerald-600"}>
                {e.kind === "raised" ? "возникла" : "снята"}
              </span>
              <span className="font-medium text-zinc-700">{FAULT_META[e.fault].title}</span>
            </li>
          ))}
        </ul>
      </details>
    ) : null;

  // Нет активных — только компактный журнал (без коробки-баннера).
  if (!hasActive) {
    return <section className="rounded-xl border border-zinc-200 bg-white px-4 py-2 shadow-sm">{journal}</section>;
  }

  // Есть активные — полный баннер приоритета «что + что делать».
  return (
    <section className={`rounded-2xl border-2 p-5 shadow-sm ${PRIORITY_STYLE[FAULT_META[active[0]].priority].box}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <AlertOctagon className="h-4 w-4 text-red-600" aria-hidden />
          Аварии
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">{active.length}</span>
        </p>
        <Button variant="default" size="sm" onClick={onClear} disabled={clearDisabled}>
          Сбросить аварии
        </Button>
      </div>

      <ul className="mt-3 space-y-2">
        {active.map((f) => {
          const meta = FAULT_META[f];
          const style = PRIORITY_STYLE[meta.priority];
          const isAcked = acked.has(f);
          return (
            <li key={f} className={`rounded-xl border bg-white/70 p-3 ${isAcked ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${style.chip}`}>{style.label}</span>
                <span className="text-sm font-semibold text-zinc-900">{meta.title}</span>
                <span className="text-[11px] text-zinc-400">{f}</span>
                {isAcked ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <Check className="h-3.5 w-3.5" aria-hidden /> подтверждено
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setAcked((s) => new Set(s).add(f))}
                  >
                    Подтвердить
                  </Button>
                )}
              </div>
              <p className="mt-1 text-sm text-zinc-600">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-500" aria-hidden />
                {meta.cause} <span className="font-medium text-zinc-800">{meta.action}</span>
              </p>
            </li>
          );
        })}
      </ul>

      {journal}
    </section>
  );
}
