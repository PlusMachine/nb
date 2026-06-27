import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { listUserDevices } from "@/features/devices/service";
import { mapDeviceError } from "@/features/devices/errors";

// GET /api/devices — список устройств текущего пользователя (ownership-checked).
export async function GET() {
  const user = await requireUser();

  try {
    const devices = await listUserDevices(user.id);
    return NextResponse.json({ devices });
  } catch (error) {
    const { status, code } = mapDeviceError(error);
    return NextResponse.json({ error: code }, { status });
  }
}
