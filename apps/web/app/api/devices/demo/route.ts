import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { canUseDemoDevices } from "@/features/devices/access";
import { createDemoDevice } from "@/features/devices/service";
import { mapDeviceError } from "@/features/devices/errors";

// POST /api/devices/demo — создать/переиспользовать демо-пивоварню без железа.
// Только вне production: демо — инструмент внутренних тестов (canUseDemoDevices).
// Идемпотентно на пользователя (hardwareId=demo-<userId>).
export async function POST() {
  const user = await requireUser();
  if (!canUseDemoDevices()) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const device = await createDemoDevice(user.id);
    return NextResponse.json({ device }, { status: 201 });
  } catch (error) {
    const { status, code } = mapDeviceError(error);
    return NextResponse.json({ error: code }, { status });
  }
}
