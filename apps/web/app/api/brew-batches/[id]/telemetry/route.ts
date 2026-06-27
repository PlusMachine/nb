import { NextResponse } from "next/server";

import { brewTelemetry, db } from "@nb/db";
import type { Telemetry } from "@nb/brewforge-protocol";

import { requireUser } from "@/lib/auth";
import { getBrewBatchById } from "@/features/brew-batches/service";
import { getProvider } from "@/features/brew-controller";

// SSE-стрим телеметрии партии варки.
//
// LAN/sim-путь (текущий): резолвим партию (ownership) → её устройство
// (brew_batches.deviceId) → ~каждые 1.5 с дёргаем getProvider('brewforge')
// .readTelemetry({ userId, deviceId }) и отдаём каждый Telemetry как SSE-кадр.
// Закрываемся при дисконнекте клиента (request.signal abort / stream cancel).
//
// Облачный путь (Phase 3, мост): вместо опроса LAN — подписка на WS моста
// (brewforge/<deviceId>/telemetry); контракт SSE-кадров наружу остаётся тем же.
//
// Кадры (text/event-stream):
//   data: <Telemetry-json>\n\n         — валидный снимок телеметрии
//   event: offline\n data: {}\n\n      — устройство не отдало валидной телеметрии
//   event: error\n data: {"error":..}  — ошибка транспорта/провайдера на итерации

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 1500;
// Даунсэмпл персиста для графиков в LAN/sim-пути: не чаще одной строки раз в ~10 с
// на стрим. Облачный путь пишет полную частоту в мосте; здесь — лёгкая выборка,
// чтобы история работала и без брокера. Дедуп по seq (тот же кадр не пишем дважды).
const PERSIST_INTERVAL_MS = 10_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const batch = await getBrewBatchById(user.id, id);
  if (!batch) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!batch.deviceId) {
    return NextResponse.json({ error: "BREW_BATCH_NO_DEVICE" }, { status: 409 });
  }
  const deviceId = batch.deviceId;
  const brewBatchId = batch.id;

  // Лучшее-усилие даунсэмпл-персист телеметрии в brew_telemetry для LAN/sim-пути.
  // НИКОГДА не роняет стрим: вся работа с БД — внутри try/catch. Дедуп по seq и
  // троттлинг по времени держат частоту записи ~раз в PERSIST_INTERVAL_MS.
  let lastPersistAt = 0;
  let lastPersistedSeq = -1;
  const persistDownsampled = async (t: Telemetry): Promise<void> => {
    const nowMs = Date.now();
    if (nowMs - lastPersistAt < PERSIST_INTERVAL_MS) return;
    if (t.seq === lastPersistedSeq) return;
    lastPersistAt = nowMs;
    lastPersistedSeq = t.seq;
    try {
      await db.insert(brewTelemetry).values({
        deviceId,
        brewBatchId,
        // ts устройства — SNTP wall-clock в секундах; при отсутствии (0) берём now.
        ts: t.ts > 0 ? new Date(t.ts * 1000) : new Date(),
        seq: t.seq,
        stage: t.stage,
        primaryC: t.primary.valid ? t.primary.c : null,
        setpointC: t.setpointC,
        heatDutyPct: t.heatDutyPct,
        payload: t as unknown as Record<string, unknown>
      }).onConflictDoNothing({ target: [brewTelemetry.deviceId, brewTelemetry.brewBatchId, brewTelemetry.seq] });
    } catch {
      // best-effort: ошибка БД не должна прерывать SSE-стрим телеметрии
    }
  };

  const provider = getProvider("brewforge");
  if (!provider?.readTelemetry) {
    return NextResponse.json({ error: "PROVIDER_UNAVAILABLE" }, { status: 503 });
  }
  const readTelemetry = provider.readTelemetry;
  const userId = user.id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // контроллер уже закрыт — игнорируем
        }
      };
      request.signal.addEventListener("abort", close);

      const send = (frame: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          closed = true;
        }
      };

      try {
        while (!closed && !request.signal.aborted) {
          try {
            const telemetry = await readTelemetry({ userId, deviceId });
            if (telemetry) {
              send(`data: ${JSON.stringify(telemetry)}\n\n`);
              // Даунсэмпл-персист — в фоне, без блокировки и без ретроу в стрим.
              void persistDownsampled(telemetry);
            } else {
              send(`event: offline\ndata: {}\n\n`);
            }
          } catch (error) {
            // Наружу — стабильный код (без утечки внутренних деталей); реальную
            // причину логируем только на сервере, как и в остальных роутах.
            console.error("[telemetry-sse] сбой чтения телеметрии:", error);
            send(`event: error\ndata: {"error":"TELEMETRY_READ_FAILED"}\n\n`);
          }
          await sleep(POLL_INTERVAL_MS);
        }
      } finally {
        close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    }
  });
}
