import { requireUser } from "@/lib/auth";
import { listDeviceTiles } from "@/features/devices/tiles";
import { DevicesManager } from "@/features/devices/components/devices-manager";
import { loadDeviceReturnRecipe } from "@/features/devices/return-recipe";

// L1 командный центр устройств BrewForge (грид плиток → статус → пульт).
// Серверная часть: requireUser → плитки (last-known срез + sparkline, ownership).
// tokenHash сюда не попадает (его нет в DTO/плитке).
export default async function DevicesPage({
  searchParams
}: {
  searchParams?: Promise<{ returnRecipe?: string }>;
}) {
  const user = await requireUser();
  const tiles = await listDeviceTiles(user.id);

  // Ф7: пришли из BrewPickerDialog → «Подключить BrewForge» с контекстом варки
  // (?returnRecipe=<id>) — недоступный/удалённый рецепт молча даёт null, без баннера.
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const returnRecipeId = resolvedSearchParams?.returnRecipe;
  const returnRecipe = returnRecipeId ? await loadDeviceReturnRecipe(user.id, returnRecipeId) : null;

  // Демо-пивоварня доступна всегда: в dev — loopback device-sim, в prod — in-process
  // стаб-провайдер (Phase 4.5). Кнопку показываем всем («попробуй до покупки»).
  return (
    <DevicesManager
      initialTiles={tiles}
      demoAvailable
      preferredGravityUnit={user.preferredGravityUnit}
      returnRecipe={returnRecipe}
    />
  );
}
