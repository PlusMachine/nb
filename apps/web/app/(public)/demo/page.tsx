import type { Metadata } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getBjcpCatalogData } from "@nb/content";

import { DemoBrewAssistantSection } from "@/components/demo/demo-brew-assistant";
import { buildMashHistory, makeDemoData } from "@/components/demo/demo-data";
import { DemoDashboardSection } from "@/components/demo/demo-dashboard";
import { DemoFermentationSection } from "@/components/demo/demo-fermentation";
import { DemoInventorySection } from "@/components/demo/demo-inventory";
import { DemoRecipesSection } from "@/components/demo/demo-recipes";
import { calculators } from "@/features/calculators/catalog";

// Каркас пульта, пока грузится чанк симуляции — те же габариты, что и
// внутренняя заглушка DemoPult (до её монтирования на клиенте), чтобы не было
// доп. прыжка вёрстки между этим фолбэком и внутренним.
function DemoPultSkeleton() {
  return (
    <div className="space-y-6">
      <span className="sr-only">Пульт загружается…</span>
      <div aria-hidden className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-6 w-40 rounded-full bg-muted" />
        <div className="h-6 w-24 rounded-full bg-muted" />
      </div>
      <div aria-hidden className="h-40 rounded-2xl border border-border bg-card" />
      <div aria-hidden className="h-56 rounded-2xl border border-border bg-card" />
      <div aria-hidden className="h-20 rounded-2xl border border-border bg-card" />
    </div>
  );
}

// DemoPult тянет за собой симулятор BrewForge (@nb/brewforge-sim, ~1590 строк)
// + пульт + график — тяжёлая клиентская симуляция, не нужная для первой
// загрузки страницы (сама секция "Или на автомате" — интерактивная витрина,
// не индексируемый текст; заголовок/подпись вокруг неё остаются серверными).
// next/dynamic без ssr:false (он и не разрешён в серверных компонентах)
// выносит её в отдельный чанк, не раздувая общий бандл страницы.
const DemoPult = dynamic(() => import("@/components/demo/demo-pult").then((mod) => mod.DemoPult), {
  loading: DemoPultSkeleton
});

export const metadata: Metadata = {
  title: "Демо",
  description:
    "Мастерская пивовара изнутри: рецепты, склад, варочный день с автоматикой BrewForge и брожение — на реалистичных примерах, без регистрации."
};

const ANCHORS = [
  { href: "#recipes", n: 1, label: "Рецепты" },
  { href: "#inventory", n: 2, label: "Склад" },
  { href: "#brew-day", n: 3, label: "Варочный день" },
  { href: "#fermentation", n: 4, label: "Брожение" },
  { href: "#dashboard", n: 5, label: "Дашборд" }
];

// Заголовок сюжетной секции с видимым порядковым номером (сюжет = порядок,
// как HomeLoop на главной) — вместо пояснительного подзаголовка.
function SectionHeading({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-foreground text-sm font-semibold tabular-nums text-background">
        {n}
      </span>
      <h2 className="text-2xl font-semibold text-foreground sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
        {title}
      </h2>
    </div>
  );
}

// Ссылка-карточка на настоящий публичный раздел (§2.6) — число показываем,
// только когда оно проверяемо без БД (стили BJCP и калькуляторы — статические
// каталоги); каталог и рецепты сообщества считаются в БД, которую демо не
// читает, поэтому фактовую строку с числом для них не выдумываем.
function OpenSurfaceCard({ href, title, fact }: { href: string; title: string; fact?: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-1 rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-border hover:shadow-md"
    >
      <span className="text-lg font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
        {title}
      </span>
      {fact ? <span className="text-sm tabular-nums text-muted-foreground">{fact}</span> : null}
    </Link>
  );
}

export default async function DemoPage() {
  const now = new Date();
  const data = makeDemoData(now);
  const bjcpCatalog = await getBjcpCatalogData();
  const bjcpStyleCount = bjcpCatalog.styles.length;
  const calculatorCount = calculators.length;

  return (
    <main className="space-y-16 pb-24 pt-8">
      <section className="overflow-hidden rounded-[2.75rem] border border-border/80 bg-card/90 px-6 py-10 shadow-[0_45px_120px_-70px_rgba(15,23,42,0.45)] backdrop-blur sm:px-8 lg:px-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Демо</p>
        <h1 className="mt-3 max-w-2xl text-balance text-4xl font-semibold leading-[0.98] text-foreground sm:text-5xl lg:text-6xl" style={{ fontFamily: "var(--font-display)" }}>
          Мастерская пивовара — изнутри
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-lg leading-8 text-muted-foreground">
          Так выглядит NB, когда склад заполнен, рецепты сохранены, а варка идёт прямо сейчас. Все данные на этой странице — примеры.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/login" className="inline-flex items-center rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/90">
            Завести свою мастерскую
          </Link>
          <Link href="/recipes" className="inline-flex items-center rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-border">
            Смотреть рецепты
          </Link>
        </div>
        <nav className="mt-8 flex flex-wrap gap-2" aria-label="Разделы демо">
          {ANCHORS.map((anchor) => (
            <a
              key={anchor.href}
              href={anchor.href}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <span className="tabular-nums text-muted-foreground">{anchor.n}</span>
              {anchor.label}
            </a>
          ))}
        </nav>
      </section>

      <section id="recipes" className="scroll-mt-24 space-y-5">
        <SectionHeading n={1} title="Рецепты" />
        <DemoRecipesSection recipes={data.ownRecipes} />
      </section>

      <section id="inventory" className="scroll-mt-24 space-y-5">
        <SectionHeading n={2} title="Склад" />
        <DemoInventorySection
          items={data.inventory.items}
          preferredCurrency={data.inventory.preferredCurrency}
          currencyRates={data.inventory.currencyRates}
        />
      </section>

      <section id="brew-day" className="scroll-mt-24 space-y-8">
        <SectionHeading n={3} title="Варочный день" />
        <DemoBrewAssistantSection groups={data.brewAssistant.groups} progress={data.brewAssistant.progress} />

        {/* Единственный тёмный блок страницы: класс `.dark` скоупит семантические
            токены на поддерево (тот же механизм, что переключатель темы сайта),
            поэтому пульт всегда тёмный независимо от темы посетителя — без хардкод-hex. */}
        <div className="dark overflow-hidden rounded-[2rem] border border-border bg-background p-6 text-foreground sm:p-8">
          <h3 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Или на автомате: BrewForge
          </h3>
          <div className="mt-5">
            <DemoPult initialHistory={buildMashHistory(now)} />
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            Это настоящий пульт NB, подключённый к симулятору контроллера — время ускорено. С железом всё выглядит так же.
          </p>
        </div>
      </section>

      <section id="fermentation" className="scroll-mt-24 space-y-5">
        <SectionHeading n={4} title="Брожение" />
        <DemoFermentationSection
          history={data.fermentation.history}
          planSteps={data.fermentation.planSteps}
          measurements={data.fermentation.measurements}
          dayIndex={data.fermentation.dayIndex}
          target={data.fermentation.target}
        />
      </section>

      <section id="dashboard" className="scroll-mt-24 space-y-5">
        <SectionHeading n={5} title="Дашборд" />
        <DemoDashboardSection
          brews={data.dashboard.brews}
          inventorySummary={data.dashboard.inventorySummary}
          shopping={data.dashboard.shopping}
          device={data.dashboard.device}
          now={now}
        />
      </section>

      <section className="space-y-5">
        <h2 className="text-3xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
          Уже открыто без входа
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <OpenSurfaceCard href="/catalog" title="Каталог ингредиентов" />
          <OpenSurfaceCard href="/bjcp" title="Справочник стилей BJCP 2021" fact={`${bjcpStyleCount} стилей`} />
          <OpenSurfaceCard href="/calculators" title="Калькуляторы пивовара" fact={`${calculatorCount} калькуляторов`} />
          <OpenSurfaceCard href="/recipes" title="Рецепты сообщества" />
        </div>
      </section>

      <section>
        <Link
          href="/login"
          className="group flex flex-col gap-2 rounded-[1.25rem] border border-border bg-card p-6 transition hover:-translate-y-0.5 hover:border-border hover:shadow-md"
        >
          <span className="text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            Завести свою мастерскую
          </span>
          <span className="text-sm text-muted-foreground">Вход по номеру телефона — аккаунт создаётся при первом входе</span>
        </Link>
      </section>
    </main>
  );
}
