import { NextResponse } from "next/server";

import { DeviceConfigPatchSchema } from "@nb/brewforge-protocol";

import { requireUser } from "@/lib/auth";
import { getProvider } from "@/features/brew-controller";
import { getDeviceById } from "@/features/devices/service";
import { mapDeviceError } from "@/features/devices/errors";

// =============================================================================
//  /api/devices/:id/config — синхронизация настраиваемого конфига §6.3 устройства.
//  Ownership-checked (requireUser + getDeviceById по userId). Безопасный клампинг
//  и интерлоки §5 — на устройстве; портал лишь читает/пишет форму конфига.
//
//  GET → provider.readConfig (LAN GET /config) → { config } | 502, если недоступно.
//  PUT → DeviceConfigPatchSchema.partial-валидация тела → provider.writeConfig
//        (LAN PUT /config) → { config } (эффективный, клампнутый прошивкой).
// =============================================================================

// GET /api/devices/:id/config — прочитать текущий конфиг устройства.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const device = await getDeviceById(user.id, id);
    if (!device) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const provider = getProvider("brewforge");
    if (!provider?.readConfig) {
      return NextResponse.json({ error: "PROVIDER_UNAVAILABLE" }, { status: 503 });
    }

    const config = await provider.readConfig({ userId: user.id, deviceId: id });
    if (!config) {
      // Устройство ответило, но валидного конфига нет (недоступно/не тот ответ).
      return NextResponse.json({ error: "DEVICE_UNREACHABLE" }, { status: 502 });
    }
    return NextResponse.json({ config });
  } catch (error) {
    const { status, code } = mapDeviceError(error);
    return NextResponse.json({ error: code }, { status });
  }
}

// PUT /api/devices/:id/config — записать (под)множество полей конфига.
// Тело: { config: <DeviceConfigPatch> } (допускаем и «голый» конфиг в корне).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const device = await getDeviceById(user.id, id);
    if (!device) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const provider = getProvider("brewforge");
    if (!provider?.writeConfig) {
      return NextResponse.json({ error: "PROVIDER_UNAVAILABLE" }, { status: 503 });
    }

    const body = (await request.json().catch(() => null)) as { config?: unknown } | null;
    const parsed = DeviceConfigPatchSchema.safeParse(body?.config ?? body);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const config = await provider.writeConfig({
      userId: user.id,
      deviceId: id,
      config: parsed.data,
    });
    return NextResponse.json({ config });
  } catch (error) {
    const { status, code } = mapDeviceError(error);
    return NextResponse.json({ error: code }, { status });
  }
}
