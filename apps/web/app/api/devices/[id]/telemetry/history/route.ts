import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getDeviceHistory } from "@/features/devices/service";
import { TELEMETRY_HISTORY_LIMIT } from "@/features/brew-batches/contracts";

// GET /api/devices/:id/telemetry/history — историческая телеметрия УСТРОЙСТВА для
// графика пульта L2 (зона B). requireUser + ownership внутри getDeviceHistory.
// Отдаёт до N последних точек устройства (oldest→newest); пусто, если чужое/нет.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const points = await getDeviceHistory(user.id, id, TELEMETRY_HISTORY_LIMIT);
  return NextResponse.json({ points });
}
