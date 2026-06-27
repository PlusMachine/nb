import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { getBrewBatchById, getDeviceTelemetryHistory } from "@/features/brew-batches/service";
import { getDeviceById } from "@/features/devices/service";
import { LiveDashboard } from "@/features/brew-batches/components/live-dashboard";
import { TelemetryChart } from "@/features/brew-batches/components/telemetry-chart";

// Живой дашборд варки на устройстве BrewForge + исторический график.
// Серверная часть: requireUser → партия (ownership) → привязанное устройство →
// серверно-загруженная начальная история телеметрии. Живые данные/команды и
// дальнейшее обновление графика идут из клиентских компонентов через API-роуты.
export default async function BrewBatchLivePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const batch = await getBrewBatchById(user.id, id);
  if (!batch) {
    notFound();
  }

  const device = batch.deviceId ? await getDeviceById(user.id, batch.deviceId) : null;
  const initialHistory = batch.deviceId ? await getDeviceTelemetryHistory(batch.deviceId, batch.id) : [];

  return (
    <div className="space-y-6">
      <LiveDashboard
        brewBatchId={batch.id}
        batchName={batch.name}
        recipeTitle={batch.brewPlanSnapshot.recipe.title}
        deviceName={device?.name ?? null}
        hasDevice={Boolean(batch.deviceId)}
      />

      <TelemetryChart
        brewBatchId={batch.id}
        hasDevice={Boolean(batch.deviceId)}
        initial={initialHistory}
      />
    </div>
  );
}
