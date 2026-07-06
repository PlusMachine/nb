"use client";

// =============================================================================
//  features/devices/components/device-picker-list.tsx
//  Переиспользуемый выбор привязанного устройства BrewForge + инлайн-привязка
//  нового устройства (claim-код + опц. localUrl). Вынесено из
//  features/brew-batches/components/brew-on-device-modal.tsx для повторного
//  использования в BrewPickerDialog (единый вход «Сварить», автоматическая
//  ветка). Список/загрузку/ошибку владелец (родитель) передаёт пропами —
//  компонент не дублирует fetch, только показывает и позволяет выбрать/привязать.
//  Офлайн-устройства ДИЗЕЙБЛ (нагрев с них не запустить) — подпись «Не в сети».
// =============================================================================
import React, { useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";

import { Button } from "@nb/ui";
import { devicePairingErrorText, pairingDeliveryReasonText } from "@/features/devices/pairing-error-text";
import type { PairingDeliveryStatus } from "@/features/devices/contracts";

/** Клиентская проекция DeviceDto: после JSON даты приходят строками. */
export type PickerDevice = {
  id: string;
  name: string;
  hardwareId: string;
  status: "online" | "offline" | "unknown";
  localUrl: string | null;
  fw: string | null;
};

const STATUS_LABEL: Record<PickerDevice["status"], string> = {
  online: "В сети",
  offline: "Не в сети",
  unknown: "Статус неизвестен"
};

const STATUS_DOT: Record<PickerDevice["status"], string> = {
  online: "bg-success",
  offline: "bg-muted-foreground",
  unknown: "bg-warning"
};

type Props = {
  devices: PickerDevice[];
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  selectedDeviceId: string | null;
  onSelect: (deviceId: string) => void;
  /** Новое устройство успешно привязано (claim) — родитель добавляет его в свой список. */
  onDeviceAdded: (device: PickerDevice, token: string | null) => void;
  /** Внешний busy (например, идёт запуск варки) — блокирует выбор/пайринг. */
  disabled?: boolean;
};

export function DevicePickerList({
  devices,
  loading,
  loadError,
  onRetry,
  selectedDeviceId,
  onSelect,
  onDeviceAdded,
  disabled = false
}: Props) {
  const [view, setView] = useState<"list" | "pair">(devices.length === 0 ? "pair" : "list");
  const [pairCode, setPairCode] = useState("");
  const [pairLocalUrl, setPairLocalUrl] = useState("");
  const [pairName, setPairName] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<PairingDeliveryStatus | null>(null);

  // Список догрузился пустым (нет привязанных устройств) — сразу форма привязки.
  useEffect(() => {
    if (!loading && !loadError && devices.length === 0) {
      setView("pair");
    }
  }, [loading, loadError, devices.length]);

  const busy = disabled || pairing;

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
      const data = (await res.json()) as {
        device?: PickerDevice;
        token?: string;
        error?: string;
        pairing?: PairingDeliveryStatus;
      };
      if (!res.ok || !data.device) {
        setPairError(devicePairingErrorText(data.error));
        return;
      }
      // Plaintext-токен показываем один раз — его нужно прошить в устройство
      // (если не доставлен автоматически по LAN, см. pairingStatus, пакет 4-B).
      setIssuedToken(data.token ?? null);
      setPairingStatus(data.pairing ?? null);
      onDeviceAdded(data.device, data.token ?? null);
      onSelect(data.device.id);
      setView("list");
    } catch {
      setPairError("Не удалось привязать устройство. Проверьте код и адрес.");
    } finally {
      setPairing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Загрузка устройств…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-destructive-border bg-destructive-subtle px-3 py-3 text-sm text-destructive-subtle-foreground" role="alert">
        <p>{loadError}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-destructive-border bg-card px-2.5 py-1.5 text-xs font-medium text-destructive-subtle-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {issuedToken ? (
        <div className="rounded-lg border border-success/30 bg-success-subtle px-3 py-3 text-sm text-success-subtle-foreground" role="status">
          <p className="font-semibold">Устройство привязано.</p>
          {pairingStatus?.delivered ? (
            <p className="mt-1 text-xs leading-5 text-success-subtle-foreground">
              Токен уже доставлен устройству по локальной сети — можно управлять сразу.
            </p>
          ) : (
            <p className="mt-1 text-xs leading-5 text-success-subtle-foreground">
              Сохраните токен и пропишите его в устройстве — он показывается один раз и нигде не хранится в открытом виде.
            </p>
          )}
          <code className="mt-2 block break-all rounded-md border border-success/30 bg-card px-2 py-1.5 font-mono text-xs text-success-subtle-foreground">
            {issuedToken}
          </code>
          {pairingStatus && !pairingStatus.delivered ? (
            <p className="mt-2 text-xs leading-5 text-warning-subtle-foreground">{pairingDeliveryReasonText(pairingStatus.reason)}</p>
          ) : null}
        </div>
      ) : null}

      {view === "list" ? (
        <>
          <div className="space-y-2">
            {devices.map((device) => {
              const active = device.id === selectedDeviceId;
              const offline = device.status === "offline";
              return (
                <label
                  key={device.id}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-3 ${
                    offline
                      ? "cursor-not-allowed border-border bg-muted opacity-60"
                      : active
                        ? "cursor-pointer border-foreground bg-muted"
                        : "cursor-pointer border-border bg-card"
                  }`}
                >
                  <input
                    type="radio"
                    name="brew-device-picker"
                    checked={active}
                    disabled={offline || busy}
                    onChange={() => onSelect(device.id)}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{device.name}</span>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[device.status]}`} aria-hidden />
                      <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[device.status]}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
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
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            Привязать ещё одно устройство
          </button>
        </>
      ) : (
        <div className="space-y-3">
          {pairError ? (
            <div className="rounded-lg border border-destructive-border bg-destructive-subtle px-3 py-3 text-sm text-destructive-subtle-foreground" role="alert">
              {pairError}
            </div>
          ) : null}
          <div>
            <label htmlFor="brew-pair-code" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Claim-код
            </label>
            <input
              id="brew-pair-code"
              value={pairCode}
              onChange={(event) => setPairCode(event.target.value)}
              placeholder="Например, 3F9A"
              autoComplete="off"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm uppercase text-foreground"
            />
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Код показывает дисплей устройства или его точка доступа при первом включении.
            </p>
          </div>
          <div>
            <label htmlFor="brew-pair-url" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Локальный адрес <span className="font-normal lowercase text-muted-foreground">(опционально)</span>
            </label>
            <input
              id="brew-pair-url"
              value={pairLocalUrl}
              onChange={(event) => setPairLocalUrl(event.target.value)}
              placeholder="http://192.168.1.50"
              autoComplete="off"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label htmlFor="brew-pair-name" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Название <span className="font-normal lowercase text-muted-foreground">(опционально)</span>
            </label>
            <input
              id="brew-pair-name"
              value={pairName}
              onChange={(event) => setPairName(event.target.value)}
              placeholder="Пивоварня на кухне"
              autoComplete="off"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {devices.length > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setView("list")} disabled={busy}>
                Назад к списку
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={() => void handlePair()}
              disabled={busy || (!pairCode.trim() && !pairLocalUrl.trim())}
            >
              {pairing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {pairing ? "Привязываем…" : "Привязать"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
