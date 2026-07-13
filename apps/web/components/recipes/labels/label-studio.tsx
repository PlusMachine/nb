"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, RotateCcw } from "lucide-react";

import { buttonVariants } from "@nb/ui";

import { CopyLinkButton } from "@/components/shared/copy-link-button";
import {
  computeA4Grid,
  isLargePreset,
  LABEL_FIELD_LIMITS,
  LABEL_PRESETS,
  LABEL_PRESET_IDS,
  LABEL_TEMPLATE_IDS,
  type LabelDpi,
  type LabelPresetId,
  type LabelSlots,
  type LabelTemplateId
} from "@/features/labels/contracts";
import {
  clampLabelStudioFields,
  parseLabelStudioQuery,
  serializeLabelStudioState,
  type LabelStudioFields,
  type LabelStudioState
} from "@/features/labels/label-studio-url";

// Конфигуратор наклеек: формат → шаблон → печать → поля → превью.
// Поля подставлены из рецепта, но каждое можно поправить или очистить
// (пустое поле = блок не печатается). Свободного позиционирования нет:
// раскладку держит шаблон. Состояние зеркалится в URL страницы (не путать со
// служебными query-параметрами рендера, см. features/labels/label-studio-url.ts).

const TEMPLATE_LABELS: Record<LabelTemplateId, string> = {
  typographic: "Типографский",
  craft: "Линейный крафт"
};

type FormatId = LabelPresetId | "A4";

/** Поля-правки: ровно ключи labelOverridesSchema, значения — строки формы. */
type LabelFields = LabelStudioFields;

// Значения из рецепта режем по лимитам поля наклейки: название рецепта (до 180)
// и склеенный список солодов (за 240) длиннее лимита, а maxLength у <input> не
// трогает предзаполненное значение — без обрезки форма собрала бы запрос,
// который рендер отвергнет 400-ым (превью замрёт, «Скачать» уведёт на JSON).
const fieldsFromSlots = (slots: LabelSlots): LabelFields =>
  clampLabelStudioFields({
    title: slots.title,
    style: slots.styleName ?? "",
    abv: slots.abvText ?? "",
    ibu: slots.ibu === null ? "" : String(slots.ibu),
    ebc: slots.ebc === null ? "" : String(slots.ebc),
    og: slots.ogText ?? "",
    fg: slots.fgText ?? "",
    malts: slots.malts.join(", "),
    hops: slots.hops.join(", "),
    yeast: slots.yeast ?? "",
    description: slots.description ?? "",
    author: slots.authorName ?? "",
    brand: slots.brandText ?? "",
    volume: slots.volumeText ?? "",
    batch: slots.batchText ?? ""
  });

const todayIsoDate = (): string => {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
};

// text-base на мобиле — иначе iOS зумит страницу при фокусе на поле с кеглем < 16px.
const inputClass =
  "h-9 w-full rounded-md border border-border bg-background px-2 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const chipClass = (active: boolean): string =>
  `rounded-md border px-3 py-1.5 text-sm transition-colors ${
    active ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-foreground/30"
  }`;

// maxLength у всех полей — не косметика: длина берётся из LABEL_FIELD_LIMITS,
// той же карты, из которой собрана серверная схема. Так форма физически не
// может собрать запрос, который рендер отвергнет 400-ым.
function Field(props: {
  id: string;
  label: string;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  /** Числовые поля (ABV/IBU/EBC/OG/FG) — цифровая клавиатура вместо полной QWERTY. */
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className={props.className}>
      <label htmlFor={props.id} className="mb-1 block text-xs font-medium text-muted-foreground">
        {props.label}
      </label>
      <input
        id={props.id}
        type="text"
        inputMode={props.inputMode}
        value={props.value}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
        onBlur={props.onBlur}
        className={inputClass}
      />
    </div>
  );
}

export type LabelStudioProps = {
  /** Эндпоинт рендера: наклейка рецепта или ручная (/api/labels/custom). */
  endpoint: string;
  heading: string;
  /** Слоты, подставленные автоматически (из рецепта) или пустая заготовка. */
  defaultSlots: LabelSlots;
  /**
   * Почему QR недоступен: `"custom"` — ручной режим (рецепт для QR ещё не
   * выбран пользователем); `null`/не передано — доступен. В режиме рецепта QR
   * есть всегда: у неопубликованного он ведёт на /beer/<slug> по share-ключу.
   * Пресет S (43×25 мм) блокирует QR независимо от этого пропа — физически не
   * помещается ни при каком значении.
   */
  qrUnavailableReason?: "custom" | null;
  /** Опубликованные рецепты автора для выбора цели QR — только ручной режим, только залогиненным. */
  myRecipes?: Array<{ slug: string; title: string }>;
  backLink?: { href: string; label: string };
  /** Подпись «откуда данные» — в ручном режиме её нет. */
  resetLabel?: string;
};

export function LabelStudio(props: LabelStudioProps) {
  const defaults = useMemo(() => fieldsFromSlots(props.defaultSlots), [props.defaultSlots]);
  const isManualQr = props.qrUnavailableReason === "custom";
  const myRecipes = props.myRecipes ?? [];

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawQuery = useMemo(() => Object.fromEntries(searchParams.entries()), [searchParams]);

  // Ловушка «qr=1 из чужой ссылки»: доступность QR на момент чтения ссылки
  // считаем ДО парсинга — по тем же сырым параметрам (preset/recipeSlug), не
  // дожидаясь стейта. Пресет S не печатает QR ни при каком overrides.qr.
  const initialQuery = useMemo(() => {
    const presetOk = rawQuery.preset !== "S";
    const manualHasTarget = isManualQr && Boolean(rawQuery.recipeSlug && rawQuery.recipeSlug.trim().length > 0);
    const qrAvailable = presetOk && (isManualQr ? manualHasTarget : (props.qrUnavailableReason ?? null) === null);
    return parseLabelStudioQuery(rawQuery, { qrAvailable });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rawQuery уже мемоизирован от searchParams
  }, [rawQuery, isManualQr, props.qrUnavailableReason]);

  const [format, setFormat] = useState<FormatId>(() => (initialQuery.layout === "a4" ? "A4" : initialQuery.preset ?? "M"));
  const [sheetPreset, setSheetPreset] = useState<LabelPresetId>(() =>
    initialQuery.layout === "a4" ? initialQuery.preset ?? "M" : "M"
  );
  const [template, setTemplate] = useState<LabelTemplateId>(() => initialQuery.template ?? "typographic");
  const [dpi, setDpi] = useState<LabelDpi>(() => initialQuery.dpi ?? 203);
  const initialDateRef = useRef(todayIsoDate());
  const [bottlingDate, setBottlingDate] = useState<string>(() => initialQuery.bottlingDate ?? initialDateRef.current);
  const [fields, setFields] = useState<LabelFields>(() => ({ ...defaults, ...initialQuery.fields }));
  const [withQr, setWithQr] = useState<boolean>(() => initialQuery.withQr ?? true);
  const [withLogo, setWithLogo] = useState<boolean>(() => initialQuery.withLogo ?? true);
  const [withIbuScale, setWithIbuScale] = useState<boolean>(() => initialQuery.withIbuScale ?? true);
  const [recipeSlugInput, setRecipeSlugInput] = useState<string>(() => initialQuery.recipeSlug ?? "");
  const [printView, setPrintView] = useState<boolean>(false);

  const isSheet = format === "A4";
  const preset = isSheet ? sheetPreset : format;
  // Описание, шкала горечи и эмблема печатаются только на большой наклейке —
  // в обеих ориентациях (75×120 и 120×75), это один и тот же набор блоков.
  const isLarge = isLargePreset(preset);
  const sheetCount = useMemo(() => computeA4Grid(LABEL_PRESETS[preset]).count, [preset]);
  const isDirty = useMemo(
    () => (Object.keys(defaults) as Array<keyof LabelFields>).some((key) => fields[key] !== defaults[key]),
    [fields, defaults]
  );

  const setField = (key: keyof LabelFields) => (value: string) => setFields((prev) => ({ ...prev, [key]: value }));

  // Пресет S физически не помещает QR-блок (шаблон его не рисует); ручной
  // режим без выбранного рецепта — тоже нет цели для QR.
  const sizeBlocksQr = preset === "S";
  const hasManualTarget = isManualQr && recipeSlugInput.trim().length > 0;
  const qrReason: "custom" | "size" | null = sizeBlocksQr
    ? "size"
    : isManualQr
      ? (hasManualTarget ? null : "custom")
      : props.qrUnavailableReason ?? null;
  const qrDisabled = qrReason !== null;
  const resolvedWithQr = withQr && !qrDisabled;

  // Правки уходят теми же query-параметрами, что и настройки рендера.
  const query = useMemo(() => {
    const params = new URLSearchParams({ template, preset, dpi: String(dpi) });
    for (const [key, value] of Object.entries(fields)) {
      params.set(key, value);
    }
    if (bottlingDate) {
      params.set("bottlingDate", bottlingDate);
    }
    if (!resolvedWithQr) {
      params.set("qr", "0");
    }
    if (!withLogo) {
      params.set("logo", "0");
    }
    if (!withIbuScale) {
      params.set("ibuScale", "0");
    }
    if (isManualQr && recipeSlugInput.trim().length > 0) {
      params.set("recipeSlug", recipeSlugInput.trim());
    }
    if (isSheet) {
      params.set("sheet", "1");
    }
    return params;
  }, [template, preset, dpi, fields, bottlingDate, resolvedWithQr, withLogo, withIbuScale, isManualQr, recipeSlugInput, isSheet]);

  const previewSrc = useMemo(() => {
    // Превью — одна наклейка; для A4 количество на листе показываем подписью.
    const params = new URLSearchParams(query);
    params.delete("sheet");
    params.set("format", "png");
    // По умолчанию — сглаженный рендер (1-бит растр, ужатый браузером,
    // рассыпается); «как на печати» показывает реальный растр 1:1.
    params.set("preview", printView ? "0" : "1");
    return `${props.endpoint}?${params.toString()}`;
  }, [query, printView, props.endpoint]);

  // Каждый рендер превью — растеризация на сервере: не гоняем её на каждое
  // нажатие клавиши, ждём паузу в правках.
  const [debouncedSrc, setDebouncedSrc] = useState(previewSrc);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSrc(previewSrc), 350);
    return () => window.clearTimeout(timer);
  }, [previewSrc]);

  // Превью грузим через fetch (не <img src>) по двум причинам: 1) можно
  // держать ПРЕЖНЮЮ картинку показанной, пока грузится следующая — подменяем
  // src только по успеху, без мигания; 2) так же читаем заголовок
  // X-Label-Qr: dropped (сервер запросил QR, но он не влез) — из <img> его не
  // получить.
  const [shownSrc, setShownSrc] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [qrDropped, setQrDropped] = useState(false);
  const [descriptionFit, setDescriptionFit] = useState<"none" | "ok" | "trimmed" | "dropped">("none");
  const shownSrcRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setPreviewLoading(true);
    fetch(debouncedSrc, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("label preview request failed");
        }
        const blob = await response.blob();
        if (cancelled) {
          return;
        }
        const nextUrl = URL.createObjectURL(blob);
        setShownSrc((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return nextUrl;
        });
        setQrDropped(response.headers.get("x-label-qr") === "dropped");
        const fit = response.headers.get("x-label-description");
        setDescriptionFit(fit === "ok" || fit === "trimmed" || fit === "dropped" ? fit : "none");
        setPreviewFailed(false);
        setPreviewLoading(false);
      })
      .catch((error: unknown) => {
        // Отмена предыдущего запроса при следующей правке — не сбой.
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        // Показанная картинка остаётся (её ещё можно скачать), но молчать
        // нельзя: иначе сбой рендера выглядит как «правка не применилась».
        setPreviewFailed(true);
        setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedSrc]);

  useEffect(() => {
    shownSrcRef.current = shownSrc;
  }, [shownSrc]);

  useEffect(
    () => () => {
      if (shownSrcRef.current) {
        URL.revokeObjectURL(shownSrcRef.current);
      }
    },
    []
  );

  const downloadHref = (fileFormat: "png" | "pdf") => {
    const params = new URLSearchParams(query);
    params.set("format", fileFormat);
    params.set("download", "1");
    return `${props.endpoint}?${params.toString()}`;
  };

  // Состояние студии → URL страницы (не рендера!). Дебаунс 300мс + немедленный
  // flush на blur полей — иначе воспроизводится гонка: отложенный
  // replaceState срабатывает после старта мягкой навигации (клик по ссылке
  // «К рецепту»/«К инструментам») и отменяет переход (см. my-recipes-gallery.tsx).
  const studioDefaults = useMemo<LabelStudioState>(
    () => ({
      template: "typographic",
      preset: "M",
      layout: "single",
      dpi: 203,
      bottlingDate: initialDateRef.current,
      fields: defaults,
      withQr: true,
      withLogo: true,
      withIbuScale: true,
      recipeSlug: ""
    }),
    [defaults]
  );

  const studioState = useMemo<LabelStudioState>(
    () => ({
      template,
      preset,
      layout: isSheet ? "a4" : "single",
      dpi,
      bottlingDate,
      fields,
      withQr,
      withLogo,
      withIbuScale,
      recipeSlug: recipeSlugInput
    }),
    [template, preset, isSheet, dpi, bottlingDate, fields, withQr, withLogo, withIbuScale, recipeSlugInput]
  );

  const latestStateRef = useRef(studioState);
  useEffect(() => {
    latestStateRef.current = studioState;
  });

  const syncUrl = useCallback(
    (state: LabelStudioState) => {
      if (typeof window === "undefined") {
        return;
      }
      const qs = serializeLabelStudioState(state, studioDefaults).toString();
      const nextHref = qs ? `${pathname}?${qs}` : pathname;
      const currentHref = `${window.location.pathname}${window.location.search}`;
      if (currentHref === nextHref) {
        return;
      }
      window.history.replaceState(null, "", nextHref);
    },
    [pathname, studioDefaults]
  );

  const syncTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (syncTimerRef.current != null) {
        window.clearTimeout(syncTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (syncTimerRef.current != null) {
      window.clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      syncUrl(latestStateRef.current);
    }, 300);
  }, [studioState, syncUrl]);

  const flushSync = useCallback(() => {
    if (syncTimerRef.current == null) {
      return;
    }
    window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = null;
    syncUrl(latestStateRef.current);
  }, [syncUrl]);

  const presetInfo = LABEL_PRESETS[preset];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        {props.backLink ? (
          <Link
            href={props.backLink.href}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {props.backLink.label}
          </Link>
        ) : null}
        <h1 className="mt-2 text-2xl font-semibold">{props.heading}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6 lg:col-start-1">
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Формат</h2>
            <div className="flex flex-wrap items-end gap-3">
              {LABEL_PRESET_IDS.map((id) => {
                const item = LABEL_PRESETS[id];
                const active = format === id;
                const ratio = item.widthMm / item.heightMm;
                const box = 52;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFormat(id)}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors ${
                      active ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-foreground/30"
                    }`}
                  >
                    <span
                      className={`block rounded-sm border ${active ? "border-primary" : "border-muted-foreground/40"}`}
                      style={{ height: ratio >= 1 ? box / ratio : box, width: ratio >= 1 ? box : box * ratio }}
                      aria-hidden
                    />
                    {item.sizeLabel}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setFormat("A4")}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors ${
                  isSheet ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                <span
                  className={`grid grid-cols-3 gap-px rounded-sm border p-1 ${isSheet ? "border-primary" : "border-muted-foreground/40"}`}
                  style={{ height: 52, width: 37 }}
                  aria-hidden
                >
                  {Array.from({ length: 6 }).map((_, index) => (
                    <span key={index} className="rounded-[1px] bg-muted-foreground/30" />
                  ))}
                </span>
                Лист A4
              </button>
            </div>
            {isSheet ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Наклейка на листе:</span>
                {LABEL_PRESET_IDS.map((id) => (
                  <button key={id} type="button" onClick={() => setSheetPreset(id)} className={chipClass(sheetPreset === id)}>
                    {LABEL_PRESETS[id].sizeLabel}
                  </button>
                ))}
                <span className="text-muted-foreground">— {sheetCount} шт. на листе</span>
              </div>
            ) : null}
          </section>

          <section className="flex flex-wrap items-end gap-6">
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">Шаблон</h2>
              <div className="flex gap-2">
                {LABEL_TEMPLATE_IDS.map((id) => (
                  <button key={id} type="button" onClick={() => setTemplate(id)} className={chipClass(template === id)}>
                    {TEMPLATE_LABELS[id]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">Печать</h2>
              <div className="flex gap-2">
                {([203, 300] as const).map((value) => (
                  <button key={value} type="button" onClick={() => setDpi(value)} className={chipClass(dpi === value)}>
                    {value} dpi
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>

        <section className="space-y-3 sticky top-[var(--chrome-top,0px)] z-10 lg:col-start-2 lg:row-span-2 lg:top-4 lg:self-start">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Превью</h2>
            <button
              type="button"
              onClick={() => setPrintView((prev) => !prev)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {printView ? "Показать чётко" : "Как напечатается"}
            </button>
          </div>
          <div className="flex justify-center overflow-auto rounded-lg border border-border bg-muted/30 p-4">
            {shownSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- превью — blob-URL с сервера, не статический актив
              <img
                src={shownSrc}
                alt={`Превью наклейки «${fields.title}»`}
                className={`max-h-[560px] w-auto max-w-full border border-border bg-white shadow-sm transition-opacity ${
                  previewLoading ? "opacity-60" : "opacity-100"
                }`}
                // «Как напечатается» — реальный 1-бит растр в масштабе 1:1 (пиксель
                // растра = пиксель экрана), иначе — сглаженный рендер.
                style={printView ? { imageRendering: "pixelated" } : undefined}
              />
            ) : (
              <div
                // Сбой на первом рендере: вечно пульсирующий скелет читается как
                // «ещё грузится», а грузиться уже нечему.
                className={`w-full max-w-[240px] rounded bg-muted ${previewFailed ? "" : "animate-pulse"}`}
                style={{ aspectRatio: `${presetInfo.widthMm} / ${presetInfo.heightMm}` }}
                aria-hidden
              />
            )}
          </div>
          {previewFailed ? (
            <p className="rounded-md border border-destructive/30 bg-destructive-subtle px-2 py-1.5 text-xs text-destructive-subtle-foreground">
              Не удалось обновить превью.
            </p>
          ) : null}
          {isSheet ? (
            <p className="text-sm text-muted-foreground">
              PDF-лист A4: {sheetCount} шт. {LABEL_PRESETS[preset].sizeLabel} с метками реза.
            </p>
          ) : null}
          <div className="flex gap-2">
            {!isSheet ? (
              <a href={downloadHref("png")} className={buttonVariants({ variant: "outline", size: "md" })}>
                <Download className="h-4 w-4" aria-hidden />
                Скачать PNG
              </a>
            ) : null}
            <a href={downloadHref("pdf")} className={buttonVariants({ size: "md" })}>
              <Download className="h-4 w-4" aria-hidden />
              Скачать PDF
            </a>
          </div>
          <CopyLinkButton
            buildHref={() => {
              const qs = serializeLabelStudioState(studioState, studioDefaults).toString();
              return `${window.location.origin}${pathname}${qs ? `?${qs}` : ""}`;
            }}
            label="Скопировать ссылку"
            successTitle="Ссылка скопирована"
          />
        </section>

        <section className="space-y-3 lg:col-start-1">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Данные</h2>
            {isDirty && props.resetLabel ? (
              <button
                type="button"
                onClick={() => setFields(defaults)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                {props.resetLabel}
              </button>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Название очистить нельзя (пустое = имя из рецепта): показываем это
                имя плейсхолдером, чтобы стирание поля не читалось как «убрал с
                наклейки» — общая подпись «пустое поле не печатается» тут не
                действует. */}
            <Field id="lb-title" label="Название" value={fields.title} maxLength={LABEL_FIELD_LIMITS.title} onChange={setField("title")} onBlur={flushSync} placeholder={defaults.title} className="sm:col-span-2" />
            <Field id="lb-style" label="Стиль" value={fields.style} maxLength={LABEL_FIELD_LIMITS.style} onChange={setField("style")} onBlur={flushSync} className="sm:col-span-2" />
            {/* На 360px три узкие колонки в один ряд не влезают читаемо — стек до sm. */}
            <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-3">
              <Field id="lb-abv" label="ABV" value={fields.abv} maxLength={LABEL_FIELD_LIMITS.abv} onChange={setField("abv")} onBlur={flushSync} placeholder="~5.2%" inputMode="decimal" />
              <Field id="lb-ibu" label="IBU" value={fields.ibu} maxLength={LABEL_FIELD_LIMITS.ibu} onChange={setField("ibu")} onBlur={flushSync} placeholder="38" inputMode="decimal" />
              <Field id="lb-ebc" label="EBC" value={fields.ebc} maxLength={LABEL_FIELD_LIMITS.ebc} onChange={setField("ebc")} onBlur={flushSync} placeholder="12" inputMode="decimal" />
            </div>
            <Field id="lb-og" label="OG" value={fields.og} maxLength={LABEL_FIELD_LIMITS.og} onChange={setField("og")} onBlur={flushSync} placeholder="1.048" inputMode="decimal" />
            <Field id="lb-fg" label="FG" value={fields.fg} maxLength={LABEL_FIELD_LIMITS.fg} onChange={setField("fg")} onBlur={flushSync} placeholder="1.011" inputMode="decimal" />
            <Field id="lb-malts" label="Солод (через запятую)" value={fields.malts} maxLength={LABEL_FIELD_LIMITS.malts} onChange={setField("malts")} onBlur={flushSync} className="sm:col-span-2" />
            <Field id="lb-hops" label="Хмель (через запятую)" value={fields.hops} maxLength={LABEL_FIELD_LIMITS.hops} onChange={setField("hops")} onBlur={flushSync} className="sm:col-span-2" />
            <Field id="lb-yeast" label="Дрожжи" value={fields.yeast} maxLength={LABEL_FIELD_LIMITS.yeast} onChange={setField("yeast")} onBlur={flushSync} className="sm:col-span-2" />
            {/* Описание печатается только на большой наклейке — на S/M для него
                нет места. Не показываем инертное поле с пояснением, а прячем его:
                оно появляется, когда становится к месту (правка не теряется — она
                живёт в состоянии и вернётся при переключении на большой формат). */}
            {isLarge ? (
              <div className="sm:col-span-2">
                <label htmlFor="lb-description" className="mb-1 block text-xs font-medium text-muted-foreground">
                  Описание
                </label>
                <textarea
                  id="lb-description"
                  rows={2}
                  maxLength={LABEL_FIELD_LIMITS.description}
                  value={fields.description}
                  onChange={(event) => setField("description")(event.target.value)}
                  onBlur={flushSync}
                  placeholder="Пара предложений о пиве"
                  className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {/* Описание младше всех блоков и урезается по остатку высоты: молча
                    исчезнувший текст читался бы как поломка. */}
                {descriptionFit === "trimmed" || descriptionFit === "dropped" ? (
                  <p className="mt-1 rounded-md border border-warning/30 bg-warning-subtle px-2 py-1.5 text-xs text-warning-subtle-foreground">
                    {descriptionFit === "trimmed" ? "Описание напечатается не целиком." : "Описание не поместилось."} Сократите
                    текст{template === "craft" ? ", выключите эмблему или шкалу IBU" : " или выключите шкалу IBU"}.
                  </p>
                ) : null}
              </div>
            ) : null}
            <Field id="lb-volume" label="Объём тары" value={fields.volume} maxLength={LABEL_FIELD_LIMITS.volume} onChange={setField("volume")} onBlur={flushSync} placeholder="0,5 л" />
            <Field id="lb-batch" label="Партия №" value={fields.batch} maxLength={LABEL_FIELD_LIMITS.batch} onChange={setField("batch")} onBlur={flushSync} placeholder="3" />
            <Field id="lb-author" label="Автор" value={fields.author} maxLength={LABEL_FIELD_LIMITS.author} onChange={setField("author")} onBlur={flushSync} />
            <Field id="lb-brand" label="Марка внизу" value={fields.brand} maxLength={LABEL_FIELD_LIMITS.brand} onChange={setField("brand")} onBlur={flushSync} />
            <div>
              <label htmlFor="lb-date" className="mb-1 block text-xs font-medium text-muted-foreground">
                Дата розлива
              </label>
              <input
                id="lb-date"
                type="date"
                value={bottlingDate}
                onChange={(event) => setBottlingDate(event.target.value)}
                onBlur={flushSync}
                className={inputClass}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">Пустое поле — блок не печатается.</p>

          <div className="space-y-2">
            {isManualQr ? (
              <div className="space-y-2">
                {myRecipes.length > 0 ? (
                  <div>
                    <label htmlFor="lb-recipe-pick" className="mb-1 block text-xs font-medium text-muted-foreground">
                      Рецепт для QR
                    </label>
                    <select
                      id="lb-recipe-pick"
                      value={myRecipes.some((recipe) => recipe.slug === recipeSlugInput) ? recipeSlugInput : ""}
                      onChange={(event) => {
                        setRecipeSlugInput(event.target.value);
                        flushSync();
                      }}
                      className={inputClass}
                    >
                      <option value="">Указать ссылкой ниже</option>
                      {myRecipes.map((recipe) => (
                        <option key={recipe.slug} value={recipe.slug}>
                          {recipe.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <Field
                  id="lb-recipe-slug"
                  label="Ссылка на рецепт"
                  value={recipeSlugInput}
                  maxLength={LABEL_FIELD_LIMITS.recipeSlug}
                  onChange={setRecipeSlugInput}
                  onBlur={flushSync}
                  placeholder="слаг или ссылка на рецепт"
                />
              </div>
            ) : null}

            {/* Эмблема есть только в «Линейном крафте» на большой наклейке, шкала IBU —
                на большой наклейке в обоих шаблонах: на остальных форматах переключать нечего. */}
            {isLarge && template === "craft" ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={withLogo}
                  onChange={(event) => setWithLogo(event.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Эмблема
              </label>
            ) : null}
            {isLarge ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={withIbuScale}
                  onChange={(event) => setWithIbuScale(event.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Шкала IBU
              </label>
            ) : null}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={withQr && !qrDisabled}
                disabled={qrDisabled}
                onChange={(event) => setWithQr(event.target.checked)}
                className="h-4 w-4 rounded border-border disabled:cursor-not-allowed disabled:opacity-50"
              />
              QR-код на страницу пива
            </label>
            {qrReason === "size" ? (
              <p className="text-xs text-muted-foreground">На 43×25 мм QR не помещается.</p>
            ) : null}
            {qrDropped ? (
              <p className="rounded-md border border-warning/30 bg-warning-subtle px-2 py-1.5 text-xs text-warning-subtle-foreground">
                QR не поместился на наклейку и не напечатан.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
