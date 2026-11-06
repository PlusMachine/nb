import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getBrewBatchById } from "@/features/brew-batches/service";
import { telemetryEventResponse } from "@/features/brew-controller/telemetry-event-response";

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
  return telemetryEventResponse(request.signal, { userId: user.id, deviceId: batch.deviceId });
}
