import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { listDeviceTiles } from "@/features/devices/tiles";

// GET /api/devices/tiles — плитки L1 командного центра (last-known + sparkline) для
// лёгкого health-опроса грида: ОДИН запрос на все устройства пользователя (без
// per-tile SSE). requireUser + ownership внутри listDeviceTiles.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  const tiles = await listDeviceTiles(user.id);
  return NextResponse.json({ tiles });
}
