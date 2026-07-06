import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { findDeviceByToken } from "@/features/devices/service";
import { getPublishedReleaseFile } from "@/features/firmware/service";

// GET /api/firmware/download/<version> — стрим .bin релиза прошивки (F2, спека
// §5.1). Авторизация: Authorization: Bearer <device-token> — тот же per-device
// токен, что для LAN/MQTT (сверка по tokenHash, findDeviceByToken). Раздаются
// ТОЛЬКО опубликованные и не отозванные релизы. Прогресс/статус OTA — не здесь
// (устройство рапортует в MQTT .../log).

/** Устройство по Bearer-токену запроса; null — нет/невалидный токен. */
async function authenticateDevice(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  return findDeviceByToken(match[1]!.trim());
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ version: string }> },
) {
  const device = await authenticateDevice(request);
  if (!device) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { version } = await params;

  try {
    const found = await getPublishedReleaseFile(version);
    if (!found) {
      return NextResponse.json({ error: "RELEASE_NOT_FOUND" }, { status: 404 });
    }
    const { release, filePath } = found;

    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat?.isFile()) {
      // Запись есть, файла нет (стор перенесли/почистили) — это сбой сервера, не 404.
      console.error(`[firmware-download] нет файла релиза ${release.version}`);
      return NextResponse.json({ error: "RELEASE_FILE_MISSING" }, { status: 500 });
    }

    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(fileStat.size),
        "content-disposition": `attachment; filename="${release.fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error(
      "[firmware-download] сбой раздачи:",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
