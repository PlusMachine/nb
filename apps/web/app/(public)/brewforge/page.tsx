import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Radio, Thermometer, Timer } from "lucide-react";

import { buildMashHistory } from "@/components/demo/demo-data";
import { getSectionOgImage } from "@/features/og/section";
import { getServerEnv } from "@/lib/env";

// Тот же пульт и локальная симуляция, что в /demo. Динамический импорт оставляет
// симулятор отдельным клиентским чанком; подписи страницы рендерятся на сервере.
const DemoPult = dynamic(() => import("@/components/demo/demo-pult").then((mod) => mod.DemoPult));

const title = "BrewForge — автоматика варки";
const description =
  "Контроллер BrewForge ведёт варку по рецепту с сайта: нагрев, паузы затирания, таймеры хмеля. Проект в разработке.";

export const metadata: Metadata = {
  title,
  description,
  // Своего twitter не задаём — наследуется дефолт из корневого layout
  // (summary_large_image), картинка обложки раздела (Ф3) достаточна.
  // openGraph страницы ЗАМЕЩАЕТ openGraph родительского layout целиком (не
  // мёржится) — locale/siteName повторяем сами (см. app/(public)/page.tsx).
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: getServerEnv().SITE_NAME,
    url: "/brewforge",
    title,
    description,
    images: [getSectionOgImage("brewforge")]
  }
};

const features = [
  {
    icon: Thermometer,
    title: "Затирание по рецепту"
  },
  {
    icon: Timer,
    title: "Таймеры кипячения"
  },
  {
    icon: Radio,
    title: "Связь с сайтом"
  }
];

export default function BrewforgePage() {
  return (
    <main className="space-y-6 pb-24 pt-6 sm:space-y-8 sm:pt-8">
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">BrewForge</p>
          <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning-subtle px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-warning-subtle-foreground">
            в разработке
          </span>
        </div>
        <h1 className="mt-3 max-w-2xl text-balance text-3xl font-semibold leading-tight text-foreground sm:text-4xl" style={{ fontFamily: "var(--font-display)" }}>
          Автоматика для пивоварни
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
          Контроллер, который ведёт варку по рецепту с сайта: держит паузы затирания,
          управляет нагревом и отсчитывает время до внесения хмеля.
        </p>
      </section>

      <section className="dark rounded-2xl border border-border bg-card p-4 text-foreground [&_.text-6xl]:text-5xl sm:p-6 sm:[&_.text-6xl]:text-6xl">
        <DemoPult initialHistory={buildMashHistory(new Date())} />
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          Здесь можно попробовать управление на симуляторе. Время ускорено, настоящее оборудование не подключено.
        </p>
      </section>

      <section className="divide-y divide-border border-y border-border">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div key={feature.title} className="flex items-center gap-3 py-4">
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">{feature.title}</h2>
            </div>
          );
        })}
      </section>

      <div>
        <Link
          href="/login?next=/app/brew-batches"
          className="inline-flex min-h-11 items-center rounded-full bg-foreground px-5 py-3 text-center text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          Попробовать помощник варки
        </Link>
      </div>
    </main>
  );
}
