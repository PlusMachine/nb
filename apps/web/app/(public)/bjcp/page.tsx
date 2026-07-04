import type { Metadata } from "next";
import { Suspense } from "react";
import { getBjcpCatalogData } from "@nb/content";

import { BjcpCatalog } from "@/components/content/bjcp-catalog";

export const metadata: Metadata = {
  title: "BJCP справочник стилей",
  description: "Поиск по стилям BJCP, режим семейной навигации для обычного пользователя и строгий просмотр по официальным категориям BJCP 2021."
};

export default async function BjcpPage() {
  const catalog = await getBjcpCatalogData();

  return (
    <main className="pb-24 pt-8">
      <Suspense
        fallback={
          <section className="space-y-6 rounded-[2.5rem] border border-white/80 bg-white/90 p-6 shadow-[0_45px_120px_-72px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
            <div className="h-12 animate-pulse rounded-[1.4rem] bg-zinc-100" />
            <div className="flex flex-wrap gap-3">
              <div className="h-10 w-40 animate-pulse rounded-full bg-zinc-100" />
              <div className="h-10 w-44 animate-pulse rounded-full bg-zinc-100" />
              <div className="h-10 w-28 animate-pulse rounded-xl bg-zinc-100" />
            </div>
            <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="h-64 animate-pulse rounded-[2rem] border border-zinc-100 bg-zinc-50" />
              ))}
            </div>
          </section>
        }
      >
        <BjcpCatalog catalog={catalog} />
      </Suspense>
    </main>
  );
}
