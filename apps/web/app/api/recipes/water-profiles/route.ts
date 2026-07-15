import { NextResponse } from "next/server";

import { getUserWaterProfiles, saveUserWaterProfiles } from "@/features/recipes/service";
import { requireUser } from "@/lib/auth";

// Ф11 (notes/water-wizard-fixes.md): «сохранённые профили воды — в аккаунт».
// Раньше жили только в localStorage браузера мастера воды. GET отдаёт текущий
// список пользователя, PUT — перезаписывает его целиком (визард всегда шлёт
// актуальный снимок обоих списков). Санитизация/дедуп/кап — на сервере
// (sanitizeUserWaterProfiles), клиент — лишь оптимистичный слой поверх.

export async function GET() {
  const user = await requireUser();
  const profiles = await getUserWaterProfiles(user.id);
  return NextResponse.json(profiles);
}

export async function PUT(request: Request) {
  const user = await requireUser();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const profiles = await saveUserWaterProfiles(user.id, body);
    return NextResponse.json(profiles);
  } catch (error) {
    const message = (error as Error).message;
    if (message === "RATE_LIMITED") {
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
