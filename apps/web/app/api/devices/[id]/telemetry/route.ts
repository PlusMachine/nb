import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getDeviceById } from "@/features/devices/service";
import { telemetryEventResponse } from "@/features/brew-controller/telemetry-event-response";

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

  return telemetryEventResponse(request.signal, { userId: user.id, deviceId: device.id, providerId: device.providerId });
}
