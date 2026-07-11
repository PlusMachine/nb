import Link from "next/link";
import { Globe, Mail, MapPin, Phone, Send } from "lucide-react";

import { getMasterSpecializationLabel } from "@/features/masters/contracts";
import type { MasterPublishedSnapshot } from "@/features/masters/contracts";

import { MasterGallery } from "./master-gallery";
import { MasterItemCover } from "./master-item-cover";

/**
 * Чистый рендер страницы мастера (§6 ТЗ) — только из пропса `snapshot`
 * (публичный `publishedJson`, никаких fetch/db внутри). Публичная страница и
 * превью модератора (M3) переиспользуют его буквально с тем же пропсом
 * `snapshot`, чтобы модератор видел ровно то, что появится на витрине —
 * меняется только пропс `container` (см. ниже), поведение и вёрстка те же.
 */

// @nick → https://t.me/nick; ссылка вида t.me/... (или уже полный https://t.me/...)
// проходит как есть — формат уже проверен zod-схемой в contracts.ts.
const normalizeTelegramHref = (value: string): string => (value.startsWith("@") ? `https://t.me/${value.slice(1)}` : value);

const primaryButtonClassName =
  "inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background transition hover:bg-foreground/90";
const secondaryButtonClassName =
  "inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:bg-accent";
const chipClassName =
  "inline-flex w-fit items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground";

export function MasterPageView({
  snapshot,
  container = "main"
}: {
  snapshot: MasterPublishedSnapshot;
  /**
   * `"main"` — публичная страница (`app/(public)/masters/[slug]/page.tsx`),
   * где `PublicShell` не рендерит собственный `<main>`. `"div"` — превью
   * модератора (`admin/masters/[id]/page.tsx`): там `MasterPageView` уже
   * вложен в разметку админ-страницы, второй `<main>` там семантически лишний.
   */
  container?: "main" | "div";
}) {
  const { contacts } = snapshot;
  const hasContacts = Boolean(contacts.telegram || contacts.phone || contacts.website || contacts.email);
  const hasItems = snapshot.items.length > 0;
  const hasGallery = snapshot.gallery.length > 0;
  const Container = container === "div" ? "div" : "main";

  return (
    <Container className="space-y-8 py-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="transition hover:text-foreground">Главная</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/market" className="transition hover:text-foreground">Маркет</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-foreground">{snapshot.displayName}</li>
        </ol>
      </nav>

      <header className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{snapshot.displayName}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              {snapshot.city}
            </span>
            {snapshot.craftSince ? <span>Делает с {snapshot.craftSince}</span> : null}
          </div>
        </div>

        {snapshot.specializations.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {snapshot.specializations.map((key) => (
              <span key={key} className={chipClassName}>
                {getMasterSpecializationLabel(key)}
              </span>
            ))}
          </div>
        ) : null}

        {hasContacts ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {contacts.telegram ? (
              <a
                href={normalizeTelegramHref(contacts.telegram)}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={primaryButtonClassName}
              >
                <Send className="h-4 w-4" aria-hidden />
                Написать в Telegram
              </a>
            ) : null}
            {contacts.phone ? (
              <a href={`tel:${contacts.phone.replace(/[^\d+]/g, "")}`} className={secondaryButtonClassName}>
                <Phone className="h-4 w-4" aria-hidden />
                Позвонить
                <span className="text-muted-foreground">· {contacts.phone}</span>
              </a>
            ) : null}
            {contacts.website ? (
              <a href={contacts.website} target="_blank" rel="noopener noreferrer nofollow" className={secondaryButtonClassName}>
                <Globe className="h-4 w-4" aria-hidden />
                Сайт
              </a>
            ) : null}
            {contacts.email ? (
              <a href={`mailto:${contacts.email}`} className={secondaryButtonClassName}>
                <Mail className="h-4 w-4" aria-hidden />
                {contacts.email}
              </a>
            ) : null}
          </div>
        ) : null}
      </header>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">О мастере</h2>
        <div className="whitespace-pre-line text-sm leading-7 text-foreground">{snapshot.about}</div>
      </section>

      {hasItems ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Изделия</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {snapshot.items.map((item) => (
              // id — якорь для карточек маркета (#item-<id>); scroll-mt отступает от липкой шапки
              <article
                key={item.id}
                id={`item-${item.id}`}
                className="flex scroll-mt-[calc(var(--chrome-top,0px)+1rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
              >
                <MasterItemCover item={item} />
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-base font-semibold leading-snug text-foreground">{item.title}</h3>
                    {item.priceNote ? (
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{item.priceNote}</span>
                    ) : null}
                  </div>
                  {item.description ? (
                    <details className="group/desc text-sm text-muted-foreground">
                      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        <span className="line-clamp-4 whitespace-pre-line group-open/desc:line-clamp-none">{item.description}</span>
                        <span className="mt-1 inline-block text-xs font-medium text-foreground group-open/desc:hidden">
                          Показать полностью
                        </span>
                        <span className="mt-1 hidden text-xs font-medium text-foreground group-open/desc:inline-block">
                          Свернуть
                        </span>
                      </summary>
                    </details>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {hasGallery ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Галерея работ</h2>
          <MasterGallery images={snapshot.gallery} />
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Платформа не участвует в сделках и не проверяет изделия. Договаривайтесь с мастером напрямую и уточняйте
        характеристики — особенно для ёмкостей, работающих под давлением.
      </p>
    </Container>
  );
}
