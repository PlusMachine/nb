import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getBrewBatchById, getDeviceTelemetryHistory } from "@/features/brew-batches/service";
import { TELEMETRY_HISTORY_LIMIT } from "@/features/brew-batches/contracts";

// GET /api/brew-batches/:id/telemetry/history — историческая телеметрия партии
// для графиков. requireUser + проверка владения партией (getBrewBatchById).
// Отдаёт до N последних точек устройства (oldest→newest): ts (epoch-мс), primaryC,
// setpointC, heatDutyPct, stage. Если к партии не привязано устройство — пустой
// список (график покажет «нет данных»).
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const batch = await getBrewBatchById(user.id, id);
  if (!batch) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (!batch.deviceId) {
    return NextResponse.json({ points: [] });
  }

  const points = await getDeviceTelemetryHistory(batch.deviceId, batch.id, TELEMETRY_HISTORY_LIMIT);
  return NextResponse.json({ points });
}
