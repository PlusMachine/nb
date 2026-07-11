"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, RotateCcw } from "lucide-react";

import { buttonVariants } from "@nb/ui";
import {
  computeA4Grid,
  LABEL_PRESETS,
  LABEL_PRESET_IDS,
  LABEL_TEMPLATE_IDS,
  READY_AFTER_DAYS_DEFAULT,
  type LabelDpi,
  type LabelPresetId,
  type LabelSlots,
  type LabelTemplateId
} from "@/features/labels/contracts";

// Конфигуратор наклеек: формат → шаблон → печать → поля → превью.
// Поля подставлены из рецепта, но каждое можно поправить или очистить
// (пустое поле = блок не печатается). Свободного позиционирования нет:
// раскладку держит шаблон.

const TEMPLATE_LABELS: Record<LabelTemplateId, string> = {
  typographic: "Типографский",
  craft: "Линейный крафт"
};

type FormatId = LabelPresetId | "A4";

/** Поля-правки: ровно ключи labelOverridesSchema, значения — строки формы. */
type LabelFields = {
  title: string;
  style: string;
  abv: string;
  ibu: string;
  ebc: string;
  og: string;
  fg: string;
  malts: string;
  hops: string;
  yeast: string;
  author: string;
  brand: string;
  readyAfterDays: string;
};

const fieldsFromSlots = (slots: LabelSlots): LabelFields => ({
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
  author: slots.authorName ?? "",
  brand: slots.brandText ?? "",
  readyAfterDays: String(READY_AFTER_DAYS_DEFAULT)
});

const todayIsoDate = (): string => {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
};

const inputClass =
  "h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const chipClass = (active: boolean): string =>
  `rounded-md border px-3 py-1.5 text-sm transition-colors ${
    active ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-foreground/30"
  }`;

function Field(props: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={props.className}>
      <label htmlFor={props.id} className="mb-1 block text-xs font-medium text-muted-foreground">
        {props.label}
      </label>
      <input
        id={props.id}
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
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
  /** QR возможен только у опубликованного рецепта; в ручном режиме — никогда. */
  qrAvailable: boolean;
  backLink?: { href: string; label: string };
  /** Подпись «откуда данные» — в ручном режиме её нет. */
  resetLabel?: string;
};

export function LabelStudio(props: LabelStudioProps) {
  const defaults = useMemo(() => fieldsFromSlots(props.defaultSlots), [props.defaultSlots]);

  const [format, setFormat] = useState<FormatId>("M");
  const [sheetPreset, setSheetPreset] = useState<LabelPresetId>("M");
  const [template, setTemplate] = useState<LabelTemplateId>("typographic");
  const [dpi, setDpi] = useState<LabelDpi>(203);
  const [bottlingDate, setBottlingDate] = useState<string>(todayIsoDate());
  const [fields, setFields] = useState<LabelFields>(defaults);
  const [withQr, setWithQr] = useState<boolean>(true);
  const [printView, setPrintView] = useState<boolean>(false);

  const isSheet = format === "A4";
  const preset = isSheet ? sheetPreset : format;
  const sheetCount = useMemo(() => computeA4Grid(LABEL_PRESETS[preset]).count, [preset]);
  const isDirty = useMemo(
    () => (Object.keys(defaults) as Array<keyof LabelFields>).some((key) => fields[key] !== defaults[key]),
    [fields, defaults]
  );

  const setField = (key: keyof LabelFields) => (value: string) => setFields((prev) => ({ ...prev, [key]: value }));

  // Правки уходят теми же query-параметрами, что и настройки рендера.
  const query = useMemo(() => {
    const params = new URLSearchParams({ template, preset, dpi: String(dpi) });
    for (const [key, value] of Object.entries(fields)) {
      params.set(key, value);
    }
    if (bottlingDate) {
      params.set("bottlingDate", bottlingDate);
    }
    if (!withQr) {
      params.set("qr", "0");
    }
    if (isSheet) {
      params.set("sheet", "1");
    }
    return params;
  }, [template, preset, dpi, fields, bottlingDate, withQr, isSheet]);

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

  const downloadHref = (fileFormat: "png" | "pdf") => {
    const params = new URLSearchParams(query);
    params.set("format", fileFormat);
    params.set("download", "1");
    return `${props.endpoint}?${params.toString()}`;
  };

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
        <div className="space-y-6">
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

          <section className="space-y-3">
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
              <Field id="lb-title" label="Название" value={fields.title} onChange={setField("title")} className="sm:col-span-2" />
              <Field id="lb-style" label="Стиль" value={fields.style} onChange={setField("style")} className="sm:col-span-2" />
              <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                <Field id="lb-abv" label="ABV" value={fields.abv} onChange={setField("abv")} placeholder="~5.2%" />
                <Field id="lb-ibu" label="IBU" value={fields.ibu} onChange={setField("ibu")} placeholder="38" />
                <Field id="lb-ebc" label="EBC" value={fields.ebc} onChange={setField("ebc")} placeholder="12" />
              </div>
              <Field id="lb-og" label="OG" value={fields.og} onChange={setField("og")} placeholder="1.048" />
              <Field id="lb-fg" label="FG" value={fields.fg} onChange={setField("fg")} placeholder="1.011" />
              <Field id="lb-malts" label="Солод (через запятую)" value={fields.malts} onChange={setField("malts")} className="sm:col-span-2" />
              <Field id="lb-hops" label="Хмель (через запятую)" value={fields.hops} onChange={setField("hops")} className="sm:col-span-2" />
              <Field id="lb-yeast" label="Дрожжи" value={fields.yeast} onChange={setField("yeast")} className="sm:col-span-2" />
              <Field id="lb-author" label="Автор" value={fields.author} onChange={setField("author")} />
              <Field id="lb-brand" label="Марка внизу" value={fields.brand} onChange={setField("brand")} />
              <div>
                <label htmlFor="lb-date" className="mb-1 block text-xs font-medium text-muted-foreground">
                  Дата розлива
                </label>
                <input
                  id="lb-date"
                  type="date"
                  value={bottlingDate}
                  onChange={(event) => setBottlingDate(event.target.value)}
                  className={inputClass}
                />
              </div>
              <Field
                id="lb-ready"
                label="Готово после (дней)"
                value={fields.readyAfterDays}
                onChange={setField("readyAfterDays")}
                placeholder={String(READY_AFTER_DAYS_DEFAULT)}
              />
            </div>

            <p className="text-xs text-muted-foreground">Пустое поле — блок не печатается.</p>

            {props.qrAvailable ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={withQr}
                  onChange={(event) => setWithQr(event.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                QR-код на публичную страницу рецепта
              </label>
            ) : null}
          </section>
        </div>

        <section className="space-y-3 lg:sticky lg:top-4 lg:self-start">
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
            {/* eslint-disable-next-line @next/next/no-img-element -- серверный рендер, размеры зависят от пресета */}
            <img
              key={debouncedSrc}
              src={debouncedSrc}
              alt={`Превью наклейки «${fields.title}»`}
              className="max-h-[560px] w-auto max-w-full border border-border bg-white shadow-sm"
              // «Как напечатается» — реальный 1-бит растр в масштабе 1:1 (пиксель
              // растра = пиксель экрана), иначе — сглаженный рендер.
              style={printView ? { imageRendering: "pixelated" } : undefined}
            />
          </div>
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
        </section>
      </div>
    </div>
  );
}
