import type { CSSProperties, ReactElement } from "react";

import { OG_COLORS, OG_FONT_FAMILY, OG_SIZE, OG_STRIP_WIDTH } from "./theme";
import {
  recipeCardViewFromRecipeView,
  sanitizeOgCardView,
  type OgCardView,
  type OgSecondaryLine,
  type OgStrip,
  type RecipeOgView
} from "./models";

// Раскладка OG-карточек под Satori (next/og). ВАЖНО про ограничения движка
// (docs/specs/og-images.md §6): это НЕ полный CSS — только flexbox (Yoga).
// Каждый контейнер с >1 ребёнком обязан иметь display:"flex" + flexDirection,
// иначе Satori кидает ошибку и мессенджер показывает превью БЕЗ картинки. Нет
// grid/calc/z-index. Эмодзи не используем (тянутся с CDN) — звезда рейтинга
// нарисована инлайн-SVG. Функции возвращают ReactElement; в ImageResponse его
// оборачивает route-хендлер (или file-convention opengraph-image.tsx).
//
// renderOgCard — единый движок для всех типов сущностей Ф2. Сущность-специфичная
// «человеческая» логика живёт в моделях (models.ts), сюда приходит плоская
// OgCardView. renderRecipeOgCard — тонкий адаптер над ним (Ф1, вид не менялся).

const rootStyle: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  width: OG_SIZE.width,
  height: OG_SIZE.height,
  background: OG_COLORS.background,
  color: OG_COLORS.foreground,
  fontFamily: OG_FONT_FAMILY
};

const contentStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  padding: "64px 72px"
};

const topGroupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column"
};

/**
 * Ф3 (centered): оборачивает topGroup, когда нужно вертикально центрировать
 * eyebrow+title в свободном пространстве (обложки разделов без статов). flex:1
 * съедает всё, что contentStyle оставляет между паддингом и футером, а
 * justifyContent центрирует topGroup внутри — footer при этом остаётся ниже,
 * на своей естественной высоте, т.е. прижат к низу. Без флага эта обёртка не
 * рендерится вовсе — раскладка сущностных карточек не меняется ни на байт.
 */
const centeredTopGroupWrapperStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  justifyContent: "center"
};

const eyebrowStyle: CSSProperties = {
  fontSize: 26,
  fontWeight: 500,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  color: OG_COLORS.accent
};

const subtitleStyle: CSSProperties = {
  fontSize: 30,
  fontWeight: 400,
  lineHeight: 1.3,
  marginTop: 16,
  maxWidth: 1000,
  color: OG_COLORS.muted
};

const statsRowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  marginTop: 44
};

const statCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  marginRight: 56
};

const statLabelStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 500,
  color: OG_COLORS.muted
};

const statValueStyle: CSSProperties = {
  fontSize: 46,
  fontWeight: 700,
  color: OG_COLORS.foreground,
  marginTop: 2
};

/** Дефолтный кегль factsLine — используется, если у view нет factsLineFontSize. */
const FACTS_LINE_DEFAULT_FONT_SIZE = 34;

const factsLineStyle: CSSProperties = {
  fontSize: FACTS_LINE_DEFAULT_FONT_SIZE,
  fontWeight: 500,
  lineHeight: 1.25,
  marginTop: 40,
  maxWidth: 1000,
  color: OG_COLORS.foreground,
  wordBreak: "break-word"
};

const secondaryRowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  marginTop: 30,
  fontSize: 30,
  color: OG_COLORS.foreground
};

const footerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center"
};

/** Стиль фирменной полосы: сплошной цвет либо вертикальный градиент по стопам. */
const stripStyle = (strip: OgStrip): CSSProperties => ({
  width: OG_STRIP_WIDTH,
  height: "100%",
  background:
    strip.kind === "gradient"
      ? `linear-gradient(180deg, ${strip.stops.join(", ")})`
      : strip.color
});

const StarIcon = (): ReactElement => (
  <svg width={30} height={30} viewBox="0 0 24 24" style={{ marginRight: 12 }}>
    <path
      fill={OG_COLORS.star}
      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z"
    />
  </svg>
);

const renderSecondaryLine = (line: OgSecondaryLine): ReactElement => {
  if (line.kind === "text") {
    return (
      <div style={{ ...secondaryRowStyle, color: OG_COLORS.muted }}>
        <span>{line.text}</span>
      </div>
    );
  }
  return (
    <div style={secondaryRowStyle}>
      <StarIcon />
      <span style={{ fontWeight: 700 }}>{line.value}</span>
      <span style={{ color: OG_COLORS.muted, marginLeft: 8 }}>({line.count})</span>
      {line.extra ? (
        <span style={{ color: OG_COLORS.muted, marginLeft: 16 }}>{`· ${line.extra}`}</span>
      ) : null}
    </div>
  );
};

const renderFooter = (wordmark: string, domain: string): ReactElement => (
  <div style={footerStyle}>
    <span style={{ fontSize: 32, fontWeight: 700, color: OG_COLORS.foreground }}>{wordmark}</span>
    <span style={{ fontSize: 28, color: OG_COLORS.muted, margin: "0 12px" }}>·</span>
    <span style={{ fontSize: 27, color: OG_COLORS.muted }}>{domain}</span>
  </div>
);

/**
 * Универсальный рендер карточки для любой сущности (Ф2). Всё сущность-специфичное
 * уже разложено в OgCardView. Порядок блоков: eyebrow → title → subtitle →
 * (stats-ячейки | factsLine) → secondaryLine → footer. Держать flex-инвариант.
 */
export function renderOgCard(view: OgCardView): ReactElement {
  // Чистим эмодзи/пиктограммы из всех free-text полей ДО Satori (иначе он тянет
  // twemoji с CDN и роняет рендер посреди стрима — route try/catch это не ловит).
  const v = sanitizeOgCardView(view);
  const topGroup = (
    <div style={topGroupStyle}>
      {v.eyebrow ? <div style={eyebrowStyle}>{v.eyebrow}</div> : null}
      <div
        style={{
          fontSize: v.titleFontSize,
          fontWeight: 700,
          lineHeight: 1.1,
          marginTop: 24,
          color: OG_COLORS.foreground,
          // Название без пробелов (юзерский ввод) Satori не переносит по
          // умолчанию → уезжает за холст. Ломаем по символам как страховку.
          wordBreak: "break-word"
        }}
      >
        {v.title}
      </div>
      {v.subtitle ? <div style={subtitleStyle}>{v.subtitle}</div> : null}
      {v.stats && v.stats.length > 0 ? (
        <div style={statsRowStyle}>
          {v.stats.map((stat) => (
            <div key={stat.label} style={statCellStyle}>
              <div style={statLabelStyle}>{stat.label}</div>
              <div style={statValueStyle}>{stat.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {v.factsLine ? (
        <div style={{ ...factsLineStyle, fontSize: v.factsLineFontSize ?? FACTS_LINE_DEFAULT_FONT_SIZE }}>
          {v.factsLine}
        </div>
      ) : null}
      {v.secondaryLine ? renderSecondaryLine(v.secondaryLine) : null}
    </div>
  );
  return (
    <div style={rootStyle}>
      <div style={stripStyle(v.strip)} />
      <div style={contentStyle}>
        {v.centered ? <div style={centeredTopGroupWrapperStyle}>{topGroup}</div> : topGroup}
        {renderFooter(v.wordmark, v.domain)}
      </div>
      {v.photo ? (
        <img
          src={v.photo.dataUri}
          width={v.photo.width}
          height={v.photo.height}
          style={{ width: v.photo.width, height: v.photo.height, objectFit: "cover" }}
        />
      ) : null}
    </div>
  );
}

/**
 * Карточка рецепта (Ф1) — тонкий адаптер над renderOgCard; вид без фото не
 * менялся (recipeCardViewFromRecipeView сохранён и переиспользуется здесь ради
 * обратной совместимости экспорта — потребители/тесты зовут renderRecipeOgCard
 * напрямую).
 */
export function renderRecipeOgCard(view: RecipeOgView): ReactElement {
  return renderOgCard(recipeCardViewFromRecipeView(view));
}

/**
 * Фолбэк-карточка на случай ошибки генерации (битые данные/сбой рендера): не
 * отдаём 500 — иначе мессенджер покажет превью без картинки. Просто брендовый
 * холст с wordmark и подписью.
 */
export function renderFallbackOgCard(opts: { wordmark: string; tagline?: string }): ReactElement {
  return (
    <div style={{ ...rootStyle, flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 128, fontWeight: 700, color: OG_COLORS.foreground }}>{opts.wordmark}</div>
      <div style={{ fontSize: 34, color: OG_COLORS.muted, marginTop: 16 }}>
        {opts.tagline ?? "Платформа для домашних пивоваров"}
      </div>
    </div>
  );
}
