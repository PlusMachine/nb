import { requireUser } from "@/lib/auth";
import { canUseDemoDevices, canUseDevices } from "@/features/devices/access";
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

  // Раздел в разработке: связки с реальным железом не проверены в поле —
  // в production доступ только у админа (см. features/devices/access.ts).
  if (!canUseDevices(user.role)) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
          Устройства
        </h1>
        <p className="text-sm text-muted-foreground">
          Раздел в разработке: подключение BrewForge и цифровых ареометров скоро откроется.
        </p>
      </div>
    );
  }

  const tiles = await listDeviceTiles(user.id);

  // Ф7: пришли из BrewPickerDialog → «Подключить BrewForge» с контекстом варки
  // (?returnRecipe=<id>) — недоступный/удалённый рецепт молча даёт null, без баннера.
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const returnRecipeId = resolvedSearchParams?.returnRecipe;
  const returnRecipe = returnRecipeId ? await loadDeviceReturnRecipe(user.id, returnRecipeId) : null;

  // Демо-устройства — только вне production (внутренние тесты); серверный гейт
  // продублирован в /api/devices/demo и createDemoStreamDeviceAction.
  return (
    <DevicesManager
      initialTiles={tiles}
      demoAvailable={canUseDemoDevices()}
      preferredGravityUnit={user.preferredGravityUnit}
      returnRecipe={returnRecipe}
    />
  );
}
