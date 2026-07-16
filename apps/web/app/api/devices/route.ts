import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { canUseDevices } from "@/features/devices/access";
import { listUserDevices } from "@/features/devices/service";
import { mapDeviceError } from "@/features/devices/errors";

// GET /api/devices — список устройств текущего пользователя (ownership-checked).
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "AUTH" }, { status: 401 });
  }

  // Раздел устройств в разработке: залогиненному без доступа отвечаем пустым
  // списком с флагом (НЕ 403 — его клиенты, например BrewPickerDialog, трактуют
  // как «нужен вход»), чтобы UI спрятал ветку устройств целиком.
  if (!canUseDevices(user.role)) {
    return NextResponse.json({ devices: [], devicesEnabled: false });
  }

  try {
    const devices = await listUserDevices(user.id);
    return NextResponse.json({ devices, devicesEnabled: true });
  } catch (error) {
    const { status, code } = mapDeviceError(error);
    return NextResponse.json({ error: code }, { status });
  }
}
