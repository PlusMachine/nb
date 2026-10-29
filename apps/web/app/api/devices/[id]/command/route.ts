import { NextResponse } from "next/server";

import { CommandSchema } from "@nb/brewforge-protocol";

import { requireUser } from "@/lib/auth";
import { getDeviceById } from "@/features/devices/service";
import { getProviderForDevice } from "@/features/brew-controller";
import { assertDeviceCommandAuthorized } from "@/features/brew-controller/command-authorization";
import { describeStartBrewError } from "@/features/brew-controller/messages";

// Коды ошибок транспорта/провайдера → человекочитаемый текст. НЕ эхоим внутренние
// детали (EGRESS_*/HTTP-тела/SSRF) — только общий смысл. Зеркалит batch-роут.
function describeCommandError(message: string): string {
  switch (message) {
    case "CLOUD_NO_ACK":
      return "Устройство не подтвердило команду — похоже, оно не в сети. Проверьте связь контроллера.";
    case "CLOUD_BROKER_UNREACHABLE":
      return "Нет связи с облачным сервисом управления. Повторите чуть позже.";
    case "CLOUD_UNSUPPORTED":
      return "Эта операция по облаку пока недоступна — выполните её, находясь в одной сети с устройством.";
    case "DEVICE_NO_LOCAL_URL":
      return "У устройства не задан локальный адрес, а связь через облако недоступна. Укажите адрес устройства в настройках или настройте облачное подключение.";
    case "DEVICE_NOT_FOUND":
      return "Устройство не найдено или не привязано к вам.";
    case "PROVIDER_UNAVAILABLE":
      return "Контроллер недоступен. Повторите попытку позже.";
    default:
      return "Не удалось отправить команду. Проверьте, что устройство в сети и доступно.";
  }
}

// POST /api/devices/:id/command — отправить команду на устройство напрямую (зона B,
// БЕЗ партии). Тело: { command: Command } (валидируется CommandSchema).
//
// СЕРВЕРНЫЙ FRESHNESS-ГЕЙТ (граница безопасности, не UX): опасные команды
// (START_BREW/AUTOTUNE/MANUAL_HEAT-on/PWM-вверх — commandRequiresFreshTelemetry)
// пропускаем ТОЛЬКО при свежей телеметрии; при stale/offline → 409 DEVICE_STALE.
// Fail-safe команды (ESTOP/STOP/PAUSE/CLEAR_FAULT/…) проходят всегда. Клиентский
// controlsDisabled — лишь подсказка; настоящий гейт здесь (обходится прямым POST).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const device = await getDeviceById(user.id, id);
    if (!device) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const body = await request.json();
    const command = CommandSchema.parse(body?.command);
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";

    const provider = getProviderForDevice(device);
    if (!provider?.sendCommand) {
      return NextResponse.json({ error: "PROVIDER_UNAVAILABLE" }, { status: 503 });
    }

    await assertDeviceCommandAuthorized({
      userId: user.id, deviceId: device.id, providerId: device.providerId, sessionId, command
    });

    const ack = await provider.sendCommand({
      userId: user.id,
      deviceId: device.id,
      command,
      sessionId,
    });

    return NextResponse.json({ ack });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "UNKNOWN";
    if (raw === "NO_CONTROL_LEASE" || raw === "DEVICE_STALE") {
      return NextResponse.json({ error: describeStartBrewError(error), code: raw }, { status: 409 });
    }
    console.error("[device-command] сбой отправки команды:", raw);
    return NextResponse.json({ error: describeCommandError(raw) }, { status: 400 });
  }
}
