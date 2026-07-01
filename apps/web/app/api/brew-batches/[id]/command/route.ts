import { NextResponse } from "next/server";

import { CommandSchema } from "@nb/brewforge-protocol";

import { requireUser } from "@/lib/auth";
import { getBrewBatchById } from "@/features/brew-batches/service";
import { getProvider } from "@/features/brew-controller";
import {
  commandRequiresFreshTelemetry,
  commandRequiresLease,
} from "@/features/brew-controller/command-gate";
import { readFreshTelemetry } from "@/features/brew-controller/device-telemetry-cache";
import { holdsValidLease } from "@/features/brew-controller/control-lease";

// Коды ошибок транспорта/провайдера → человекочитаемый текст для дашборда.
// НЕ эхоим внутренние детали (EGRESS_*/HTTP-тела/SSRF) — только общий смысл.
function describeCommandError(message: string): string {
  switch (message) {
    case "CLOUD_NO_ACK":
      return "Устройство не подтвердило команду — похоже, оно не в сети. Проверьте связь контроллера.";
    case "CLOUD_BROKER_UNREACHABLE":
      return "Нет связи с облачным брокером. Повторите чуть позже.";
    case "CLOUD_UNSUPPORTED":
      return "Эта операция по облаку пока недоступна — выполните её, находясь в одной сети с устройством.";
    case "DEVICE_NO_LOCAL_URL":
      return "У устройства не задан локальный адрес и облако недоступно. Допривяжите устройство или включите облачный путь.";
    case "DEVICE_NOT_FOUND":
      return "Устройство не найдено или не привязано к вам.";
    case "PROVIDER_UNAVAILABLE":
      return "Контроллер недоступен. Повторите попытку позже.";
    default:
      return "Не удалось отправить команду. Проверьте, что устройство в сети и доступно.";
  }
}

// POST /api/brew-batches/:id/command — отправить команду на устройство партии.
// Тело: { command: Command } (валидируется CommandSchema). Резолвим партию
// (ownership) → её устройство → getProvider('brewforge').sendCommand(...).
// Возвращаем Ack (в т.ч. nack ok:false — это валидный ответ, не ошибка HTTP).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const batch = await getBrewBatchById(user.id, id);
    if (!batch) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    if (!batch.deviceId) {
      return NextResponse.json({ error: "BREW_BATCH_NO_DEVICE" }, { status: 409 });
    }

    const body = await request.json();
    const command = CommandSchema.parse(body?.command);
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";

    const provider = getProvider("brewforge");
    if (!provider?.sendCommand) {
      return NextResponse.json({ error: "PROVIDER_UNAVAILABLE" }, { status: 503 });
    }

    // Hard lease-гейт (single-writer, та же граница, что и у device-роута):
    // управляющие команды — только у держателя аренды устройства партии.
    if (commandRequiresLease(command)) {
      const holds = sessionId
        ? await holdsValidLease(batch.deviceId, { userId: user.id, sessionId })
        : false;
      if (!holds) {
        return NextResponse.json(
          {
            error:
              "Управление устройством занято другим сеансом. Запросите перехват, чтобы взять контроль.",
            code: "NO_CONTROL_LEASE",
          },
          { status: 409 },
        );
      }
    }

    // Серверный freshness-гейт (та же граница, что и у device-роута): опасные
    // команды — только при свежей телеметрии. Fail-safe (ESTOP/PAUSE/…) — всегда.
    if (commandRequiresFreshTelemetry(command)) {
      const fresh = await readFreshTelemetry({ userId: user.id, deviceId: batch.deviceId });
      if (!fresh) {
        return NextResponse.json(
          {
            error:
              "Нет свежей телеметрии устройства — эта команда заблокирована до восстановления связи.",
            code: "DEVICE_STALE",
          },
          { status: 409 },
        );
      }
    }

    const ack = await provider.sendCommand({
      userId: user.id,
      deviceId: batch.deviceId,
      brewBatchId: batch.id,
      command
    });

    return NextResponse.json({ ack });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "UNKNOWN";
    // Реальную причину — в серверный лог; наружу только безопасный текст.
    console.error("[brew-command] сбой отправки команды:", raw);
    return NextResponse.json({ error: describeCommandError(raw) }, { status: 400 });
  }
}
