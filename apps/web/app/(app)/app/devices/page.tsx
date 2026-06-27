import { requireUser } from "@/lib/auth";
import { listUserDevices } from "@/features/devices/service";
import { DevicesManager, type DeviceView } from "@/features/devices/components/devices-manager";

// Страница управления устройствами BrewForge.
// Серверная часть: requireUser → список устройств (ownership). Даты сериализуем
// в ISO-строки для клиентского компонента. tokenHash сюда не попадает (его нет в DTO).
export default async function DevicesPage() {
  const user = await requireUser();
  const devices = await listUserDevices(user.id);

  const initialDevices: DeviceView[] = devices.map((d) => ({
    id: d.id,
    name: d.name,
    hardwareId: d.hardwareId,
    fw: d.fw,
    status: d.status,
    localUrl: d.localUrl,
    mqttPrefix: d.mqttPrefix,
    lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null
  }));

  return <DevicesManager initialDevices={initialDevices} />;
}
