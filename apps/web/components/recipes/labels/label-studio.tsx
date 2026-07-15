"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Download, Maximize2, Printer, RotateCcw } from "lucide-react";

import { Button, buttonVariants, Dialog, DialogFooter, useToast } from "@nb/ui";

import { CopyLinkButton } from "@/components/shared/copy-link-button";
import {
  computeA4Grid,
  isLargePreset,
  LABEL_DPI_SHEET,
  LABEL_DPI_THERMAL,
  LABEL_DPI_VALUES,
  LABEL_FIELD_LIMITS,
  LABEL_PRESETS,
  LABEL_PRESET_IDS,
  LABEL_TEMPLATE_IDS,
  type LabelDpi,
  type LabelPresetId,
  type LabelSlots,
  type LabelTemplateId
} from "@/features/labels/contracts";
import { printLabel } from "@/features/labels/print";
import {
  appendBatchIdParam,
  parseLabelStudioQuery,
  readBatchIdParam,
  serializeLabelStudioState,
  type LabelStudioFields,
  type LabelStudioState
} from "@/features/labels/label-studio-url";
import {
  LABEL_RECIPE_FIELD_KEYS,
  LABEL_RECIPE_FIELD_LABELS,
  labelFieldsFromSlots,
  mergeRecipeFields,
  type LabelFillMode,
  type LabelRecipeFields
} from "@/features/labels/recipe-fields";
import {
  convertGravityFieldValue,
  gravityUnitLabels,
  toCalculatorGravityUnit,
  type PreferredGravityUnit
} from "@/features/system/gravity-units";

// Конфигуратор наклеек: формат → шаблон → поля → превью.
// Поля подставлены из рецепта, но каждое можно поправить или очистить
// (пустое поле = блок не печатается). Свободного позиционирования нет:
// раскладку держит шаблон. Состояние зеркалится в URL страницы (не путать со
// служебными query-параметрами рендера, см. features/labels/label-studio-url.ts).

const TEMPLATE_LABELS: Record<LabelTemplateId, string> = {
  typographic: "Классика",
  craft: "Крафт"
};

/**
 * Шкала OG/FG на наклейке. Brix здесь не предлагаем, хотя профиль его знает:
 * это шкала рефрактометра (показания после брожения занижены), а на бутылке
 * печатают плотность — численно тот же Plato. Профиль с Brix открывает студию
 * в °P.
 */
const LABEL_GRAVITY_UNITS = ["plato", "sg"] as const satisfies readonly PreferredGravityUnit[];

const resolveLabelGravityUnit = (unit: PreferredGravityUnit): (typeof LABEL_GRAVITY_UNITS)[number] =>
  unit === "sg" ? "sg" : "plato";

/** Плейсхолдер OG/FG — в той шкале, в которой поле сейчас печатается. */
const GRAVITY_PLACEHOLDERS: Record<(typeof LABEL_GRAVITY_UNITS)[number], { og: string; fg: string }> = {
  plato: { og: "12.0", fg: "2.8" },
  sg: { og: "1.048", fg: "1.011" }
};

type FormatId = LabelPresetId | "A4";

/** Поля-правки: ровно ключи labelOverridesSchema, значения — строки формы. */
type LabelFields = LabelStudioFields;

/** Что именно приедет из рецепта — этим списком студия отвечает в диалоге. */
const RECIPE_FIELDS_SUMMARY = LABEL_RECIPE_FIELD_KEYS.map((key) => LABEL_RECIPE_FIELD_LABELS[key]).join(", ");

const todayIsoDate = (): string => {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
};

// Совет по описанию собираем из того, что прислал рендер (X-Label-Description-Fix):
// он один знает, какой блок на этой вёрстке действительно отдаст место тексту.
const DESCRIPTION_FIX_LABELS: Record<string, string> = { logo: "эмблему", ibuScale: "шкалу IBU" };

const describeDescriptionFixes = (fixes: string[]): string => {
  const named = fixes.map((fix) => DESCRIPTION_FIX_LABELS[fix]).filter(Boolean);
  if (named.length === 0) {
    return "Сократите текст.";
  }
  return `Сократите текст или выключите ${named.join(" либо ")}.`;
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
  /** Ссылка на вход в подсказке QR — передаётся только гостю (ручной режим). */
  loginHref?: string;
  backLink?: { href: string; label: string };
  /** Подпись «откуда данные» — в ручном режиме её нет. */
  resetLabel?: string;
  /**
   * Шкала OG/FG, в которой сервер посчитал defaultSlots (профиль пользователя,
   * у анонима — °P). Студия даёт переключить её на самой наклейке, не трогая
   * настройку сайта.
   */
  gravityUnit: PreferredGravityUnit;
};

export function LabelStudio(props: LabelStudioProps) {
  const defaults = useMemo(() => labelFieldsFromSlots(props.defaultSlots), [props.defaultSlots]);
  const isManualQr = props.qrUnavailableReason === "custom";
  const myRecipes = props.myRecipes ?? [];

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawQuery = useMemo(() => Object.fromEntries(searchParams.entries()), [searchParams]);

  // Контекст «открыли со страницы партии» — не поле наклейки и не часть
  // LabelStudioState (см. label-studio-url.ts), поэтому фиксируем один раз при
  // монтировании и дальше сами дописываем его в каждую перезапись URL.
  const [batchIdParam] = useState<string | null>(() => readBatchIdParam(rawQuery));

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
  // Голова термопринтера: растр рассчитывается в её сетку (см. LABEL_DPI_VALUES),
  // и разойтись с железом здесь нельзя — драйвер пересчитает картинку с некратным
  // множителем и дизеринг пойдёт муаром. У A4-листа выбора нет: обычный принтер — 300.
  const [thermalDpi, setThermalDpi] = useState<LabelDpi>(() => initialQuery.dpi ?? LABEL_DPI_THERMAL);
  const [gravityUnit, setGravityUnit] = useState<(typeof LABEL_GRAVITY_UNITS)[number]>(() =>
    resolveLabelGravityUnit(initialQuery.gravityUnit ?? props.gravityUnit)
  );
  const initialDateRef = useRef(todayIsoDate());
  const [bottlingDate, setBottlingDate] = useState<string>(() => initialQuery.bottlingDate ?? initialDateRef.current);
  const [fields, setFields] = useState<LabelFields>(() => ({ ...defaults, ...initialQuery.fields }));
  const [withQr, setWithQr] = useState<boolean>(() => initialQuery.withQr ?? true);
  const [withLogo, setWithLogo] = useState<boolean>(() => initialQuery.withLogo ?? true);
  const [withIbuScale, setWithIbuScale] = useState<boolean>(() => initialQuery.withIbuScale ?? true);
  const [recipeSlugInput, setRecipeSlugInput] = useState<string>(() => initialQuery.recipeSlug ?? "");
  const [printView, setPrintView] = useState<boolean>(false);
  const [printPending, setPrintPending] = useState<boolean>(false);
  const [zoomed, setZoomed] = useState<boolean>(false);
  // Заполнение полей из рецепта (ручной режим): загрузка → возможный вопрос о
  // перезаписи → слияние. Загруженные данные ждут в fillOffer, пока человек не
  // решит, что делать с уже набранным.
  const [fillPending, setFillPending] = useState<boolean>(false);
  const [fillError, setFillError] = useState<string | null>(null);
  const [fillOffer, setFillOffer] = useState<{ title: string; fields: LabelRecipeFields } | null>(null);
  const { show: showToast } = useToast();

  const isSheet = format === "A4";
  const preset = isSheet ? sheetPreset : format;
  const dpi = isSheet ? LABEL_DPI_SHEET : thermalDpi;
  // Описание, шкала горечи и эмблема печатаются только на большой наклейке —
  // в обеих ориентациях (75×120 и 120×75), это один и тот же набор блоков.
  const isLarge = isLargePreset(preset);
  const sheetCount = useMemo(() => computeA4Grid(LABEL_PRESETS[preset]).count, [preset]);
  const isDirty = useMemo(
    () => (Object.keys(defaults) as Array<keyof LabelFields>).some((key) => fields[key] !== defaults[key]),
    [fields, defaults]
  );

  const setField = (key: keyof LabelFields) => (value: string) => setFields((prev) => ({ ...prev, [key]: value }));

  // Смена шкалы пересчитывает уже введённые числа: иначе «12.0», набранное в °P,
  // молча уехало бы на наклейку как 12.0 SG. Пересчёт — общесистемный, тот же,
  // что у переключателей в калькуляторах.
  const changeGravityUnit = (next: (typeof LABEL_GRAVITY_UNITS)[number]) => {
    if (next === gravityUnit) {
      return;
    }
    const from = toCalculatorGravityUnit(gravityUnit);
    const to = toCalculatorGravityUnit(next);
    setFields((prev) => ({
      ...prev,
      og: prev.og ? convertGravityFieldValue(prev.og, from, to) : prev.og,
      fg: prev.fg ? convertGravityFieldValue(prev.fg, from, to) : prev.fg
    }));
    setGravityUnit(next);
  };

  // Сброс возвращает и шкалу: поля рецепта посчитаны в ней, и оставить
  // переключатель в другой единице значит напечатать «1.048 °P».
  const resetFields = () => {
    setFields(defaults);
    setGravityUnit(resolveLabelGravityUnit(props.gravityUnit));
  };

  const applyRecipeFields = (incoming: LabelRecipeFields, mode: LabelFillMode) => {
    setFields((prev) => mergeRecipeFields({ current: prev, incoming, defaults, mode }));
    setFillOffer(null);
    // Форма длинная: заполненные поля могут остаться за краем экрана, и без
    // подтверждения кнопка выглядит как «ничего не сделала».
    showToast({ title: mode === "replace" ? "Поля заполнены из рецепта" : "Пустые поля заполнены из рецепта" });
  };

  // Данные рецепта тянем по кнопке, а не по выбору в списке: выбор в списке —
  // это ещё и цель QR, и он не должен трогать поля сам по себе.
  const loadRecipeFields = async () => {
    const target = recipeSlugInput.trim();
    if (target.length === 0 || fillPending) {
      return;
    }
    setFillPending(true);
    setFillError(null);
    try {
      const params = new URLSearchParams({ recipe: target, gravityUnit });
      const response = await fetch(`/api/labels/recipe-fields?${params.toString()}`);
      if (!response.ok) {
        throw new Error("recipe fields request failed");
      }
      const data = (await response.json()) as { title: string; fields: LabelRecipeFields };
      // Пустая форма — заполняем молча: терять нечего. Если человек уже что-то
      // набрал, решение за ним (см. диалог ниже): автомат не стирает чужую работу.
      if (isDirty) {
        setFillOffer(data);
      } else {
        applyRecipeFields(data.fields, "replace");
      }
    } catch {
      setFillError("Не удалось загрузить рецепт. Проверьте ссылку — рецепт должен быть опубликован.");
    } finally {
      setFillPending(false);
    }
  };

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
    const params = new URLSearchParams({ template, preset, dpi: String(dpi), gravityUnit });
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
  }, [
    template,
    preset,
    dpi,
    gravityUnit,
    fields,
    bottlingDate,
    resolvedWithQr,
    withLogo,
    withIbuScale,
    isManualQr,
    recipeSlugInput,
    isSheet
  ]);

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
  // Какие тумблеры реально освободят место описанию на ЭТОЙ вёрстке: на
  // горизонтальной наклейке шкала IBU стоит в колонке данных и описанию ничего
  // не отдаёт — советовать её выключить бессмысленно.
  const [descriptionFixes, setDescriptionFixes] = useState<string[]>([]);
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
        setDescriptionFixes(
          (response.headers.get("x-label-description-fix") ?? "").split(",").filter((fix) => fix.length > 0)
        );
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

  // На печать уходит не то, что видно в превью (оно сглажено и в 2×), а
  // настоящий 1-бит растр — тот же, что лежит в скачанном PNG. Лист A4 печатный
  // документ собирает сам, тиражируя ОДНУ наклейку по сетке (features/labels/print.ts),
  // поэтому у рендера и в этом случае просим одиночную наклейку.
  const handlePrint = async () => {
    if (printPending) {
      return;
    }
    setPrintPending(true);
    try {
      const params = new URLSearchParams(query);
      params.delete("sheet");
      params.set("format", "png");
      params.set("preview", "0");
      const response = await fetch(`${props.endpoint}?${params.toString()}`);
      if (!response.ok) {
        throw new Error("label print render failed");
      }
      await printLabel({ image: await response.blob(), preset, sheet: isSheet });
    } catch {
      showToast({ title: "Не удалось отправить на печать", tone: "danger" });
    } finally {
      setPrintPending(false);
    }
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
      dpi: LABEL_DPI_THERMAL,
      gravityUnit: resolveLabelGravityUnit(props.gravityUnit),
      bottlingDate: initialDateRef.current,
      fields: defaults,
      withQr: true,
      withLogo: true,
      withIbuScale: true,
      recipeSlug: ""
    }),
    [defaults, props.gravityUnit]
  );

  const studioState = useMemo<LabelStudioState>(
    () => ({
      template,
      preset,
      layout: isSheet ? "a4" : "single",
      // В ссылке живёт не итоговое разрешение рендера (у A4 оно всегда 300, и
      // тащить его в URL незачем), а выбор пользователя: голова его термопринтера.
      dpi: thermalDpi,
      gravityUnit,
      bottlingDate,
      fields,
      withQr,
      withLogo,
      withIbuScale,
      recipeSlug: recipeSlugInput
    }),
    [
      template,
      preset,
      isSheet,
      thermalDpi,
      gravityUnit,
      bottlingDate,
      fields,
      withQr,
      withLogo,
      withIbuScale,
      recipeSlugInput
    ]
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
      const params = appendBatchIdParam(serializeLabelStudioState(state, studioDefaults), batchIdParam);
      const qs = params.toString();
      const nextHref = qs ? `${pathname}?${qs}` : pathname;
      const currentHref = `${window.location.pathname}${window.location.search}`;
      if (currentHref === nextHref) {
        return;
      }
      window.history.replaceState(null, "", nextHref);
    },
    [pathname, studioDefaults, batchIdParam]
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

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Шаблон</h2>
            <div className="flex gap-2">
              {LABEL_TEMPLATE_IDS.map((id) => (
                <button key={id} type="button" onClick={() => setTemplate(id)} className={chipClass(template === id)}>
                  {TEMPLATE_LABELS[id]}
                </button>
              ))}
            </div>
          </section>

          {/* Рецепт — источник данных, поэтому стоит ДО полей, а не после: иначе
              человек набивает всё руками, а внизу натыкается на кнопку, которая
              его работу перепишет. Он же задаёт цель QR. */}
          {isManualQr ? (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">Рецепт</h2>
              {myRecipes.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    id="lb-recipe-pick"
                    aria-label="Выбрать рецепт"
                    value={myRecipes.some((recipe) => recipe.slug === recipeSlugInput) ? recipeSlugInput : ""}
                    onChange={(event) => {
                      setRecipeSlugInput(event.target.value);
                      setFillError(null);
                      flushSync();
                    }}
                    className={`${inputClass} sm:w-64`}
                  >
                    <option value="">Не выбран</option>
                    {myRecipes.map((recipe) => (
                      <option key={recipe.slug} value={recipe.slug}>
                        {recipe.title}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void loadRecipeFields()}
                    disabled={recipeSlugInput.trim().length === 0 || fillPending}
                  >
                    {fillPending ? "Загрузка…" : "Заполнить поля"}
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-wrap items-end gap-2">
                <Field
                  id="lb-recipe-slug"
                  label={myRecipes.length > 0 ? "Или ссылка на рецепт" : "Ссылка на рецепт"}
                  value={recipeSlugInput}
                  maxLength={LABEL_FIELD_LIMITS.recipeSlug}
                  onChange={(value) => {
                    setRecipeSlugInput(value);
                    setFillError(null);
                  }}
                  onBlur={flushSync}
                  placeholder="https://…/recipes/moy-el"
                  className="min-w-[16rem] flex-1"
                />
                {myRecipes.length === 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void loadRecipeFields()}
                    disabled={recipeSlugInput.trim().length === 0 || fillPending}
                  >
                    {fillPending ? "Загрузка…" : "Заполнить поля"}
                  </Button>
                ) : null}
              </div>
              {fillError ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive-subtle px-2 py-1.5 text-xs text-destructive-subtle-foreground"
                >
                  {fillError}
                </p>
              ) : null}
            </section>
          ) : null}
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
              // Наклейка в колонке превью мелкая, а рассматривают её придирчиво
              // (мелкий шрифт, дизеринг): клик открывает её во весь экран.
              <button
                type="button"
                onClick={() => setZoomed(true)}
                className="group relative cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Открыть превью во весь экран"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- превью — blob-URL с сервера, не статический актив */}
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
                <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-background/80 p-1.5 text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Maximize2 className="h-4 w-4" aria-hidden />
                </span>
              </button>
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
              Лист A4: {sheetCount} шт. {LABEL_PRESETS[preset].sizeLabel} с метками реза.
            </p>
          ) : (
            // Вопрос не про качество, а про железо: растр рассчитывается в сетку
            // печатающей головы, и выбрать «покрасивее» нельзя — 300-dpi картинку
            // 203-я голова пересчитает с некратным множителем, дизеринг пойдёт
            // муаром. Отсюда и подпись про принтер, а не про разрешение.
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Термопринтер</span>
              <div className="flex gap-1">
                {LABEL_DPI_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setThermalDpi(value)}
                    className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                      thermalDpi === value
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/30"
                    }`}
                  >
                    {value} dpi
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Печать — основное действие: файл нужен только тем, кто печатает не из
              браузера (софт термопринтера, типография), и это уже частный случай. */}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" onClick={() => void handlePrint()} disabled={printPending}>
              <Printer className="h-4 w-4" aria-hidden />
              {printPending ? "Готовим…" : "Распечатать"}
            </Button>
            {!isSheet ? (
              <a href={downloadHref("png")} className={buttonVariants({ variant: "outline", size: "md" })}>
                <Download className="h-4 w-4" aria-hidden />
                Скачать PNG
              </a>
            ) : null}
            <a href={downloadHref("pdf")} className={buttonVariants({ variant: "outline", size: "md" })}>
              <Download className="h-4 w-4" aria-hidden />
              Скачать PDF
            </a>
          </div>
          <CopyLinkButton
            buildHref={() => {
              const qs = appendBatchIdParam(serializeLabelStudioState(studioState, studioDefaults), batchIdParam).toString();
              return `${window.location.origin}${pathname}${qs ? `?${qs}` : ""}`;
            }}
            label="Скопировать ссылку"
            successTitle="Ссылка скопирована"
          />
        </section>

        <Dialog open={zoomed && shownSrc !== null} onOpenChange={setZoomed} title="Превью наклейки" size="lg">
          <div className="flex max-h-[86vh] justify-center overflow-auto bg-muted/30 p-4">
            {shownSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- тот же blob-URL, что и в колонке превью
              <img
                src={shownSrc}
                alt={`Превью наклейки «${fields.title}»`}
                className="h-auto w-auto max-w-full border border-border bg-white shadow-sm"
                style={printView ? { imageRendering: "pixelated" } : undefined}
              />
            ) : null}
          </div>
        </Dialog>

        {/* Человек мог набрать поля до того, как вспомнил про рецепт: молча
            переписать его работу нельзя. Решение — за ним, и оба исхода
            равноправны (кнопка «Заменить всё» не единственная). */}
        <Dialog
          open={fillOffer !== null}
          onOpenChange={(next) => {
            if (!next) {
              setFillOffer(null);
            }
          }}
          title={fillOffer ? `Заполнить из рецепта «${fillOffer.title}»?` : "Заполнить из рецепта"}
          size="md"
        >
          <div className="space-y-2 p-5 text-sm">
            <p>В полях уже есть данные — что с ними сделать?</p>
            <p className="text-muted-foreground">Из рецепта приедут: {RECIPE_FIELDS_SUMMARY}.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFillOffer(null)}>
              Отмена
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (fillOffer) {
                  applyRecipeFields(fillOffer.fields, "keep-mine");
                }
              }}
            >
              Только пустые
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                if (fillOffer) {
                  applyRecipeFields(fillOffer.fields, "replace");
                }
              }}
            >
              Заменить всё
            </Button>
          </DialogFooter>
        </Dialog>

        <section className="space-y-3 lg:col-start-1">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Данные</h2>
            {isDirty && props.resetLabel ? (
              <button
                type="button"
                onClick={resetFields}
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
            {/* Шкала — не настройка сайта, а свойство наклейки: печатают её для
                тех, кто будет пить пиво, а не для владельца профиля. Переключение
                пересчитывает уже введённые числа. */}
            <div className="flex items-center justify-between gap-2 sm:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">Плотность</span>
              <div className="flex gap-1">
                {LABEL_GRAVITY_UNITS.map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => {
                      changeGravityUnit(unit);
                      flushSync();
                    }}
                    className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                      gravityUnit === unit
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/30"
                    }`}
                  >
                    {gravityUnitLabels[unit]}
                  </button>
                ))}
              </div>
            </div>
            <Field id="lb-og" label="OG" value={fields.og} maxLength={LABEL_FIELD_LIMITS.og} onChange={setField("og")} onBlur={flushSync} placeholder={GRAVITY_PLACEHOLDERS[gravityUnit].og} inputMode="decimal" />
            <Field id="lb-fg" label="FG" value={fields.fg} maxLength={LABEL_FIELD_LIMITS.fg} onChange={setField("fg")} onBlur={flushSync} placeholder={GRAVITY_PLACEHOLDERS[gravityUnit].fg} inputMode="decimal" />
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
                    исчезнувший текст читался бы как поломка. Что именно спасёт
                    текст, знает вёрстка — она и присылает список тумблеров. */}
                {descriptionFit === "trimmed" || descriptionFit === "dropped" ? (
                  <p className="mt-1 rounded-md border border-warning/30 bg-warning-subtle px-2 py-1.5 text-xs text-warning-subtle-foreground">
                    {descriptionFit === "trimmed" ? "Описание напечатается не целиком." : "Описание не поместилось."}{" "}
                    {describeDescriptionFixes(descriptionFixes)}
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
            {/* Эмблема есть только в «Крафте» на большой наклейке, шкала IBU —
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
            {qrReason === "custom" ? (
              // Молча задизейбленный чекбокс не объясняет, что QR вообще бывает и
              // что для него нужно: цель выше, а гостю — ещё и аккаунт.
              <p className="text-xs text-muted-foreground">
                QR появится, когда выше указан рецепт.
                {props.loginHref ? (
                  <>
                    {" "}
                    <Link
                      href={props.loginHref}
                      className="underline underline-offset-2 transition-colors hover:text-foreground"
                    >
                      Войдите
                    </Link>
                    , чтобы выбрать из своих опубликованных рецептов.
                  </>
                ) : null}
              </p>
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
