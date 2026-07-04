import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getBrewBatchById, getDeviceTelemetryHistory } from "@/features/brew-batches/service";
import { FERMENT_HISTORY_LIMIT, TELEMETRY_HISTORY_LIMIT } from "@/features/brew-batches/contracts";

// GET /api/brew-batches/:id/telemetry/history — историческая телеметрия партии
// для графиков. requireUser + проверка владения партией (getBrewBatchById).
// Отдаёт до N последних точек устройства (oldest→newest): ts (epoch-мс), primaryC,
// setpointC, heatDutyPct, stage. Если к партии не привязано устройство — пустой
// список (график покажет «нет данных»).
//
// ?windowDays=N (§14, график «план vs факт» ферментации, §8.4) — окно по времени
// вместо точечного лимита варочного дня (см. banner getDeviceTelemetryHistory,
// зеркалит /api/devices/:id/telemetry/history); без параметра поведение прежнее.
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const batch = await getBrewBatchById(user.id, id);
  if (!batch) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (!batch.deviceId) {
    return NextResponse.json({ points: [] });
  }

  const windowDaysRaw = Number(new URL(request.url).searchParams.get("windowDays"));
  const windowDays = Number.isFinite(windowDaysRaw) && windowDaysRaw > 0 ? windowDaysRaw : undefined;
  const limit = windowDays ? FERMENT_HISTORY_LIMIT : TELEMETRY_HISTORY_LIMIT;

  const points = await getDeviceTelemetryHistory(batch.deviceId, batch.id, limit, windowDays);
  return NextResponse.json({ points });
}
