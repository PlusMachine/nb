import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { getDeviceById, getDeviceHistory, isDemoDevice } from "@/features/devices/service";
import { listPushableRecipes } from "@/features/devices/onboard-recipes";
import { deviceChannel } from "@/features/brew-controller";
import { DeviceConsole, type DeviceConsoleView } from "@/features/devices/components/device-console";

// Пульт устройства L2 (зона B): живой нагрев устройства БЕЗ привязки к партии +
// базовое управление (опасное гейтится на сервере). Серверно: requireUser →
// устройство (ownership) → начальная история телеметрии для графика.
export default async function DeviceConsolePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const device = await getDeviceById(user.id, id);
  if (!device) {
    notFound();
  }

  const [initialHistory, pushableRecipes] = await Promise.all([
    getDeviceHistory(user.id, device.id),
    listPushableRecipes(user.id),
  ]);

  const view: DeviceConsoleView = {
    id: device.id,
    name: device.name,
    hardwareId: device.hardwareId,
    providerId: device.providerId,
    status: device.status,
    fw: device.fw,
    localUrl: device.localUrl,
    mqttPrefix: device.mqttPrefix,
    capabilities: device.capabilities,
    lastSeenAt: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
    createdAt: device.createdAt.toISOString(),
    isDemo: isDemoDevice(device),
    channel: deviceChannel(device),
  };

  return (
    <DeviceConsole
      device={view}
      initialHistory={initialHistory}
      pushableRecipes={pushableRecipes}
    />
  );
}
