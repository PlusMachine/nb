"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

import { buttonVariants } from "@nb/ui";
import {
  computeA4Grid,
  LABEL_PRESETS,
  LABEL_PRESET_IDS,
  LABEL_TEMPLATE_IDS,
  type LabelDpi,
  type LabelPresetId,
  type LabelTemplateId
} from "@/features/labels/contracts";

// Конфигуратор наклеек: формат → шаблон → dpi → дата розлива → превью.
// Превью — тот же серверный 1-бит рендер, что уходит на печать
// (image-rendering: pixelated, чтобы видеть честную точечную сетку).

const TEMPLATE_LABELS: Record<LabelTemplateId, string> = {
  typographic: "Типографский",
  craft: "Линейный крафт"
};

type FormatId = LabelPresetId | "A4";

const todayIsoDate = (): string => {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
};

export function LabelStudio(props: { recipeId: string; recipeTitle: string; isPublished: boolean }) {
  const [format, setFormat] = useState<FormatId>("M");
  const [sheetPreset, setSheetPreset] = useState<LabelPresetId>("M");
  const [template, setTemplate] = useState<LabelTemplateId>("typographic");
  const [dpi, setDpi] = useState<LabelDpi>(203);
  const [bottlingDate, setBottlingDate] = useState<string>(todayIsoDate());

  const isSheet = format === "A4";
  const preset = isSheet ? sheetPreset : format;
  const sheetCount = useMemo(() => computeA4Grid(LABEL_PRESETS[preset]).count, [preset]);

  const query = useMemo(() => {
    const params = new URLSearchParams({ template, preset, dpi: String(dpi) });
    if (bottlingDate) {
      params.set("bottlingDate", bottlingDate);
    }
    if (isSheet) {
      params.set("sheet", "1");
    }
    return params;
  }, [template, preset, dpi, bottlingDate, isSheet]);

  const previewSrc = useMemo(() => {
    // Превью всегда PNG одной наклейки; для A4 количество на листе — подписью.
    const params = new URLSearchParams(query);
    params.delete("sheet");
    params.set("format", "png");
    return `/api/labels/${props.recipeId}?${params.toString()}`;
  }, [query, props.recipeId]);

  const downloadHref = (fileFormat: "png" | "pdf") => {
    const params = new URLSearchParams(query);
    params.set("format", fileFormat);
    params.set("download", "1");
    return `/api/labels/${props.recipeId}?${params.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <Link
          href={`/app/recipes/${props.recipeId}/edit`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          К рецепту
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Наклейки — {props.recipeTitle}</h1>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Формат</h2>
        <div className="flex flex-wrap items-end gap-3">
          {LABEL_PRESET_IDS.map((id) => {
            const item = LABEL_PRESETS[id];
            const active = format === id;
            // Пропорциональная миниатюра формата (высота фикс., ширина по соотношению).
            const ratio = item.widthMm / item.heightMm;
            const boxHeight = 56;
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
                  style={{ height: ratio >= 1 ? boxHeight / ratio : boxHeight, width: ratio >= 1 ? boxHeight : boxHeight * ratio }}
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
              style={{ height: 56, width: 40 }}
              aria-hidden
            >
              {Array.from({ length: 6 }).map((_, index) => (
                <span key={index} className="rounded-[1px] bg-muted-foreground/30" />
              ))}
            </span>
            Лист A4
          </button>
          {isSheet ? (
            <div className="flex items-center gap-2 pb-1 text-sm">
              <span className="text-muted-foreground">наклейка:</span>
              {LABEL_PRESET_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSheetPreset(id)}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    sheetPreset === id ? "border-primary bg-primary/5" : "border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {LABEL_PRESETS[id].sizeLabel}
                </button>
              ))}
              <span className="text-muted-foreground">— {sheetCount} шт. на листе</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Шаблон</h2>
        <div className="flex gap-2">
          {LABEL_TEMPLATE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTemplate(id)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                template === id ? "border-primary bg-primary/5" : "border-border text-muted-foreground hover:border-foreground/30"
              }`}
            >
              {TEMPLATE_LABELS[id]}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap items-end gap-6">
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Печать</h2>
          <div className="flex gap-2">
            {([203, 300] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDpi(value)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  dpi === value ? "border-primary bg-primary/5" : "border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {value} dpi
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="labels-bottling-date" className="block text-sm font-medium text-muted-foreground">
            Дата розлива
          </label>
          <input
            id="labels-bottling-date"
            type="date"
            value={bottlingDate}
            onChange={(event) => setBottlingDate(event.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Превью</h2>
        <div className="flex justify-center rounded-lg border border-border bg-muted/30 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- серверный рендер, размеры зависят от пресета */}
          <img
            key={previewSrc}
            src={previewSrc}
            alt={`Превью наклейки «${props.recipeTitle}»`}
            className="max-h-[480px] w-auto max-w-full border border-border bg-white shadow-sm"
            style={{ imageRendering: "pixelated" }}
          />
        </div>
        {isSheet ? (
          <p className="text-sm text-muted-foreground">
            PDF-лист A4: {sheetCount} шт. {LABEL_PRESETS[preset].sizeLabel} с метками реза.
          </p>
        ) : null}
        {!props.isPublished ? (
          <p className="text-sm text-muted-foreground">QR-код печатается только у опубликованных рецептов.</p>
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
  );
}
