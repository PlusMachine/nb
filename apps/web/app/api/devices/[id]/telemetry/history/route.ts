import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getDeviceHistory } from "@/features/devices/service";
import { FERMENT_HISTORY_LIMIT, TELEMETRY_HISTORY_LIMIT } from "@/features/brew-batches/contracts";

// GET /api/devices/:id/telemetry/history — историческая телеметрия УСТРОЙСТВА для
// графика пульта L2 (зона B). requireUser + ownership внутри getDeviceHistory.
// Отдаёт до N последних точек устройства (oldest→newest); пусто, если чужое/нет.
//
// ?windowDays=N (§14, график «план vs факт» ферментации) — окно по времени вместо
// точечного лимита варки/дистилляции (см. banner getDeviceHistory); без параметра
// поведение не меняется — те же «последние N точек», что и раньше.
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const windowDaysRaw = Number(new URL(request.url).searchParams.get("windowDays"));
  const windowDays = Number.isFinite(windowDaysRaw) && windowDaysRaw > 0 ? windowDaysRaw : undefined;
  const limit = windowDays ? FERMENT_HISTORY_LIMIT : TELEMETRY_HISTORY_LIMIT;

  const points = await getDeviceHistory(user.id, id, limit, windowDays);
  return NextResponse.json({ points });
}
