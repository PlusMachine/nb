import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getBrewBatchById } from "@/features/brew-batches/service";
import { subscribeDeviceTelemetry, type TelemetryFrame } from "@/features/brew-controller/device-telemetry-cache";

// SSE-стрим телеметрии партии варки (зона A). Резолвим партию (ownership) → её
// устройство (brew_batches.deviceId) и подписываемся на ОБЩИЙ поллер устройства
// (device-telemetry-cache) — тот же loop, что и у пульта L2 зоны B. Так на
// устройство работает ровно один опрос независимо от числа открытых экранов, а
// даунсэмпл-персист истории делает сам хаб (см. device-telemetry-cache.ts).
//
// Облачный путь (Phase 3, мост): вместо опроса LAN — подписка на WS моста;
// контракт SSE-кадров наружу остаётся тем же.
//
// Кадры (text/event-stream):
//   data: <Telemetry-json>\n\n         — валидный снимок телеметрии
//   event: offline\n data: {}\n\n      — устройство не отдало валидной телеметрии
//   event: error\n data: {"error":..}  — ошибка транспорта/провайдера на итерации

export const dynamic = "force-dynamic";

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
  const userId = user.id;
  const deviceId = batch.deviceId;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | null = null;

      const close = () => {
        if (closed) return;
        closed = true;
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          // контроллер уже закрыт — игнорируем
        }
      };

      const send = (frame: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          close();
        }
      };

      request.signal.addEventListener("abort", close);

      unsubscribe = subscribeDeviceTelemetry({ userId, deviceId }, (frame: TelemetryFrame) => {
        if (frame.type === "telemetry") {
          send(`data: ${JSON.stringify(frame.data)}\n\n`);
        } else if (frame.type === "offline") {
          send(`event: offline\ndata: {}\n\n`);
        } else {
          send(`event: error\ndata: {"error":"${frame.error}"}\n\n`);
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
