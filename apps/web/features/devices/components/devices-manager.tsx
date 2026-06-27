"use client";

// =============================================================================
//  features/devices/components/devices-manager.tsx
//  Управление подключёнными контроллерами BrewForge: список устройств (статус,
//  fw, lastSeenAt, localUrl), форма привязки (claim-code → одноразовый bearer-
//  токен, показывается РОВНО один раз) и отзыв доступа.
//
//  Безопасность: plaintext-токен живёт только в локальном state и показывается
//  один раз; на сервер/в логи он не уходит. Никогда не рендерим tokenHash.
// =============================================================================
import { useCallback, useState } from "react";

import { Button, Card, Input } from "@nb/ui";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";

// Сериализованный DTO устройства для клиента (даты — ISO-строки).
export type DeviceView = {
  id: string;
  name: string;
  hardwareId: string;
  fw: string | null;
  status: "online" | "offline" | "unknown";
  localUrl: string | null;
  mqttPrefix: string | null;
  lastSeenAt: string | null;
};

// Перевод доменных кодов ошибок (errors.ts) в человекочитаемый текст.
const ERROR_TEXT: Record<string, string> = {
  INVALID_REQUEST: "Проверьте введённые данные",
  INVALID_CLAIM_CODE: "Неверный или просроченный код привязки",
  CLAIM_CODE_REQUIRED: "Нужен код привязки (показан на экране устройства)",
  CLAIM_CODE_OR_HARDWARE_ID_REQUIRED: "Укажите код привязки",
  HARDWARE_ID_REQUIRED: "Не удалось определить устройство",
  CLAIM_CODE_OWNED_BY_OTHER_USER: "Этот код выпущен для другого аккаунта",
  CLAIM_CODE_ALREADY_CONSUMED: "Код уже использован",
  DEVICE_OWNED_BY_OTHER_USER: "Устройство уже привязано к другому аккаунту",
  NOT_FOUND: "Устройство не найдено",
  INTERNAL_ERROR: "Внутренняя ошибка. Попробуйте позже"
};

const errText = (code: string | undefined): string =>
  (code && ERROR_TEXT[code]) || "Не удалось выполнить операцию";

function StatusDot({ status }: { status: DeviceView["status"] }) {
  const cls =
    status === "online" ? "bg-emerald-500" : status === "offline" ? "bg-zinc-400" : "bg-amber-400";
  const label = status === "online" ? "в сети" : status === "offline" ? "офлайн" : "неизвестно";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
      <span className={`h-2 w-2 rounded-full ${cls}`} />
      {label}
    </span>
  );
}

function fmtLastSeen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

type Props = {
  initialDevices: DeviceView[];
};

export function DevicesManager({ initialDevices }: Props) {
  const [devices, setDevices] = useState<DeviceView[]>(initialDevices);

  // Форма привязки.
  const [claimCode, setClaimCode] = useState("");
  const [name, setName] = useState("");
  const [localUrl, setLocalUrl] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  // Одноразовый токен, показанный после успешной привязки.
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Отзыв.
  const [revokeTarget, setRevokeTarget] = useState<DeviceView | null>(null);
  const [revoking, setRevoking] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/devices", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { devices?: DeviceView[] };
      if (Array.isArray(body.devices)) {
        setDevices(
          body.devices.map((d) => ({
            id: d.id,
            name: d.name,
            hardwareId: d.hardwareId,
            fw: d.fw,
            status: d.status,
            localUrl: d.localUrl,
            mqttPrefix: d.mqttPrefix,
            lastSeenAt: d.lastSeenAt
          }))
        );
      }
    } catch {
      // тихо — список обновится при следующей операции/перезагрузке
    }
  }, []);

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
        const body = (await res.json()) as { device?: DeviceView; token?: string; error?: string };
        if (!res.ok || body.error || !body.token) {
          setPairError(errText(body.error));
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
      <header className="space-y-1">
        <h1
          className="text-2xl font-semibold text-zinc-950 sm:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Устройства
        </h1>
        <p className="text-sm text-zinc-500">
          Контроллеры варки BrewForge, привязанные к вашему аккаунту.
        </p>
      </header>

      {/* Форма привязки. */}
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

        {pairError ? <p className="mt-3 text-sm text-red-600">{pairError}</p> : null}

        {/* Одноразовый токен. */}
        {issuedToken ? (
          <div className="mt-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
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

      {/* Список устройств. */}
      {devices.length === 0 ? (
        <Card className="p-6 text-sm text-zinc-600">
          Пока нет привязанных устройств. Привяжите контроллер по коду выше.
        </Card>
      ) : (
        <div className="grid gap-3">
          {devices.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-zinc-950">{d.name}</h3>
                    <StatusDot status={d.status} />
                  </div>
                  <dl className="mt-1 grid gap-x-6 gap-y-0.5 text-xs text-zinc-500 sm:grid-cols-2">
                    <Meta label="Hardware ID" value={d.hardwareId} mono />
                    <Meta label="Прошивка" value={d.fw ?? "—"} />
                    <Meta label="Последняя связь" value={fmtLastSeen(d.lastSeenAt)} />
                    <Meta label="Локальный адрес" value={d.localUrl ?? "—"} mono />
                  </dl>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/app/devices/${d.id}/settings`}
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Настройки
                  </a>
                  <a
                    href="/app/recipes"
                    className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Активные варки
                  </a>
                  <Button
                    variant="outline"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    onClick={() => setRevokeTarget(d)}
                  >
                    Отозвать
                  </Button>
                </div>
              </div>
            </Card>
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

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-zinc-400">{label}:</dt>
      <dd className={`text-zinc-700 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
