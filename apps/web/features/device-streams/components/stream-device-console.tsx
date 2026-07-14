"use client";

// =============================================================================
//  features/device-streams/components/stream-device-console.tsx
//  Страница стрим-устройства (§5 F1, M1 — без графика, он в M2): шапка (имя, вид,
//  связь, батарея, RSSI), блок подключения (URL + инструкция), живая зона «Ждём
//  первый пакет…» → «Данные пошли», действия (переименовать/сменить вид,
//  перевыпустить URL, удалить). Клиентский оркестратор — получает уже собранные
//  сервером initialIngestUrl/initialStatus/initialDataCounts (stream-device-view.tsx),
//  сам только поллит /api/devices/[id]/stream-status, пока не пришла первая точка.
// =============================================================================
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button, Card, Dialog, DialogFooter, Input, Select, useToast } from "@nb/ui";
import type { PreferredGravityUnit } from "@nb/auth";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { pluralize } from "@/lib/pluralize";
import { fmtDeviceContactAgo } from "@/features/devices/connection";
import {
  renameStreamDeviceAction,
  rotateStreamTokenAction,
  setStreamDeviceKindAction,
  deleteStreamDeviceAction
} from "@/features/device-streams/actions";
import {
  streamHardwareKindLabels,
  streamWizardHardwareKinds,
  type StreamHardwareKind
} from "@/features/device-streams/contracts";
import { instructionForKind } from "@/features/device-streams/connect-instructions";
import { formatReadingSummary } from "@/features/device-streams/reading-summary";
import { DeviceFermentPanel, type DeviceSessionHistoryItem } from "@/features/device-streams/components/device-ferment-panel";
import type { FermentChartSession } from "@/features/device-streams/components/ferment-chart";

const STATUS_POLL_MS = 5000;
const TICK_MS = 5000;

type LatestReadingView = {
  ts: string;
  gravitySg: number | null;
  tempC: number | null;
  batteryV: number | null;
  batteryPct: number | null;
  rssi: number | null;
};

export type StreamDeviceStatusView = {
  lastSeenAt: string | null;
  latestReading: LatestReadingView | null;
  readingsCount: number;
  isStale: boolean;
};

type Props = {
  device: {
    id: string;
    name: string;
    hardwareKind: string | null;
  };
  initialIngestUrl: string | null;
  initialStatus: StreamDeviceStatusView;
  initialDataCounts: { readingsCount: number; sessionsCount: number };
  preferredGravityUnit: PreferredGravityUnit;
  /** График+история сеансов (§5 F3, M2-C) — уже собраны сервером (stream-device-view.tsx). */
  chartSessions: FermentChartSession[];
  sessionHistory: DeviceSessionHistoryItem[];
};

export function StreamDeviceConsole({
  device,
  initialIngestUrl,
  initialStatus,
  initialDataCounts,
  preferredGravityUnit,
  chartSessions,
  sessionHistory
}: Props) {
  const router = useRouter();
  const { show } = useToast();

  const [name, setNameState] = useState(device.name);
  const [hardwareKind, setHardwareKind] = useState<string | null>(device.hardwareKind);
  const [ingestUrl, setIngestUrl] = useState(initialIngestUrl);
  const [status, setStatus] = useState<StreamDeviceStatusView>(initialStatus);
  // Счётчики не меняются после первого рендера (нужны только для текста диалога
  // удаления) — сетер не нужен, но useState проще, чем протаскивать пропс напрямую
  // сквозь несколько уровней JSX ради одного места использования.
  const [dataCounts] = useState(initialDataCounts);
  const [celebrated, setCelebrated] = useState(false);
  // Для свежего устройства без единой точки блок подключения сразу раскрыт (§5 F1).
  const [urlExpanded, setUrlExpanded] = useState(() => initialStatus.readingsCount === 0);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState(device.name);
  const [renameKind, setRenameKind] = useState<StreamHardwareKind>((device.hardwareKind as StreamHardwareKind) ?? "other");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renamePending, startRename] = useTransition();

  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotatePending, startRotate] = useTransition();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDelete] = useTransition();

  // Тик «N назад» для статуса связи (М1: без SSE — та же схема, что грид плиток).
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // Д1: сразу после визарда сервер URL не может показать повторно (без ключа
  // шифрования decrypt(tokenEncrypted) → null, см. getStreamIngestUrl) — форма
  // подключения (connect-stream-device-form.tsx) кладёт свежий ingestUrl в
  // sessionStorage перед переходом сюда. Читаем один раз при монтировании и сразу
  // стираем запись — URL показывается один раз, как токен сессии.
  useEffect(() => {
    if (initialIngestUrl !== null) return;
    try {
      const key = `nb:stream-ingest-url:${device.id}`;
      const stored = window.sessionStorage.getItem(key);
      if (stored) {
        window.sessionStorage.removeItem(key);
        setIngestUrl(stored);
        setUrlExpanded(true);
      }
    } catch {
      // sessionStorage недоступен — остаётся фолбэк «Перевыпустить URL» ниже.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Живая зона: поллинг раз в 5 с, ПОКА не пришла первая точка (§5 F1). Как только
  // readingsCount становится > 0 — интервал больше не выставляется (early return).
  useEffect(() => {
    if (status.readingsCount > 0) return;
    let cancelled = false;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/devices/${device.id}/stream-status`, { cache: "no-store" });
          if (!res.ok || cancelled) return;
          const body = (await res.json()) as StreamDeviceStatusView;
          if (cancelled) return;
          if (body.readingsCount > 0) {
            setCelebrated(true);
          }
          setStatus(body);
        } catch {
          // тихо — попробуем на следующем тике
        }
      })();
    }, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [status.readingsCount, device.id]);

  const lastSeenAtMs = status.lastSeenAt ? Date.parse(status.lastSeenAt) : null;
  const ageMs = lastSeenAtMs !== null ? Math.max(0, nowMs - lastSeenAtMs) : null;
  const connectionText =
    lastSeenAtMs === null
      ? "нет данных"
      : status.isStale
        ? `нет связи ${fmtDeviceContactAgo(ageMs!).replace(/ назад$/, "")}`
        : fmtDeviceContactAgo(ageMs!);
  const connectionDotClass = lastSeenAtMs === null || status.isStale ? "bg-muted-foreground" : "bg-success";

  const kindLabel =
    hardwareKind && hardwareKind in streamHardwareKindLabels
      ? streamHardwareKindLabels[hardwareKind as StreamHardwareKind]
      : "Ареометр";
  const isTilt = hardwareKind === "tilt";

  const latest = status.latestReading;
  const batteryText =
    latest?.batteryV != null ? `${latest.batteryV.toFixed(1)} В` : latest?.batteryPct != null ? `${Math.round(latest.batteryPct)}%` : null;
  const rssiText = latest?.rssi != null ? `${latest.rssi} дБм` : null;

  const copyUrl = async () => {
    if (!ingestUrl) return;
    try {
      await navigator.clipboard.writeText(ingestUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // буфер обмена недоступен — URL уже показан текстом, скопируют вручную
    }
  };

  const openRename = () => {
    setRenameName(name);
    setRenameKind((hardwareKind as StreamHardwareKind) ?? "other");
    setRenameError(null);
    setRenameOpen(true);
  };

  const submitRename = () => {
    const trimmed = renameName.trim();
    if (!trimmed) {
      setRenameError("Введите название.");
      return;
    }
    setRenameError(null);
    startRename(async () => {
      const nameChanged = trimmed !== name;
      const kindChanged = renameKind !== hardwareKind;
      if (!nameChanged && !kindChanged) {
        setRenameOpen(false);
        return;
      }
      if (nameChanged) {
        const result = await renameStreamDeviceAction(device.id, trimmed);
        if (!result.ok) {
          setRenameError(result.message);
          return;
        }
        setNameState(result.name);
      }
      if (kindChanged) {
        const result = await setStreamDeviceKindAction(device.id, renameKind);
        if (!result.ok) {
          setRenameError(result.message);
          return;
        }
        setHardwareKind(result.kind);
      }
      setRenameOpen(false);
      show({ title: "Сохранено", tone: "success" });
    });
  };

  const submitRotate = () => {
    startRotate(async () => {
      const result = await rotateStreamTokenAction(device.id);
      if (!result.ok) {
        show({ title: result.message, tone: "danger" });
        return;
      }
      setIngestUrl(result.ingestUrl);
      setUrlExpanded(true);
      setCopied(false);
      setRotateOpen(false);
      show({ title: "URL перевыпущен. Старый больше не работает", tone: "success" });
    });
  };

  const submitDelete = () => {
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteStreamDeviceAction(device.id);
      if (!result.ok) {
        setDeleteError(result.message);
        return;
      }
      show({ title: `«${name}» удалено`, tone: "success" });
      router.push("/app/devices");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
          {name}
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>{kindLabel}</span>
          {isTilt ? (
            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              бета
            </span>
          ) : null}
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${connectionDotClass}`} aria-hidden />
            {connectionText}
          </span>
          {batteryText ? (
            <>
              <span aria-hidden>·</span>
              <span>{batteryText}</span>
            </>
          ) : null}
          {rssiText ? (
            <>
              <span aria-hidden>·</span>
              <span>{rssiText}</span>
            </>
          ) : null}
        </p>
      </header>

      {/* Живая зона: «Ждём первый пакет…» → «Данные пошли» → краткая строка последнего показания. */}
      <Card className="p-5">
        {status.readingsCount === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Ждём первый пакет…
          </div>
        ) : celebrated && latest ? (
          <div className="rounded-xl border border-success/30 bg-success-subtle p-4">
            <p className="text-sm font-semibold text-success-subtle-foreground">
              ✅ Данные пошли: {formatReadingSummary(latest, preferredGravityUnit)}
            </p>
          </div>
        ) : latest ? (
          <p className="text-sm text-foreground">{formatReadingSummary(latest, preferredGravityUnit)}</p>
        ) : null}
      </Card>

      {/* Брожение: график всех сеансов устройства + привязка к партии (§5 F2/F3, вход №3). */}
      <DeviceFermentPanel deviceId={device.id} gravityUnit={preferredGravityUnit} chartSessions={chartSessions} history={sessionHistory} />

      {/* Подключение: URL + инструкция. */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Подключение</h2>
          {!urlExpanded ? (
            <Button variant="outline" size="sm" onClick={() => setUrlExpanded(true)}>
              Показать URL
            </Button>
          ) : null}
        </div>

        {urlExpanded ? (
          ingestUrl ? (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all rounded-md bg-muted px-3 py-2 text-sm text-foreground">{ingestUrl}</code>
                <Button variant="outline" onClick={() => void copyUrl()}>
                  {copied ? "Скопировано" : "Скопировать"}
                </Button>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setInstructionsOpen((value) => !value)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {instructionsOpen ? "Скрыть инструкцию" : "Инструкция по подключению"}
                </button>
                {instructionsOpen ? (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{instructionForKind(hardwareKind)}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              URL показывается один раз. Перевыпустите, чтобы получить новый.{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-2"
                onClick={() => setRotateOpen(true)}
              >
                Перевыпустить URL
              </button>
            </p>
          )
        ) : null}
      </Card>

      {/* Действия. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={openRename}>
          Переименовать
        </Button>
        <Button variant="outline" onClick={() => setRotateOpen(true)}>
          Перевыпустить URL
        </Button>
        <Button variant="dangerOutline" onClick={() => setDeleteOpen(true)}>
          Удалить устройство
        </Button>
      </div>

      {/* Переименовать / сменить вид. */}
      <Dialog
        open={renameOpen}
        onOpenChange={(next) => {
          if (!next && !renamePending) {
            setRenameOpen(false);
            setRenameError(null);
          }
        }}
        title="Переименовать устройство"
        size="md"
      >
        <div className="space-y-3 p-5">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Название
            <Input value={renameName} onChange={(event) => setRenameName(event.target.value)} autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Вид устройства
            <Select value={renameKind} onChange={(event) => setRenameKind(event.target.value as StreamHardwareKind)}>
              {streamWizardHardwareKinds.map((option) => (
                <option key={option} value={option}>
                  {streamHardwareKindLabels[option]}
                </option>
              ))}
              {/* Текущий вид может быть RAPT-совместимым (создан не визардом) — не теряем его в списке. */}
              {hardwareKind && !streamWizardHardwareKinds.includes(hardwareKind as StreamHardwareKind) ? (
                <option value={hardwareKind}>
                  {streamHardwareKindLabels[hardwareKind as StreamHardwareKind] ?? hardwareKind}
                </option>
              ) : null}
            </Select>
          </label>
          {renameError ? (
            <p role="alert" className="text-xs text-destructive">
              {renameError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!renamePending) {
                setRenameOpen(false);
                setRenameError(null);
              }
            }}
            disabled={renamePending}
          >
            Отмена
          </Button>
          <Button type="button" onClick={submitRename} disabled={renamePending}>
            {renamePending ? "Сохраняем…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Перевыпустить URL. */}
      <ConfirmActionDialog
        open={rotateOpen}
        title="Перевыпустить URL?"
        description="Старый URL перестанет работать сразу — устройство, прошитое им, больше не сможет присылать данные, пока вы не пропишете новый."
        confirmLabel="Перевыпустить"
        pendingLabel="Перевыпускаем…"
        tone="danger"
        pending={rotatePending}
        onConfirm={submitRotate}
        onClose={() => {
          if (!rotatePending) setRotateOpen(false);
        }}
      />

      {/* Удалить устройство. */}
      <ConfirmActionDialog
        open={deleteOpen}
        title="Удалить устройство?"
        description={`«${name}» и все его данные будут удалены безвозвратно: ${dataCounts.readingsCount} ${pluralize(
          dataCounts.readingsCount,
          ["точка", "точки", "точек"]
        )}${
          dataCounts.sessionsCount > 0
            ? ` и ${dataCounts.sessionsCount} ${pluralize(dataCounts.sessionsCount, ["сеанс", "сеанса", "сеансов"])}`
            : ""
        }.`}
        confirmLabel="Удалить"
        pendingLabel="Удаляем…"
        tone="danger"
        pending={deletePending}
        error={deleteError}
        onConfirm={submitDelete}
        onClose={() => {
          if (!deletePending) {
            setDeleteOpen(false);
            setDeleteError(null);
          }
        }}
      />
    </div>
  );
}
