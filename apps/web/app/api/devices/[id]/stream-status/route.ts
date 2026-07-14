import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getStreamDeviceStatus } from "@/features/device-streams/service";

// GET /api/devices/:id/stream-status — лёгкий поллинг живой зоны страницы
// стрим-устройства (§5 F1: «Ждём первый пакет…» раз в 5 с, пока readingsCount=0).
// Ownership-checked внутри getStreamDeviceStatus (NOT_FOUND — чужое или не
// стрим-устройство). no-store: значение живое, кэшировать нечего.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const status = await getStreamDeviceStatus(user.id, id);
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    console.error("[device-streams] stream-status error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
