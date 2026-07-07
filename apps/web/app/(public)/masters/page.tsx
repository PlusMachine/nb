import type { Metadata } from "next";

import { MasterCard } from "@/components/masters/public/master-card";
import { MasterShowcaseCta } from "@/components/masters/public/master-showcase-cta";
import { buildMastersListMetadata } from "@/features/masters/seo";
import { listPublishedMasters } from "@/features/masters/service";

// Единицы — пара десятков мастеров (§1 ТЗ): без фильтров/поиска/сортировок,
// вся витрина обозрима целиком. TTL как у /recipes — новые публикации не ждут
// деплоя, а approveMasterProfile при желании может дёрнуть revalidatePath точечно.
export const revalidate = 300;

export const metadata: Metadata = buildMastersListMetadata();

export default async function MastersPage() {
  const masters = await listPublishedMasters();

  return (
    <main className="space-y-8 py-8">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Мастера</h1>
        <p className="text-sm text-muted-foreground">
          Оборудование для пивоварения ручной работы — от мастеров из комьюнити.
        </p>
      </section>

      {masters.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {masters.map((master) => (
            <MasterCard key={master.id} master={master} />
          ))}
        </div>
      ) : null}

      <MasterShowcaseCta />
    </main>
  );
}
