import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { revokeDevice } from "@/features/devices/service";
import { mapDeviceError } from "@/features/devices/errors";

// DELETE /api/devices/:id — отозвать доступ устройства (обнулить tokenHash,
// пометить offline). Ownership-checked по userId; история телеметрии сохраняется.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const device = await revokeDevice(user.id, id);
    return NextResponse.json({ device });
  } catch (error) {
    const { status, code } = mapDeviceError(error);
    return NextResponse.json({ error: code }, { status });
  }
}
