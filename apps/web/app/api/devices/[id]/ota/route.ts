import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getDeviceById } from "@/features/devices/service";
import { findUpdateFor, firmwareDownloadUrl } from "@/features/firmware/service";
import { getProviderForDevice } from "@/features/brew-controller";

// POST /api/devices/:id/ota — запустить обновление прошивки до последнего
// stable-релиза (F3, docs/brewforge-firmware-releases.md §5.4). URL скачивания
// строится СЕРВЕРОМ по реестру релизов (клиент URL не диктует). Доставка — через
// транспортный слой провайдера: облако → {"cmd":"ota","url"} в .../cmd, LAN →
// POST /ota на устройство. Настоящие гейты (IDLE-only, подпись, rollback) — на
// устройстве; прогресс прилетает в .../log и виден в журнале.

const ERROR_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  NO_UPDATE: 409,
  OTA_UNSUPPORTED: 503,
  CLOUD_BROKER_UNREACHABLE: 502,
};

function describeOtaError(message: string): string {
  switch (message) {
    case "NO_UPDATE":
      return "Обновление недоступно: устройство уже на последней версии или релизов ещё нет.";
    case "OTA_UNSUPPORTED":
      return "Для этого устройства обновление по сети недоступно.";
    case "CLOUD_BROKER_UNREACHABLE":
      return "Нет связи с облачным брокером. Повторите чуть позже.";
    case "DEVICE_NO_LOCAL_URL":
      return "У устройства не задан локальный адрес и облако недоступно.";
    default:
      return "Не удалось запустить обновление. Проверьте, что устройство в сети.";
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  try {
    const device = await getDeviceById(user.id, id);
    if (!device) {
      return NextResponse.json({ error: "NOT_FOUND", code: "NOT_FOUND" }, { status: 404 });
    }

    // Реестр скоуплен providerId устройства (демо-приборы обновлений не получают).
    const release = await findUpdateFor(device.fw, { providerId: device.providerId });
    if (!release) {
      return NextResponse.json(
        { error: describeOtaError("NO_UPDATE"), code: "NO_UPDATE" },
        { status: 409 },
      );
    }

    const provider = getProviderForDevice(device);
    if (!provider?.startOta) {
      return NextResponse.json(
        { error: describeOtaError("OTA_UNSUPPORTED"), code: "OTA_UNSUPPORTED" },
        { status: 503 },
      );
    }

    await provider.startOta({
      userId: user.id,
      deviceId: device.id,
      url: firmwareDownloadUrl(release.version),
    });

    return NextResponse.json({ started: true, version: release.version });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "UNKNOWN";
    console.error("[device-ota] сбой запуска OTA:", raw);
    const status = ERROR_STATUS[raw] ?? 400;
    return NextResponse.json({ error: describeOtaError(raw), code: raw }, { status });
  }
}
