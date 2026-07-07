import type { Metadata } from "next";
import { Suspense } from "react";
import { getBjcpCatalogData } from "@nb/content";

import { BjcpCatalog } from "@/components/content/bjcp-catalog";
import { BjcpStyleIndex } from "@/components/content/bjcp-style-index";

const title = "BJCP справочник стилей";
const description = "Поиск по стилям BJCP, режим семейной навигации для обычного пользователя и строгий просмотр по официальным категориям BJCP 2021.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/bjcp"
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    title,
    description,
    url: "/bjcp",
    siteName: "NB"
  }
};

export default async function BjcpPage() {
  const catalog = await getBjcpCatalogData();

  return (
    <main className="pb-24 pt-8">
      <Suspense
        fallback={
          <section className="space-y-6 rounded-[2.5rem] border border-border/80 bg-card/90 p-6 shadow-[0_45px_120px_-72px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
            <div className="h-12 animate-pulse rounded-[1.4rem] bg-muted" />
            <div className="flex flex-wrap gap-3">
              <div className="h-10 w-40 animate-pulse rounded-full bg-muted" />
              <div className="h-10 w-44 animate-pulse rounded-full bg-muted" />
              <div className="h-10 w-28 animate-pulse rounded-xl bg-muted" />
            </div>
            <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="h-64 animate-pulse rounded-[2rem] border border-border bg-muted" />
              ))}
            </div>
          </section>
        }
      >
        <BjcpCatalog catalog={catalog} />
      </Suspense>

      <BjcpStyleIndex catalog={catalog} />
    </main>
  );
}
