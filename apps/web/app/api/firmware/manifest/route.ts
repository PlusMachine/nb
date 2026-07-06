import { NextResponse } from "next/server";

import { findDeviceByToken } from "@/features/devices/service";
import { buildManifestFor } from "@/features/firmware/service";

// GET /api/firmware/manifest?current=<ver> — pull-проверка обновлений (F2,
// спека §5.2). Авторизация device-токеном (Bearer, tokenHash-сверка). Ответ:
//   { "schema": 1, "updateAvailable": false }
//   { "schema": 1, "updateAvailable": true, "latest": { version, url, sha256,
//     size, protocolSchema, notes } }
// Основной канал оповещения — retained brewforge/<id>/update (публикует мост);
// манифест — резервный pull-путь для устройства/отладки.

export async function GET(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const device = match ? await findDeviceByToken(match[1]!.trim()) : null;
  if (!device) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const current = new URL(request.url).searchParams.get("current");
  if (!current) {
    return NextResponse.json({ error: "MISSING_CURRENT" }, { status: 400 });
  }

  try {
    const manifest = await buildManifestFor(current);
    return NextResponse.json(manifest);
  } catch (error) {
    console.error(
      "[firmware-manifest] сбой:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
