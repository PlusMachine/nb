import { assertRateLimit } from "@nb/auth";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { canUseDevices } from "@/features/devices/access";
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
  // Раздел устройств в разработке: пейринг в production доступен только админу.
  if (!canUseDevices(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Антибрутфорс claim-кода: без лимита залогиненный юзер мог бы перебирать коды
  // и перехватывать пейринг чужого устройства.
  try {
    await assertRateLimit(user.id, "device_claim", 15, 10 * 60);
  } catch {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

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
