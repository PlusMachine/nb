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

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { DeviceTile } from "@/features/devices/components/device-tile";
import { NotificationOptIn } from "@/features/notifications/components/notification-opt-in";
import { devicePairingErrorText } from "@/features/devices/pairing-error-text";
import type { DeviceTile as DeviceTileData } from "@/features/devices/contracts";

// Период health-опроса грида (last-known, не живой стрим) и тик «N назад».
const TILES_POLL_MS = 15_000;
const NOW_TICK_MS = 5_000;

type Props = {
  initialTiles: DeviceTileData[];
  /** Демо-пивоварня (loopback device-sim в dev / стаб в prod) доступна. */
  demoAvailable: boolean;
};

export function DevicesManager({ initialTiles, demoAvailable }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tiles, setTiles] = useState<DeviceTileData[]>(initialTiles);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  // Привязка (свёрнута по умолчанию — грид плиток герой L1). Состояние — в URL
  // (?pair=1), чтобы ссылка на форму привязки была шарабельна и переживала reload.
  const showPair = searchParams.get("pair") === "1";
  const togglePair = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (showPair) {
      params.delete("pair");
    } else {
      params.set("pair", "1");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, showPair]);
  const [claimCode, setClaimCode] = useState("");
  const [name, setName] = useState("");
  const [localUrl, setLocalUrl] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  // Одноразовый токен, показанный после успешной привязки.
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Отзыв.
  const [revokeTarget, setRevokeTarget] = useState<DeviceTileData | null>(null);
  const [revoking, setRevoking] = useState(false);

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
        const body = (await res.json()) as { token?: string; error?: string };
        if (!res.ok || body.error || !body.token) {
          setPairError(devicePairingErrorText(body.error));
          return;
        }
        // Токен показываем РОВНО один раз; чистим поля формы.
        setIssuedToken(body.token);
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
            className="text-2xl font-semibold text-zinc-950 sm:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Устройства
          </h1>
          <p className="text-sm text-zinc-500">
            Командный центр: пивоварни BrewForge, привязанные к вашему аккаунту.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {demoAvailable ? (
            <div className="flex flex-col items-end gap-1">
              <Button variant="outline" onClick={() => void createDemo()} disabled={creatingDemo}>
                {creatingDemo ? "Создаём…" : "Демо-пивоварня"}
              </Button>
              {demoError ? <p role="alert" className="text-xs text-red-600">{demoError}</p> : null}
            </div>
          ) : null}
          <Button variant="outline" onClick={togglePair}>
            {showPair ? "Скрыть" : "Привязать устройство"}
          </Button>
        </div>
      </header>

      {/* Web-push: пуш о засыпи/промывке/авариях вне дома (Phase 6). */}
      <NotificationOptIn />

      {/* Форма привязки (свёрнута по умолчанию). */}
      {showPair ? (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Привязать устройство</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Введите одноразовый код привязки, показанный на экране контроллера. Опционально — имя и
            локальный адрес (для прямой LAN-связи).
          </p>
          <form onSubmit={submitPair} className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              Код привязки
              <Input
                value={claimCode}
                onChange={(e) => setClaimCode(e.target.value)}
                placeholder="напр. A1B2"
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              Имя (опц.)
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Пивоварня на кухне"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
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

          {pairError ? <p role="alert" className="mt-3 text-sm text-red-600">{pairError}</p> : null}

          {/* Одноразовый токен. */}
          {issuedToken ? (
            <div role="status" className="mt-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900">Устройство привязано</p>
              <p className="mt-1 text-xs text-emerald-800">
                Скопируйте этот токен и пропишите его на устройстве. Он показывается{" "}
                <strong>один раз</strong> и не хранится на сервере.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="break-all rounded-md bg-white px-3 py-2 text-xs text-zinc-900 ring-1 ring-emerald-200">
                  {issuedToken}
                </code>
                <Button variant="outline" onClick={() => void copyToken()}>
                  {copied ? "Скопировано" : "Копировать"}
                </Button>
                <Button variant="outline" onClick={() => setIssuedToken(null)}>
                  Скрыть
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Грид плиток командного центра. */}
      {tiles.length === 0 ? (
        <Card className="p-6 text-sm text-zinc-600">
          Пока нет привязанных устройств. Привяжите контроллер по коду
          {demoAvailable ? ", либо создайте демо-пивоварню без железа" : ""}.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => (
            <DeviceTile
              key={tile.id}
              tile={tile}
              nowMs={nowMs}
              onRevoke={() => setRevokeTarget(tile)}
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
