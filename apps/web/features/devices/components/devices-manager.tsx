"use client";

// =============================================================================
//  features/devices/components/devices-manager.tsx
//  L1 командный центр (грид плиток пивоварен → статус → пульт): каждая плитка —
//  last-known статус пивоварни (см. device-tile.tsx), клик «Пульт» → L2. Плитки
//  подтягиваются одним лёгким health-опросом /api/devices/tiles (без per-tile SSE).
//  Плюс: демо-пивоварня одной кнопкой, сворачиваемая привязка нового устройства
//  (claim-code → одноразовый bearer-токен, показывается РОВНО один раз) и отзыв.
//
//  Безопасность: plaintext-токен живёт только в локальном state и показывается
//  один раз; на сервер/в логи он не уходит. Никогда не рендерим tokenHash.
// =============================================================================
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button, Card, Input } from "@nb/ui";
import type { PreferredGravityUnit } from "@nb/auth";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { DeviceTile } from "@/features/devices/components/device-tile";
import { NotificationOptIn } from "@/features/notifications/components/notification-opt-in";
import { devicePairingErrorText, pairingDeliveryReasonText } from "@/features/devices/pairing-error-text";
import type { DeviceTile as DeviceTileData, PairingDeliveryStatus } from "@/features/devices/contracts";
import { ConnectStreamDeviceForm } from "@/features/device-streams/components/connect-stream-device-form";
import { RaptConnectScreen } from "@/features/device-streams/components/rapt-connect-screen";
import { RaptIntegrationCard } from "@/features/device-streams/components/rapt-integration-card";
import { getRaptIntegrationAction } from "@/features/device-streams/actions";
import type { RaptIntegrationDto } from "@/features/device-streams/contracts";

// Период health-опроса грида (last-known, не живой стрим) и тик «N назад».
const TILES_POLL_MS = 15_000;
const NOW_TICK_MS = 5_000;

type Props = {
  initialTiles: DeviceTileData[];
  /** Демо-пивоварня (loopback device-sim в dev / стаб в prod) доступна. */
  demoAvailable: boolean;
  preferredGravityUnit: PreferredGravityUnit;
};

/** Шаг визарда подключения (F1/F1-RAPT), выражен в URL — шарабельно, переживает reload. */
type ConnectMode = "none" | "select" | "brewforge" | "stream" | "rapt";

export function DevicesManager({ initialTiles, demoAvailable, preferredGravityUnit }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tiles, setTiles] = useState<DeviceTileData[]>(initialTiles);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  // Визард подключения (свёрнут по умолчанию — грид плиток герой L1). Шаг 1 —
  // выбор типа устройства (BrewForge / цифровой ареометр / RAPT Cloud); ?pair=1
  // сохранён для обратной совместимости (прямая ссылка сразу открывает ветку BrewForge).
  const connectMode: ConnectMode = (() => {
    if (searchParams.get("pair") === "1") return "brewforge";
    const connect = searchParams.get("connect");
    if (connect === "stream") return "stream";
    if (connect === "rapt") return "rapt";
    if (connect === "1") return "select";
    return "none";
  })();
  const setConnectMode = useCallback(
    (mode: ConnectMode) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("pair");
      params.delete("connect");
      if (mode === "brewforge") params.set("pair", "1");
      else if (mode === "select") params.set("connect", "1");
      else if (mode === "stream") params.set("connect", "stream");
      else if (mode === "rapt") params.set("connect", "rapt");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const showPair = connectMode === "brewforge";
  const [claimCode, setClaimCode] = useState("");
  const [name, setName] = useState("");
  const [localUrl, setLocalUrl] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  // Одноразовый токен, показанный после успешной привязки.
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Итог автодоставки токена устройству по LAN (P4) — сопровождает issuedToken.
  const [pairingStatus, setPairingStatus] = useState<PairingDeliveryStatus | null>(null);

  // Отзыв.
  const [revokeTarget, setRevokeTarget] = useState<DeviceTileData | null>(null);
  const [revoking, setRevoking] = useState(false);

  // RAPT Cloud подключение (§5 F1-RAPT/F8, M4-B): read-only фетч на маунте — не
  // создаёт подключение (getRaptIntegrationAction, в отличие от «getOrCreate» в
  // визарде), только проверяет, есть ли уже что показывать компактной карточкой.
  // null, пока не загрузилось ИЛИ подключения нет вовсе — тогда карточка не рендерится.
  const [raptIntegration, setRaptIntegration] = useState<RaptIntegrationDto | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getRaptIntegrationAction().then((result) => {
      if (!cancelled && result.ok && result.integration) {
        setRaptIntegration(result.integration);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  // Число RAPT-устройств — для текста подтверждения удаления подключения;
  // считаем из уже загруженных плиток (hardwareKind rapt-*), без доп. запроса.
  const raptDeviceCount = tiles.filter((tile) => Boolean(tile.streamSnapshot?.hardwareKind?.startsWith("rapt-"))).length;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/devices/tiles", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { tiles?: DeviceTileData[] };
      if (Array.isArray(body.tiles)) {
        setTiles(body.tiles);
        setNowMs(Date.now());
      }
    } catch {
      // тихо — грид обновится при следующей операции/тике
    }
  }, []);

  // Лёгкий health-опрос грида + тик «N назад» (last-known, без SSE на плитку).
  useEffect(() => {
    const pollId = window.setInterval(() => void refresh(), TILES_POLL_MS);
    const tickId = window.setInterval(() => setNowMs(Date.now()), NOW_TICK_MS);
    return () => {
      window.clearInterval(pollId);
      window.clearInterval(tickId);
    };
  }, [refresh]);

  const submitPair = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setPairing(true);
      setPairError(null);
      setIssuedToken(null);
      setPairingStatus(null);
      setCopied(false);
      try {
        const payload: Record<string, string> = {};
        if (claimCode.trim()) payload.claimCode = claimCode.trim();
        if (name.trim()) payload.name = name.trim();
        if (localUrl.trim()) payload.localUrl = localUrl.trim();

        const res = await fetch("/api/devices/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const body = (await res.json()) as {
          token?: string;
          error?: string;
          pairing?: PairingDeliveryStatus;
        };
        if (!res.ok || body.error || !body.token) {
          setPairError(devicePairingErrorText(body.error));
          return;
        }
        // Токен показываем РОВНО один раз; чистим поля формы.
        setIssuedToken(body.token);
        setPairingStatus(body.pairing ?? null);
        setClaimCode("");
        setName("");
        setLocalUrl("");
        await refresh();
      } catch (error) {
        setPairError((error as Error).message || "Ошибка сети");
      } finally {
        setPairing(false);
      }
    },
    [claimCode, name, localUrl, refresh]
  );

  const runRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setRevoking(true);
    try {
      const res = await fetch(`/api/devices/${target.id}`, { method: "DELETE" });
      if (res.ok) {
        setRevokeTarget(null);
        await refresh();
      }
    } catch {
      // оставляем диалог открытым при сетевой ошибке
    } finally {
      setRevoking(false);
    }
  }, [revokeTarget, refresh]);

  // Демо-пивоварня: без реального железа, для быстрого знакомства с командным центром.
  const createDemo = useCallback(async () => {
    setCreatingDemo(true);
    setDemoError(null);
    try {
      const res = await fetch("/api/devices/demo", { method: "POST" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok || body.error) {
        setDemoError(devicePairingErrorText(body.error));
        return;
      }
      await refresh();
    } catch (error) {
      setDemoError((error as Error).message || "Ошибка сети");
    } finally {
      setCreatingDemo(false);
    }
  }, [refresh]);

  const copyToken = useCallback(async () => {
    if (!issuedToken) return;
    try {
      await navigator.clipboard.writeText(issuedToken);
      setCopied(true);
    } catch {
      // буфер обмена недоступен — пользователь скопирует вручную
    }
  }, [issuedToken]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1
            className="text-2xl font-semibold text-foreground sm:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Устройства
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {demoAvailable ? (
            <div className="flex flex-col items-end gap-1">
              <Button variant="outline" onClick={() => void createDemo()} disabled={creatingDemo}>
                {creatingDemo ? "Создаём…" : "Демо-пивоварня"}
              </Button>
              {demoError ? <p role="alert" className="text-xs text-destructive">{demoError}</p> : null}
            </div>
          ) : null}
          <Button
            variant="outline"
            onClick={() => setConnectMode(connectMode === "none" ? "select" : "none")}
          >
            {connectMode === "none" ? "Подключить устройство" : "Скрыть"}
          </Button>
        </div>
      </header>

      {/* Web-push: пуш о засыпи/промывке/авариях вне дома (Phase 6). */}
      <NotificationOptIn />

      {/* Визард подключения, шаг 1 — выбор типа устройства. */}
      {connectMode === "select" ? (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Что подключаем?</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setConnectMode("brewforge")}
              className="rounded-xl border border-border p-4 text-left transition hover:border-foreground/40 hover:bg-accent"
            >
              <p className="text-sm font-semibold text-foreground">BrewForge — контроллер варки</p>
            </button>
            <button
              type="button"
              onClick={() => setConnectMode("stream")}
              className="rounded-xl border border-border p-4 text-left transition hover:border-foreground/40 hover:bg-accent"
            >
              <p className="text-sm font-semibold text-foreground">Цифровой ареометр или датчик</p>
              <p className="mt-1 text-xs text-muted-foreground">iSpindel, Tilt, Floaty, BrewPiLess…</p>
            </button>
            <button
              type="button"
              onClick={() => setConnectMode("rapt")}
              className="rounded-xl border border-border p-4 text-left transition hover:border-foreground/40 hover:bg-accent"
            >
              <p className="text-sm font-semibold text-foreground">RAPT Cloud</p>
              <p className="mt-1 text-xs text-muted-foreground">Pill, камера ферментации, BrewZilla</p>
            </button>
          </div>
        </Card>
      ) : null}

      {/* Визард подключения, шаг 2 — стрим-устройство (F1 «Поплавок/датчик»). */}
      {connectMode === "stream" ? (
        <ConnectStreamDeviceForm onBack={() => setConnectMode("select")} />
      ) : null}

      {/* Визард подключения, шаг 2 — RAPT Cloud (F1-RAPT). */}
      {connectMode === "rapt" ? (
        <RaptConnectScreen
          preferredGravityUnit={preferredGravityUnit}
          onBack={() => setConnectMode("select")}
          onDone={() => {
            setConnectMode("none");
            void refresh();
          }}
          onIntegrationChange={setRaptIntegration}
        />
      ) : null}

      {/* Форма привязки BrewForge (существующий флоу, не меняется). */}
      {showPair ? (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Привязать устройство</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Введите одноразовый код привязки, показанный на экране контроллера. Опционально — имя и
            локальный адрес (для прямой LAN-связи).
          </p>
          <form onSubmit={submitPair} className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Код привязки
              <Input
                value={claimCode}
                onChange={(e) => setClaimCode(e.target.value)}
                placeholder="напр. A1B2"
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Имя (опц.)
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Пивоварня на кухне"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Локальный адрес (опц.)
              <Input
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                placeholder="http://192.168.1.50"
              />
            </label>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={pairing}>
                {pairing ? "Привязка…" : "Привязать"}
              </Button>
            </div>
          </form>

          {pairError ? <p role="alert" className="mt-3 text-sm text-destructive">{pairError}</p> : null}

          {/* Одноразовый токен. */}
          {issuedToken ? (
            <div role="status" className="mt-4 rounded-xl border-2 border-success/30 bg-success-subtle p-4">
              <p className="text-sm font-semibold text-success-subtle-foreground">Устройство привязано</p>
              {pairingStatus?.delivered ? (
                <p className="mt-1 text-xs text-success-subtle-foreground">
                  Токен уже доставлен устройству по локальной сети — можно управлять сразу.
                </p>
              ) : (
                <p className="mt-1 text-xs text-success-subtle-foreground">
                  Скопируйте этот токен и пропишите его на устройстве. Он показывается{" "}
                  <strong>один раз</strong> и не хранится на сервере.
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="break-all rounded-md bg-card px-3 py-2 text-xs text-foreground ring-1 ring-success/30">
                  {issuedToken}
                </code>
                <Button variant="outline" onClick={() => void copyToken()}>
                  {copied ? "Скопировано" : "Копировать"}
                </Button>
                <Button variant="outline" onClick={() => setIssuedToken(null)}>
                  Скрыть
                </Button>
              </div>
              {/* Итог автодоставки токена (P4) — только если НЕ доставлен: деливеред-путь
                  уже описан выше, тут нужен только «что делать», если авто не сработало. */}
              {pairingStatus && !pairingStatus.delivered ? (
                <p className="mt-3 text-xs text-warning-subtle-foreground">{pairingDeliveryReasonText(pairingStatus.reason)}</p>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* RAPT Cloud подключение (§5 F8, M4-B) — компактная карточка-«память» визарда,
          не кричащий блок; скрыта, пока открыт сам визард RAPT (там уже есть URL). */}
      {raptIntegration && connectMode !== "rapt" ? (
        <RaptIntegrationCard
          integration={raptIntegration}
          deviceCount={raptDeviceCount}
          onIntegrationChange={setRaptIntegration}
          onDeleted={() => {
            setRaptIntegration(null);
            void refresh();
          }}
        />
      ) : null}

      {/* Грид плиток командного центра. */}
      {tiles.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Пока нет подключённых устройств. Подключите BrewForge или цифровой ареометр
          {demoAvailable ? ", либо создайте демо-пивоварню без железа" : ""}.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => (
            <DeviceTile
              key={tile.id}
              tile={tile}
              nowMs={nowMs}
              onRevoke={() => setRevokeTarget(tile)}
              preferredGravityUnit={preferredGravityUnit}
            />
          ))}
        </div>
      )}

      <ConfirmActionDialog
        open={revokeTarget !== null}
        title="Отозвать доступ устройства?"
        description={
          revokeTarget
            ? `Устройство «${revokeTarget.name}» больше не сможет подключаться (токен будет аннулирован). История телеметрии сохранится.`
            : ""
        }
        confirmLabel="Отозвать"
        tone="danger"
        pending={revoking}
        onConfirm={() => void runRevoke()}
        onClose={() => setRevokeTarget(null)}
      />
    </div>
  );
}
