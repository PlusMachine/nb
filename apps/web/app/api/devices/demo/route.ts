import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { createDemoDevice } from "@/features/devices/service";
import { mapDeviceError } from "@/features/devices/errors";

// POST /api/devices/demo — создать/переиспользовать демо-пивоварню без железа.
// Доступно всегда: в dev — loopback device-sim, в prod — in-process стаб-провайдер
// brewforge-demo (Phase 4.5). Идемпотентно на пользователя (hardwareId=demo-<userId>).
export async function POST() {
  const user = await requireUser();

  try {
    const device = await createDemoDevice(user.id);
    return NextResponse.json({ device }, { status: 201 });
  } catch (error) {
    const { status, code } = mapDeviceError(error);
    return NextResponse.json({ error: code }, { status });
  }
}
