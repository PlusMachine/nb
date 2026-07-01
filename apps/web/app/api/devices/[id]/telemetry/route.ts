import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getDeviceById } from "@/features/devices/service";
import { subscribeDeviceTelemetry, type TelemetryFrame } from "@/features/brew-controller/device-telemetry-cache";

// SSE-стрим живой телеметрии устройства (зона B, пульт L2). В отличие от
// batch-стрима (зона A), НЕ привязан к партии — показывает живой нагрев прямо с
// устройства. Подписывается на ОБЩИЙ поллер устройства (device-telemetry-cache):
// один loop на устройство с фан-аутом, а не отдельный опрос на каждый стрим.
//
// Кадры (text/event-stream) — тот же контракт, что и у batch-стрима:
//   data: <Telemetry-json>\n\n         — валидный снимок телеметрии
//   event: offline\n data: {}\n\n      — устройство не отдало валидной телеметрии
//   event: error\n data: {"error":..}  — ошибка транспорта/провайдера на итерации

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const device = await getDeviceById(user.id, id);
  if (!device) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const userId = user.id;
  const deviceId = device.id;
  const providerId = device.providerId;

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

      unsubscribe = subscribeDeviceTelemetry({ userId, deviceId, providerId }, (frame: TelemetryFrame) => {
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
