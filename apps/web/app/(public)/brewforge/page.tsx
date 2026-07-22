import type { Metadata } from "next";
import Link from "next/link";
import { Radio, Thermometer, Timer } from "lucide-react";

import { getSectionOgImage } from "@/features/og/section";
import { getServerEnv } from "@/lib/env";

// Промо-страница BrewForge — пока заглушка: контроллер в разработке, продаж нет.
// Сюда ведёт CTA из секции BrewForge на главной; позже здесь появится полноценный
// материал про железо, прошивку и сборку.

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
    title: "Затирание по профилю",
    text: "Подъёмы и паузы берутся из рецепта — контроллер управляет нагревом и держит целевую температуру"
  },
  {
    icon: Timer,
    title: "Таймеры кипячения",
    text: "Внесения хмеля по расписанию рецепта — с отсчётом и напоминаниями"
  },
  {
    icon: Radio,
    title: "Связь с сайтом",
    text: "Рецепт загружается в контроллер, а ход варки виден на экране телефона"
  }
];

export default function BrewforgePage() {
  return (
    <main className="space-y-8 pb-24 pt-8">
      <section className="rounded-[2rem] bg-[#141417] p-8 text-zinc-100 sm:p-12">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">BrewForge</p>
          <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-300">
            в разработке
          </span>
        </div>
        <h1 className="mt-4 max-w-2xl text-balance text-4xl font-semibold leading-[1.02] sm:text-5xl" style={{ fontFamily: "var(--font-display)" }}>
          Автоматика варочного дня
        </h1>
        <p className="mt-5 max-w-2xl text-pretty text-lg leading-8 text-zinc-400">
          Контроллер, который ведёт варку по рецепту с сайта: держит паузы затирания,
          управляет нагревом и отсчитывает внесения хмеля.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div key={feature.title} className="rounded-[1.25rem] border border-border bg-card p-5 shadow-sm">
              <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-foreground text-background">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="mt-3 text-[15px] font-semibold text-foreground">{feature.title}</div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{feature.text}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-[1.25rem] border border-border bg-card p-6 shadow-sm sm:p-8">
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Подробный материал про железо, прошивку и сборку появится на этой странице.
          А пошаговый помощник варки работает уже сейчас — план дня собирается из рецепта,
          таймеры и отметки шагов на экране.
        </p>
        <Link
          href="/login?next=/app/brew-batches"
          className="mt-6 inline-flex items-center rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          Попробовать помощник варки
        </Link>
      </section>
    </main>
  );
}
