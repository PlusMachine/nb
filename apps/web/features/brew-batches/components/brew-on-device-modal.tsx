"use client";

// =============================================================================
//  features/brew-batches/components/brew-on-device-modal.tsx
//  «Варить на устройстве» — выбор привязанного контроллера BrewForge, привязка
//  нового устройства (claim-код + опц. localUrl) и запуск варки на железе.
//  Поток: выбрать устройство → подтвердить (включает нагрев) → создать партию
//  (ensureBrewBatch) → startBrewOnDeviceAction (push рецепта + статус 'brewing')
//  → переход на живой дашборд партии. Несекретно: токен устройства сюда не попадает,
//  кроме одноразового plaintext-токена сразу после привязки (его показываем юзеру,
//  чтобы прошить в устройство, и нигде не сохраняем).
// =============================================================================

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Cpu, Loader2, Plus, RefreshCw, ShieldAlert, X } from "lucide-react";

import { startBrewOnDeviceAction } from "@/features/brew-controller/actions";

/** Клиентская проекция DeviceDto: после JSON даты приходят строками, поэтому
 *  берём только нужные поля без zod-Date-схемы. */
type PairedDevice = {
  id: string;
  name: string;
  hardwareId: string;
  status: "online" | "offline" | "unknown";
  localUrl: string | null;
  fw: string | null;
};

export type EnsureBrewBatchResult = { ok: boolean; brewBatchId: string | null; message: string };

type View = "pick" | "pair" | "confirm";

const STATUS_LABEL: Record<PairedDevice["status"], string> = {
  online: "В сети",
  offline: "Не в сети",
  unknown: "Статус неизвестен"
};

const STATUS_DOT: Record<PairedDevice["status"], string> = {
  online: "bg-emerald-500",
  offline: "bg-zinc-300",
  unknown: "bg-amber-400"
};

/** Коды ошибок привязки (из features/devices/service.ts) → сообщения для UI. */
function translatePairError(code?: string): string {
  switch (code) {
    case "CLAIM_CODE_OR_HARDWARE_ID_REQUIRED":
      return "Укажите claim-код устройства (его показывает дисплей/точка доступа BrewForge).";
    case "INVALID_CLAIM_CODE":
      return "Код привязки неверен или истёк. Сгенерируйте новый на устройстве.";
    case "CLAIM_CODE_OWNED_BY_OTHER_USER":
    case "DEVICE_OWNED_BY_OTHER_USER":
      return "Это устройство уже привязано к другому аккаунту.";
    case "HARDWARE_ID_REQUIRED":
      return "Для прямой привязки укажите hardware ID устройства.";
    case "CLAIM_CODE_REQUIRED":
      return "Введите claim-код устройства — привязка по одному hardware ID отключена.";
    case "CLAIM_CODE_ALREADY_CONSUMED":
      return "Код привязки уже использован. Сгенерируйте новый на устройстве.";
    default:
      return "Не удалось привязать устройство. Проверьте код и адрес.";
  }
}

export function BrewOnDeviceModal({
  open,
  pending,
  ensureBrewBatch,
  onClose
}: {
  open: boolean;
  /** Идёт сохранение/создание партии на стороне мастера рецептов. */
  pending: boolean;
  /** Сохранить рецепт и создать (или вернуть) партию варки. Логика — в родителе. */
  ensureBrewBatch: () => Promise<EnsureBrewBatchResult>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("pick");
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState("");
  const [pairLocalUrl, setPairLocalUrl] = useState("");
  const [pairName, setPairName] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/devices", { cache: "no-store" });
      if (!res.ok) throw new Error("LIST_FAILED");
      const data = (await res.json()) as { devices?: PairedDevice[] };
      const list = data.devices ?? [];
      setDevices(list);
      setSelectedDeviceId(
        (prev) => prev ?? list.find((device) => device.status === "online")?.id ?? list[0]?.id ?? null
      );
      if (list.length === 0) setView("pair");
    } catch {
      setLoadError("Не удалось загрузить список устройств.");
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  // Сброс состояния и загрузка устройств при открытии.
  useEffect(() => {
    if (!open) return;
    setView("pick");
    setStartError(null);
    setPairError(null);
    setIssuedToken(null);
    void loadDevices();
  }, [open, loadDevices]);

  const busy = pending || starting || pairing;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;

  const handlePair = async () => {
    setPairError(null);
    setPairing(true);
    try {
      const body: Record<string, string> = {};
      if (pairCode.trim()) body.claimCode = pairCode.trim();
      if (pairLocalUrl.trim()) body.localUrl = pairLocalUrl.trim();
      if (pairName.trim()) body.name = pairName.trim();
      const res = await fetch("/api/devices/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await res.json()) as { device?: { id: string }; token?: string; error?: string };
      if (!res.ok || !data.device) {
        setPairError(translatePairError(data.error));
        return;
      }
      // Plaintext-токен показываем один раз — его нужно прошить в устройство.
      setIssuedToken(data.token ?? null);
      await loadDevices();
      setSelectedDeviceId(data.device.id);
      setView("pick");
    } catch {
      setPairError("Не удалось привязать устройство. Проверьте код и адрес.");
    } finally {
      setPairing(false);
    }
  };

  const handleStart = async () => {
    if (!selectedDeviceId) return;
    setStartError(null);
    setStarting(true);
    try {
      const ensured = await ensureBrewBatch();
      if (!ensured.ok || !ensured.brewBatchId) {
        setStartError(ensured.message || "Не удалось подготовить партию варки.");
        setView("pick");
        return;
      }
      const result = await startBrewOnDeviceAction({
        brewBatchId: ensured.brewBatchId,
        deviceId: selectedDeviceId
      });
      if (!result.ok) {
        setStartError(result.message);
        setView("pick");
        return;
      }
      // Уходим на живой дашборд партии — нагрев на устройстве уже запущен.
      router.push(`/app/brew-batches/${ensured.brewBatchId}`);
    } catch {
      setStartError("Не удалось запустить варку на устройстве.");
      setView("pick");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Варить на устройстве"
      onClick={() => !busy && onClose()}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-950">Варить на устройстве</h3>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                Рецепт будет отправлен на контроллер BrewForge, который запустит варку.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {issuedToken ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950" role="status">
              <p className="font-semibold">Устройство привязано.</p>
              <p className="mt-1 text-xs leading-5 text-emerald-800">
                Сохраните токен и пропишите его в устройстве — он показывается один раз и нигде не хранится в открытом виде.
              </p>
              <code className="mt-2 block break-all rounded-md border border-emerald-200 bg-white px-2 py-1.5 font-mono text-xs text-emerald-900">
                {issuedToken}
              </code>
            </div>
          ) : null}

          {view === "pick" ? (
            <div className="space-y-3">
              {startError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900" role="alert">
                  {startError}
                </div>
              ) : null}

              {loadingDevices ? (
                <div className="flex items-center gap-2 px-1 py-6 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Загрузка устройств…
                </div>
              ) : loadError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900">
                  <p>{loadError}</p>
                  <button
                    type="button"
                    onClick={() => void loadDevices()}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-800"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Повторить
                  </button>
                </div>
              ) : devices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-6 text-center">
                  <p className="text-sm font-medium text-zinc-700">Нет привязанных устройств</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Привяжите контроллер BrewForge по claim-коду, чтобы варить на железе.
                  </p>
                  <button
                    type="button"
                    onClick={() => setView("pair")}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Привязать устройство
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Выберите устройство</p>
                  <div className="space-y-2">
                    {devices.map((device) => {
                      const active = device.id === selectedDeviceId;
                      return (
                        <label
                          key={device.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 ${active ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white"}`}
                        >
                          <input
                            type="radio"
                            name="brew-device"
                            checked={active}
                            onChange={() => setSelectedDeviceId(device.id)}
                            className="mt-1"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-zinc-900">{device.name}</span>
                              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[device.status]}`} aria-hidden />
                              <span className="text-[11px] text-zinc-500">{STATUS_LABEL[device.status]}</span>
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-zinc-500">
                              {device.hardwareId}
                              {device.localUrl ? ` · ${device.localUrl}` : ""}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setView("pair")}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Привязать ещё одно устройство
                  </button>
                </>
              )}
            </div>
          ) : null}

          {view === "pair" ? (
            <div className="space-y-3">
              {pairError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900" role="alert">
                  {pairError}
                </div>
              ) : null}
              <div>
                <label htmlFor="brew-pair-code" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Claim-код
                </label>
                <input
                  id="brew-pair-code"
                  value={pairCode}
                  onChange={(event) => setPairCode(event.target.value)}
                  placeholder="Например, 3F9A"
                  autoComplete="off"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm uppercase text-zinc-900"
                />
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Код показывает дисплей устройства или его точка доступа при первом включении.
                </p>
              </div>
              <div>
                <label htmlFor="brew-pair-url" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Локальный адрес <span className="font-normal lowercase text-zinc-400">(опционально)</span>
                </label>
                <input
                  id="brew-pair-url"
                  value={pairLocalUrl}
                  onChange={(event) => setPairLocalUrl(event.target.value)}
                  placeholder="http://192.168.1.50"
                  autoComplete="off"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                />
              </div>
              <div>
                <label htmlFor="brew-pair-name" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Название <span className="font-normal lowercase text-zinc-400">(опционально)</span>
                </label>
                <input
                  id="brew-pair-name"
                  value={pairName}
                  onChange={(event) => setPairName(event.target.value)}
                  placeholder="Пивоварня на кухне"
                  autoComplete="off"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                />
              </div>
            </div>
          ) : null}

          {view === "confirm" ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold">Запуск включит нагрев</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900">
                    Устройство «{selectedDevice?.name ?? "—"}» начнёт нагрев ТЭНов по рецепту. Убедитесь, что в ёмкости есть
                    вода, а оборудование под присмотром.
                  </p>
                </div>
              </div>
              {startError ? (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{startError}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 p-5 sm:flex-row sm:justify-end">
          {view === "pick" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartError(null);
                  setView("confirm");
                }}
                disabled={busy || !selectedDevice}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Варить на устройстве
              </button>
            </>
          ) : null}

          {view === "pair" ? (
            <>
              <button
                type="button"
                onClick={() => (devices.length > 0 ? setView("pick") : onClose())}
                disabled={busy}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 disabled:opacity-50"
              >
                {devices.length > 0 ? "Назад" : "Отмена"}
              </button>
              <button
                type="button"
                onClick={() => void handlePair()}
                disabled={busy || (!pairCode.trim() && !pairLocalUrl.trim())}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {pairing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pairing ? "Привязываем…" : "Привязать"}
              </button>
            </>
          ) : null}

          {view === "confirm" ? (
            <>
              <button
                type="button"
                onClick={() => setView("pick")}
                disabled={busy}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 disabled:opacity-50"
              >
                Назад
              </button>
              <button
                type="button"
                onClick={() => void handleStart()}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {starting ? "Запускаем…" : "Подтвердить и запустить нагрев"}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
