import { requireUser } from "@/lib/auth";
import { listDeviceTiles } from "@/features/devices/tiles";
import { DevicesManager } from "@/features/devices/components/devices-manager";

// L1 командный центр устройств BrewForge (грид плиток → статус → пульт).
// Серверная часть: requireUser → плитки (last-known срез + sparkline, ownership).
// tokenHash сюда не попадает (его нет в DTO/плитке).
export default async function DevicesPage() {
  const user = await requireUser();
  const tiles = await listDeviceTiles(user.id);

  // Демо-пивоварня доступна всегда: в dev — loopback device-sim, в prod — in-process
  // стаб-провайдер (Phase 4.5). Кнопку показываем всем («попробуй до покупки»).
  return <DevicesManager initialTiles={tiles} demoAvailable />;
}
