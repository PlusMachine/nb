import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getBrewBatchById } from "@/features/brew-batches/service";
import { isLeaseAction, runLeaseAction } from "@/features/brew-controller/control-lease";

// POST /api/brew-batches/:id/control-lease — операции control-lease из зоны A
// (варка партии). Резолвим партию (ownership) → её устройство и делегируем в тот
// же диспетчер, что и device-роут: аренда — на УСТРОЙСТВО, поэтому зоны A и B
// делят одно владение. Тело: { action, sessionId } → LeaseStatus.
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const batch = await getBrewBatchById(user.id, id);
  if (!batch) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!batch.deviceId) {
    return NextResponse.json({ error: "BREW_BATCH_NO_DEVICE" }, { status: 409 });
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

  const status = await runLeaseAction(batch.deviceId, { userId: user.id, sessionId }, action);
  return NextResponse.json({ lease: status });
}
