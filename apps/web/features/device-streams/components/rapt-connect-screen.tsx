"use client";

// =============================================================================
//  features/device-streams/components/rapt-connect-screen.tsx
//  F1-RAPT «RAPT Cloud» — шаг 2 визарда подключения (docs/specs/third-party-
//  fermentation-devices.md §5): URL вебхука + шаблон payload для копирования на
//  RAPT-портал (Integrations → Web Hooks → New, POST), сворачиваемая инструкция,
//  живая зона «Ждём первый пакет…». В отличие от generic-флоу (connect-stream-
//  device-form.tsx) здесь нет формы «имя+вид» — устройства обнаруживаются САМИ
//  по первому пакету вебхука (ingest-rapt.ts), подключение одно на пользователя
//  и идемпотентно (getOrCreateRaptIntegrationAction можно звать повторно —
//  повторный вход на этот экран просто покажет уже существующее подключение).
//
//  Живая зона переиспользует /api/devices/tiles (тот же грид-опрос, что и на
//  /app/devices, M4-B: RAPT-устройства попадают в ветку kind==="stream" —
//  см. features/devices/tiles.ts), а не заводит отдельный роут: экран не привязан
//  к конкретному deviceId (устройство ещё не существует до первого пакета), а
//  тайлы уже несут вид устройства (hardwareKind rapt-pill/rapt-chamber/
//  rapt-brewzilla) и последнее показание — этого достаточно, чтобы поймать
//  «первое обнаруженное RAPT-устройство» без нового серверного эндпоинта.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button, Card, useToast } from "@nb/ui";
import type { PreferredGravityUnit } from "@nb/auth";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { getOrCreateRaptIntegrationAction, rotateRaptWebhookTokenAction } from "@/features/device-streams/actions";
import type { RaptIntegrationDto } from "@/features/device-streams/contracts";
import { streamHardwareKindLabels, type StreamHardwareKind } from "@/features/device-streams/contracts";
import { formatReadingSummary } from "@/features/device-streams/reading-summary";
import type { DeviceTile } from "@/features/devices/contracts";

const TILES_POLL_MS = 5000;

type DiscoveredDevice = {
  hardwareKind: string | null;
  gravitySg: number | null;
  tempC: number | null;
};

type Props = {
  preferredGravityUnit: PreferredGravityUnit;
  onBack: () => void;
  onDone: () => void;
  /** Синхронизирует «постоянную» карточку подключения на /app/devices (devices-manager.tsx) без дублирования запроса. */
  onIntegrationChange: (integration: RaptIntegrationDto) => void;
};

export function RaptConnectScreen({ preferredGravityUnit, onBack, onDone, onIntegrationChange }: Props) {
  const { show } = useToast();
  const [integration, setIntegration] = useState<RaptIntegrationDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotatePending, setRotatePending] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredDevice | null>(null);
  // One-shot guard против двойного вызова эффекта (React 18 StrictMode в dev
  // прогоняет mount→cleanup→mount): getOrCreateRaptIntegrationAction идемпотентна
  // на уровне БД (одна строка), но НЕ на уровне ответа — первый вызов создаёт
  // подключение и возвращает webhookUrl из СВЕЖЕГО rawToken (override), а
  // повторный вызов уже видит существующую строку и пытается decrypt
  // (tokenEncrypted); без BREWFORGE_DEVICE_TOKEN_ENC_KEY (dev-стенды без ключа,
  // см. device-token-crypto.ts) decrypt всегда null — второй ответ затирал бы
  // уже показанный URL на «Перевыпустите» (найдено живым прогоном DoD M4-B).
  // Намеренно БЕЗ cancelled-флага в cleanup: StrictMode-цикл не размонтирует
  // компонент по-настоящему, а гард блокирует повторный запуск — cancelled
  // отбрасывал бы ЕДИНСТВЕННЫЙ ответ и экран зависал на «Готовим подключение…»;
  // setState после реального unmount в React 18 — безопасный no-op.
  const createRequestedRef = useRef(false);

  // Шаг 1 (идемпотентно на уровне БД): создать подключение или получить уже существующее.
  useEffect(() => {
    if (createRequestedRef.current) return;
    createRequestedRef.current = true;
    void getOrCreateRaptIntegrationAction().then((result) => {
      if (result.ok) {
        setIntegration(result.integration);
        onIntegrationChange(result.integration);
      } else {
        setLoadError(result.message);
      }
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Живая зона: поллинг раз в 5 с, пока не найдено RAPT-устройство с данными
  // (первое подключение — «ждём первый пакет»; повторный вход, когда устройства
  // уже есть, — сразу покажет найденное, без ложного ожидания).
  useEffect(() => {
    if (discovered) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/devices/tiles", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { tiles?: DeviceTile[] };
        const found = (body.tiles ?? []).find(
          (tile) =>
            tile.kind === "stream" &&
            Boolean(tile.streamSnapshot?.hardwareKind?.startsWith("rapt-")) &&
            tile.streamSnapshot?.lastReadingAtMs !== null
        );
        if (found && !cancelled) {
          setDiscovered({
            hardwareKind: found.streamSnapshot?.hardwareKind ?? null,
            gravitySg: found.streamSnapshot?.gravitySg ?? null,
            tempC: found.streamSnapshot?.tempC ?? null
          });
        }
      } catch {
        // тихо — попробуем на следующем тике
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), TILES_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [discovered]);

  const copyUrl = useCallback(async () => {
    if (!integration?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(integration.webhookUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // буфер обмена недоступен — URL уже показан текстом, скопируют вручную
    }
  }, [integration]);

  const copyTemplate = useCallback(async () => {
    if (!integration) return;
    try {
      await navigator.clipboard.writeText(integration.payloadTemplate);
      setCopiedTemplate(true);
      window.setTimeout(() => setCopiedTemplate(false), 2000);
    } catch {
      // буфер обмена недоступен
    }
  }, [integration]);

  const submitRotate = useCallback(async () => {
    setRotatePending(true);
    try {
      const result = await rotateRaptWebhookTokenAction();
      if (!result.ok) {
        show({ title: result.message, tone: "danger" });
        return;
      }
      setIntegration(result.integration);
      onIntegrationChange(result.integration);
      setCopiedUrl(false);
      setRotateOpen(false);
      show({ title: "URL перевыпущен. Старый больше не работает", tone: "success" });
    } finally {
      setRotatePending(false);
    }
  }, [onIntegrationChange, show]);

  const kindLabel =
    discovered?.hardwareKind && discovered.hardwareKind in streamHardwareKindLabels
      ? streamHardwareKindLabels[discovered.hardwareKind as StreamHardwareKind]
      : "устройство RAPT";

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-sm font-semibold text-foreground">RAPT Cloud</h2>

      {loading ? (
        <p className="text-sm text-muted-foreground">Готовим подключение…</p>
      ) : loadError ? (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      ) : integration ? (
        <div className="space-y-4">
          {integration.webhookUrl ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">URL вебхука</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                  {integration.webhookUrl}
                </code>
                <Button variant="outline" onClick={() => void copyUrl()}>
                  {copiedUrl ? "Скопировано" : "Скопировать"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              URL показывается один раз. Перевыпустите, чтобы получить новый.{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-2"
                onClick={() => setRotateOpen(true)}
              >
                Перевыпустить URL
              </button>
            </p>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Шаблон payload</p>
            <div className="flex flex-wrap items-start gap-2">
              <pre className="max-w-full overflow-x-auto whitespace-pre rounded-md bg-muted px-3 py-2 font-mono text-xs leading-5 text-foreground">
                {integration.payloadTemplate}
              </pre>
              <Button variant="outline" onClick={() => void copyTemplate()}>
                {copiedTemplate ? "Скопировано" : "Скопировать шаблон"}
              </Button>
            </div>
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
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm leading-6 text-muted-foreground">
                <li>На RAPT-портале откройте Integrations → Web Hooks → New.</li>
                <li>Метод запроса — POST.</li>
                <li>Вставьте URL вебхука (выше) в адрес.</li>
                <li>Вставьте шаблон payload (выше) в тело запроса.</li>
                <li>Сохраните — RAPT Pill, камера ферментации или BrewZilla появятся здесь автоматически при первом пакете.</li>
              </ol>
            ) : null}
          </div>

          {/* Живая зона «Ждём первый пакет…» (§5 F1). */}
          {discovered ? (
            <div className="rounded-xl border border-success/30 bg-success-subtle p-4">
              <p className="text-sm font-semibold text-success-subtle-foreground">
                ✅ Обнаружен: {kindLabel}
                {discovered.gravitySg !== null || discovered.tempC !== null
                  ? ` · ${formatReadingSummary(
                      { gravitySg: discovered.gravitySg, tempC: discovered.tempC, batteryV: null, batteryPct: null },
                      preferredGravityUnit
                    )}`
                  : ""}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-border p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Ждём первый пакет…
            </div>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {discovered ? (
          <Button type="button" onClick={onDone}>
            Готово
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onBack}>
          Назад
        </Button>
      </div>

      <ConfirmActionDialog
        open={rotateOpen}
        title="Перевыпустить URL?"
        description="Старый URL перестанет работать сразу — вебхук на RAPT-портале, использующий его, перестанет присылать данные, пока вы не пропишете новый."
        confirmLabel="Перевыпустить"
        pendingLabel="Перевыпускаем…"
        tone="danger"
        pending={rotatePending}
        onConfirm={() => void submitRotate()}
        onClose={() => {
          if (!rotatePending) setRotateOpen(false);
        }}
      />
    </Card>
  );
}
