import { NextResponse } from "next/server";

import {
  mapFirmwareAdminError,
  publishFirmwareUpload,
  validateFirmwareUpload
} from "@/features/firmware/admin";
import { FIRMWARE_UPLOAD_MAX_BYTES, firmwareChannelSchema } from "@/features/firmware/contracts";
import { getSessionUser, hasRequiredRole } from "@/lib/auth";

// POST /api/admin/firmware/upload — публикация релиза прошивки из веб-формы.
// Почему роут, а не server action: образ ~2 МБ, а лимит тела server actions —
// 1 МБ по умолчанию (next.config.ts не трогаем).
//
// Роут НЕ трогает контракт с устройствами: раздача (manifest/download) и формат
// манифеста остаются как есть — здесь только приём файла и запись в реестр.
export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Требуется авторизация." }, { status: 401 });
  }
  if (!hasRequiredRole(user.role, "admin")) {
    return NextResponse.json({ ok: false, message: "Недостаточно прав." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "Не удалось прочитать файл." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Выберите файл прошивки." }, { status: 400 });
  }

  const version = String(formData.get("version") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const rawChannel = String(formData.get("channel") ?? "stable");
  const rawProtocolSchema = String(formData.get("protocolSchema") ?? "1");

  const channel = firmwareChannelSchema.safeParse(rawChannel);
  if (!channel.success) {
    return NextResponse.json({ ok: false, message: "Неизвестный канал релиза." }, { status: 400 });
  }

  const protocolSchema = Number.parseInt(rawProtocolSchema, 10);
  const validation = validateFirmwareUpload({
    fileName: file.name,
    fileSize: file.size,
    version,
    notes,
    channel: channel.data,
    protocolSchema
  });
  if (!validation.ok) {
    return NextResponse.json({ ok: false, message: validation.error }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    // Размер из File мог соврать (или тело пришло усечённым) — считаем по факту.
    if (bytes.byteLength === 0) {
      return NextResponse.json({ ok: false, message: "Файл прошивки пуст." }, { status: 400 });
    }
    if (bytes.byteLength > FIRMWARE_UPLOAD_MAX_BYTES) {
      const limitMb = Math.round(FIRMWARE_UPLOAD_MAX_BYTES / (1024 * 1024));
      return NextResponse.json(
        { ok: false, message: `Файл больше ${limitMb} МБ — это не образ BrewForge.` },
        { status: 413 }
      );
    }

    const release = await publishFirmwareUpload({
      bytes,
      fileName: file.name,
      fileSize: bytes.byteLength,
      version,
      notes,
      channel: channel.data,
      protocolSchema,
      actor: { id: user.id, email: user.email }
    });

    return NextResponse.json({ ok: true, version: release.version });
  } catch (error) {
    const message = mapFirmwareAdminError(error, version);
    const conflict = error instanceof Error && error.message.startsWith("RELEASE_ALREADY_EXISTS");
    if (!conflict) {
      console.error("[admin/firmware] публикация не удалась", error);
    }
    return NextResponse.json({ ok: false, message }, { status: conflict ? 409 : 400 });
  }
}
