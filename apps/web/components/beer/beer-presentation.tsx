import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

import type { BeerPresentationDto } from "@/features/beer-page/contracts";
import { beerColorFromSrm, srmToGlassStops, srmToSoftGradient } from "@/features/recipes/beer-color";

// Гостевая страница пива (/beer/<slug>): человек отсканировал QR с бутылки —
// показываем обложку в духе журнала, а не рабочую страницу рецепта. Страница
// намеренно тёмная в обеих темах: это арт-подача, а не документ.
//
// Одна сцена на экран: фон, имя, паспорт, пара предложений. Скролл появляется
// только если у пива длинное авторское описание — «пустого» скролла ради
// огромного hero-блока здесь нет.
//
// Фото на обложке: своё фото рецепта — резко; фото BJCP-стиля — под блюром
// (антураж, но не выдаём стоковую картинку за фото этого пива — тот же принцип,
// что у RecipeThumb в карточках).

const DISPLAY_FONT = { fontFamily: "var(--font-display)" } as const;

/** Доля 0..1 значения в шкале — за краями шкала не врёт, а упирается. */
const scaleShare = (value: number, max: number): number => Math.min(Math.max(value / max, 0), 1);

const MARKER_PX = 12;

/**
 * Позиция маркера внутри трека. Наивный `left: <доля>%` при 0 % и 100 % вывешивает
 * половину кружка за границы плитки (ловилось на стауте: SRM 45 → 100 % → 6px за
 * краем). Считаем от «полезной» ширины трека, ужатой на диаметр маркера.
 */
const markerLeft = (share: number): string =>
  `calc(${MARKER_PX / 2}px + (100% - ${MARKER_PX}px) * ${share})`;

const formatAbvRu = (abv: number): string => `${abv.toFixed(1).replace(".", ",")} %`;

const bitternessWordRu = (ibu: number): string => {
  if (ibu < 10) return "едва заметная";
  if (ibu < 20) return "мягкая";
  if (ibu < 35) return "умеренная";
  if (ibu < 50) return "ощутимая";
  if (ibu < 70) return "высокая";
  return "очень высокая";
};

const ABV_BAR = "linear-gradient(90deg, rgba(255,255,255,0.25), rgba(255,255,255,0.9))";
const IBU_BAR = "linear-gradient(90deg, #a3e635, #fbbf24, #f97316)";
const SRM_BAR = "linear-gradient(90deg, #F3F993, #FFBF42, #BB5100, #3B0F0A)";

function StatTile({
  label,
  value,
  detail,
  share,
  gradient,
  className = ""
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  share: number;
  gradient: string;
  /** Раскладка плитки в сетке (цвет на мобиле занимает всю строку). */
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border border-white/10 bg-white/[0.07] px-3 py-3 backdrop-blur-md sm:px-4 ${className}`}
    >
      <dt className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">{label}</dt>
      {/* Длинные названия цвета («Насыщенно-золотистый») в колонке ~80px на 360px
          рвались посреди слова — переносим по дефису, а не по буквам. */}
      {/* [hyphens:auto] — страховка для составных названий цвета
          («Насыщенно-золотистый»): рвутся по своему дефису, а не по буквам. */}
      <dd className="mt-1 text-base font-semibold leading-tight [hyphens:auto] sm:text-lg" lang="ru" style={DISPLAY_FONT}>
        {value}
      </dd>
      {detail ? <dd className="mt-0.5 text-[11px] leading-tight text-white/55">{detail}</dd> : null}
      {/* Шкала прижата к низу плитки: у названий цвета разная высота (одна-две
          строки), но шкалы соседних плиток должны стоять на одной линии. */}
      <div aria-hidden className="mt-auto pt-3">
        <div className="relative h-1 rounded-full" style={{ background: gradient }}>
          <span
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/30 shadow-[0_1px_4px_rgba(0,0,0,0.6)]"
            style={{ left: markerLeft(share) }}
          />
        </div>
      </div>
    </div>
  );
}

export function BeerPresentation({ beer }: { beer: BeerPresentationDto }) {
  const srm = beer.colorSrm;
  const color = srm != null ? beerColorFromSrm(srm) : null;
  const accent = srm != null ? srmToGlassStops(srm).from : "rgba(245, 240, 232, 0.9)";

  const coverImage = beer.heroPhotoUrl ?? beer.styleImageUrl;
  const coverIsRecipePhoto = beer.heroPhotoUrl != null;
  const authorName = beer.author.displayName;
  const hasStats = beer.abv != null || beer.ibu != null || srm != null;

  return (
    <article className="relative flex min-h-svh flex-col overflow-hidden bg-[#0e0c0a] text-white">
      {coverImage ? (
        <Image
          src={coverImage}
          alt=""
          aria-hidden
          fill
          unoptimized
          priority
          sizes="100vw"
          className={
            coverIsRecipePhoto ? "object-cover" : "scale-110 object-cover blur-[10px] saturate-[1.25]"
          }
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: srm != null ? srmToSoftGradient(srm) : "#1c1712" }}
        />
      )}
      {/* Скрим: сверху лёгкий (фон дышит), к низу плотный — под текстом должен
          быть контраст на любой картинке, включая светлый лагер. */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/55 to-black/90" />

      <div className="relative mx-auto w-full max-w-5xl px-6 pt-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-[0.3em] text-white/70 transition-colors hover:text-white"
          style={DISPLAY_FONT}
        >
          NB
        </Link>
      </div>

      {/* Одна колонка, прижатая к низу: имя → паспорт → описание → действия.
          Контент короткий, поэтому на всех экранах помещается без скролла. */}
      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col justify-end gap-6 px-6 pb-10 pt-12 sm:gap-7 sm:pb-12">
        <div>
          {beer.style ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] sm:text-xs" style={{ color: accent }}>
              {beer.style.code} · {beer.style.name}
            </p>
          ) : null}
          <h1
            className="mt-2 max-w-3xl text-balance text-4xl font-semibold leading-[1.02] sm:text-5xl lg:text-6xl"
            style={DISPLAY_FONT}
          >
            {beer.title}
          </h1>
        </div>

        {hasStats ? (
          // На мобиле цифры делят строку, а цвет идёт отдельной строкой: слово
          // «Золотистый» просит ~94px, а треть узкого экрана даёт 73 — в трёх
          // колонках название рвалось посреди слова.
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            {beer.abv != null ? (
              <StatTile
                label="Крепость"
                value={formatAbvRu(beer.abv)}
                share={scaleShare(beer.abv, 12)}
                gradient={ABV_BAR}
              />
            ) : null}
            {beer.ibu != null ? (
              <StatTile
                label="Горечь"
                value={`${Math.round(beer.ibu)} IBU`}
                detail={bitternessWordRu(beer.ibu)}
                share={scaleShare(beer.ibu, 80)}
                gradient={IBU_BAR}
              />
            ) : null}
            {srm != null && color ? (
              // Свотча-кружка тут нет намеренно: цвет пива уже показывает сама
              // шкала (градиент SRM + маркер), а в колонку 80px кружок с длинным
              // названием не влезал и рвал слово пополам.
              <StatTile
                label="Цвет"
                value={color.label}
                className="col-span-2 sm:col-span-1"
                share={scaleShare(srm, 40)}
                gradient={SRM_BAR}
              />
            ) : null}
          </dl>
        ) : null}

        {beer.descriptionParagraphs.length > 0 ? (
          <div className="max-w-2xl space-y-3">
            {beer.descriptionParagraphs.map((paragraph, index) => (
              <p key={index} className="text-[15px] leading-relaxed text-white/85 sm:text-base">
                {paragraph}
              </p>
            ))}
            {beer.descriptionSource === "style" && beer.style ? (
              <p className="text-xs text-white/40">Описание стиля {beer.style.name} по классификации BJCP</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-4 border-t border-white/10 pt-5">
          {authorName ? (
            <div className="flex items-center gap-2.5">
              {beer.author.image ? (
                <Image
                  src={beer.author.image}
                  alt=""
                  width={36}
                  height={36}
                  unoptimized
                  className="h-9 w-9 rounded-full object-cover ring-1 ring-white/30"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-semibold ring-1 ring-white/25"
                  style={DISPLAY_FONT}
                >
                  {authorName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="leading-tight">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/50">Пивовар</div>
                <div className="text-sm font-medium text-white/90">{authorName}</div>
              </div>
            </div>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {beer.isPublished ? (
              <Link
                href={`/recipes/${beer.slug}`}
                className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur transition-colors hover:bg-white/20"
              >
                Рецепт этого пива
              </Link>
            ) : null}
            {beer.style?.articleHref ? (
              <Link
                href={beer.style.articleHref}
                className="rounded-full px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:text-white"
              >
                О стиле
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
