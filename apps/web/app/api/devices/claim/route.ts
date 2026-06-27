import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { claimDevice } from "@/features/devices/service";
import { claimDeviceSchema } from "@/features/devices/contracts";
import { mapDeviceError } from "@/features/devices/errors";

// POST /api/devices/claim — привязать устройство к пользователю и выдать
// одноразовый bearer-токен. Тело валидируется claimDeviceSchema (claimCode по
// умолчанию обязателен; «голый» hardwareId — лишь под флагом, см. service.ts).
// В ответе device + plaintext-токен, который показывается пользователю РОВНО один
// раз (в БД хранится только его хэш). Ошибки маппятся по коду (см. errors.ts).
export async function POST(request: Request) {
  const user = await requireUser();

  try {
    const body = await request.json();
    const parsed = claimDeviceSchema.parse(body);
    const result = await claimDevice({ ...parsed, userId: user.id });
    // result = { device, token } — token отдаётся один раз для отображения.
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const { status, code } = mapDeviceError(error);
    return NextResponse.json({ error: code }, { status });
  }
}
