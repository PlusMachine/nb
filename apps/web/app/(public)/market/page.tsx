import type { Metadata } from "next";

import { MarketItemCard } from "@/components/masters/public/market-item-card";
import { MasterShowcaseCta } from "@/components/masters/public/master-showcase-cta";
import { buildMarketListMetadata } from "@/features/masters/seo";
import { listPublishedMarketItems } from "@/features/masters/service";

// Товарный индекс маркета: изделия всех опубликованных мастеров, страница
// мастера /masters/[slug] — профиль продавца. Единицы — десятки изделий (§1 ТЗ):
// без фильтров/поиска/сортировок, витрина обозрима целиком. TTL как у /recipes —
// новые публикации не ждут деплоя, а модерация дёргает revalidatePath точечно.
export const revalidate = 300;

export const metadata: Metadata = buildMarketListMetadata();

export default async function MarketPage() {
  const items = await listPublishedMarketItems();

  return (
    <main className="space-y-8 py-8">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Маркет</h1>
        <p className="text-sm text-muted-foreground">
          Оборудование для пивоварения ручной работы — от мастеров из комьюнити, напрямую и без комиссий.
        </p>
      </section>

      {items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <MarketItemCard key={item.itemId} item={item} />
          ))}
        </div>
      ) : null}

      <MasterShowcaseCta />
    </main>
  );
}
