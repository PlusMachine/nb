import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getDeviceById } from "@/features/devices/service";
import { isLeaseAction, runLeaseAction } from "@/features/brew-controller/control-lease";

// POST /api/devices/:id/control-lease — операции single-writer аренды устройства
// (зона B). Тело: { action: "acquire"|"heartbeat"|"release"|"request-takeover"|
// "status", sessionId }. Возвращает LeaseStatus. Ownership — getDeviceById.
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const device = await getDeviceById(user.id, id);
  if (!device) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    sessionId?: unknown;
  } | null;

  const action = body?.action;
  const sessionId = body?.sessionId;
  if (!isLeaseAction(action) || typeof sessionId !== "string" || sessionId.length === 0) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const status = await runLeaseAction(device.id, { userId: user.id, sessionId }, action);
  return NextResponse.json({ lease: status });
}
