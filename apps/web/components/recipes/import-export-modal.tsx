"use client";

import React, { useEffect, useMemo, useState } from "react";
import { FileText, X } from "lucide-react";

import { importBeerXmlToCanonicalRecipe } from "@/features/recipes/interop/beerxml";
import { importBrewfatherJsonToCanonicalRecipe } from "@/features/recipes/interop/brewfather-json";
import type { CanonicalRecipe } from "@/features/recipes/interop/canonical";

export type ImportExportActionResult = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

type ImportExportStatus = {
  tone: "pending" | "success" | "error" | "info";
  message: string;
  details?: string[];
};

type ImportFormat = "beerxml" | "brewfather_json";

type ImportRecipeSummary = {
  title: string;
  ingredientCountLabel: string;
  ingredientBreakdown: string;
  parameters: string;
  stats: string;
  mash: string;
  ingredientPreview: string;
};

type ImportRecipeSummaryResult = {
  ok: true;
  summary: ImportRecipeSummary;
} | {
  ok: false;
  message: string;
};

const formatFieldErrors = (fieldErrors: Record<string, string> | undefined) => (
  fieldErrors ? Object.entries(fieldErrors).map(([field, message]) => `${field}: ${message}`) : []
);

const getStatusClasses = (tone: ImportExportStatus["tone"]) => {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (tone === "error") return "border-red-200 bg-red-50 text-red-950";
  if (tone === "pending") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const readFiniteNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatNumber = (value: number, fractionDigits = 1) => (
  Number(value.toFixed(fractionDigits)).toString()
);

const categoryLabels: Record<CanonicalRecipe["ingredients"][number]["category"], string> = {
  fermentable: "сбраживаемое",
  hop: "хмель",
  yeast: "дрожжи",
  consumable: "другие добавки",
  water_treatment: "водоподготовка"
};

const readImportedStats = (canonical: CanonicalRecipe) => {
  const importMeta = isRecord(canonical.importMeta) ? canonical.importMeta : null;
  const importedStats = isRecord(importMeta?.importedStats) ? importMeta.importedStats : null;

  return {
    og: readFiniteNumber(importedStats?.og),
    fg: readFiniteNumber(importedStats?.fg),
    ibu: readFiniteNumber(importedStats?.ibu),
    color: readFiniteNumber(importedStats?.color),
    abv: readFiniteNumber(importedStats?.abv)
  };
};

const readMashStepCount = (canonical: CanonicalRecipe) => {
  const processMeta = isRecord(canonical.processMeta) ? canonical.processMeta : null;
  const mashProfile = isRecord(processMeta?.mashProfile) ? processMeta.mashProfile : null;
  return Array.isArray(mashProfile?.steps) ? mashProfile.steps.length : 0;
};

const summarizeCanonicalRecipe = (canonical: CanonicalRecipe): ImportRecipeSummary => {
  const counts = canonical.ingredients.reduce<Record<string, number>>((acc, ingredient) => {
    acc[ingredient.category] = (acc[ingredient.category] ?? 0) + 1;
    return acc;
  }, {});
  const totalIngredients = canonical.ingredients.length;
  const ingredientBreakdown = Object.entries(counts)
    .map(([category, count]) => `${categoryLabels[category as keyof typeof categoryLabels] ?? category}: ${count}`)
    .join(", ");
  const parameters = [
    canonical.batchSizeL != null ? `${formatNumber(canonical.batchSizeL, 2)} л` : null,
    canonical.boilTimeMinutes != null ? `кипячение ${formatNumber(canonical.boilTimeMinutes, 0)} мин` : null,
    canonical.efficiency != null ? `эффективность ${formatNumber(canonical.efficiency, 1)}%` : null
  ].filter(Boolean).join(" • ");
  const stats = readImportedStats(canonical);
  const statsLabel = [
    stats.og != null ? `OG ${formatNumber(stats.og, 3)}` : null,
    stats.fg != null ? `FG ${formatNumber(stats.fg, 3)}` : null,
    stats.ibu != null ? `IBU ${formatNumber(stats.ibu, 1)}` : null,
    stats.abv != null ? `ABV ${formatNumber(stats.abv, 1)}%` : null,
    stats.color != null ? `SRM ${formatNumber(stats.color, 1)}` : null
  ].filter(Boolean).join(" • ");
  const mashStepCount = readMashStepCount(canonical);
  const ingredientPreview = canonical.ingredients
    .slice(0, 6)
    .map((ingredient) => `${ingredient.name} (${formatNumber(ingredient.amount, 3)} ${ingredient.unit})`)
    .join(", ");

  return {
    title: canonical.title,
    ingredientCountLabel: `${totalIngredients} поз.`,
    ingredientBreakdown: ingredientBreakdown || "категории не определены",
    parameters: parameters || "объем и процесс не указаны",
    stats: statsLabel || "расчетные показатели в файле не указаны",
    mash: mashStepCount ? `${mashStepCount} шаг(а) затирания` : "профиль затирания не найден",
    ingredientPreview: ingredientPreview || "позиции не найдены"
  };
};

const mapImportSummaryError = (error: unknown) => {
  if (error instanceof SyntaxError) {
    return "JSON не удалось прочитать: проверьте синтаксис файла.";
  }

  if (!(error instanceof Error)) {
    return "Файл не удалось разобрать.";
  }

  if (error.message === "EMPTY_BEERXML") {
    return "BeerXML пустой.";
  }

  if (error.message === "INVALID_BEERXML") {
    return "BeerXML не распознан: в файле не найден блок RECIPE.";
  }

  if (error.message === "INVALID_BREWFATHER_JSON") {
    return "Brewfather JSON не распознан: проверьте, что выбран экспорт рецепта из Brewfather.";
  }

  if (error.message === "IMPORT_RECIPE_EMPTY") {
    return "В рецепте не найдены ингредиенты для импорта.";
  }

  return error.message;
};

export const buildImportRecipeSummary = (
  format: ImportFormat,
  text: string
): ImportRecipeSummaryResult | null => {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const canonical = format === "beerxml"
      ? importBeerXmlToCanonicalRecipe(trimmed)
      : importBrewfatherJsonToCanonicalRecipe(JSON.parse(trimmed));
    return {
      ok: true,
      summary: summarizeCanonicalRecipe(canonical)
    };
  } catch (error) {
    return {
      ok: false,
      message: mapImportSummaryError(error)
    };
  }
};

function ImportSummaryCard({ result }: { result: ImportRecipeSummaryResult | null }) {
  if (!result) {
    return null;
  }

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-950">
        <p className="font-medium">Сводка импорта недоступна.</p>
        <p className="mt-1 text-xs">{result.message}</p>
      </div>
    );
  }

  const { summary } = result;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700">
      <p className="text-xs font-semibold uppercase text-zinc-500">Сводка импорта</p>
      <h5 className="mt-1 text-base font-semibold text-zinc-950">{summary.title}</h5>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-zinc-500">Ингредиенты</dt>
          <dd className="font-medium text-zinc-900">{summary.ingredientCountLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">По категориям</dt>
          <dd className="font-medium text-zinc-900">{summary.ingredientBreakdown}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Параметры</dt>
          <dd className="font-medium text-zinc-900">{summary.parameters}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Показатели из файла</dt>
          <dd className="font-medium text-zinc-900">{summary.stats}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-zinc-500">Затирание: {summary.mash}</p>
      <p className="mt-1 text-xs text-zinc-500">Позиции: {summary.ingredientPreview}</p>
    </div>
  );
}

export function ImportExportModal({
  open,
  pending,
  activeRecipeId,
  beerXmlExport,
  beerXmlImport,
  brewfatherJsonImport,
  onBeerXmlImportChange,
  onBrewfatherJsonImportChange,
  onExportBeerXml,
  onImportBeerXml,
  onImportBrewfatherJson,
  onClose
}: {
  open: boolean;
  pending: boolean;
  activeRecipeId: string | null;
  beerXmlExport: string;
  beerXmlImport: string;
  brewfatherJsonImport: string;
  onBeerXmlImportChange: (next: string) => void;
  onBrewfatherJsonImportChange: (next: string) => void;
  onExportBeerXml: () => Promise<ImportExportActionResult>;
  onImportBeerXml: () => Promise<ImportExportActionResult>;
  onImportBrewfatherJson: () => Promise<ImportExportActionResult>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"import" | "export">("export");
  const [format, setFormat] = useState<ImportFormat>("beerxml");
  const [localPending, setLocalPending] = useState(false);
  const [status, setStatus] = useState<ImportExportStatus | null>(null);

  useEffect(() => {
    if (open) {
      setStatus(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (mode === "export" && format !== "beerxml") {
      setFormat("beerxml");
    }
  }, [format, mode]);

  useEffect(() => {
    setStatus(null);
  }, [format, mode]);

  const busy = pending || localPending;
  const importText = format === "beerxml" ? beerXmlImport : brewfatherJsonImport;
  const setImportText = format === "beerxml" ? onBeerXmlImportChange : onBrewfatherJsonImportChange;
  const importSummary = useMemo(() => buildImportRecipeSummary(format, importText), [format, importText]);
  const formatLabel = format === "beerxml" ? "BeerXML" : "Brewfather JSON";
  const fileAccept = format === "beerxml"
    ? ".xml,.beerxml,application/xml,text/xml"
    : ".json,application/json";

  if (!open) return null;

  const handleFile = (file: File | null) => {
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const extensionAllowed = format === "beerxml"
      ? lowerName.endsWith(".xml") || lowerName.endsWith(".beerxml")
      : lowerName.endsWith(".json");
    if (!extensionAllowed) {
      setStatus({
        tone: "error",
        message: format === "beerxml"
          ? "Выберите BeerXML файл с расширением .xml или .beerxml."
          : "Выберите Brewfather JSON файл с расширением .json."
      });
      return;
    }

    const reader = new FileReader();
    setStatus({ tone: "pending", message: `Читаем файл ${file.name}...` });
    reader.onerror = () => {
      setStatus({
        tone: "error",
        message: "Файл не удалось прочитать.",
        details: [reader.error?.message ?? "Попробуйте выбрать файл еще раз."]
      });
    };
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setImportText(text);
      const summary = buildImportRecipeSummary(format, text);
      if (summary && !summary.ok) {
        setStatus({
          tone: "error",
          message: `Файл загружен, но ${formatLabel} не удалось разобрать.`,
          details: [summary.message]
        });
        return;
      }

      setStatus({
        tone: "success",
        message: `Файл загружен: ${file.name}.`
      });
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importText.trim()) {
      setStatus({ tone: "error", message: `Добавьте содержимое ${formatLabel} перед импортом.` });
      return;
    }

    setLocalPending(true);
    setStatus({ tone: "pending", message: `Импортируем ${formatLabel}...` });
    try {
      const result = format === "beerxml"
        ? await onImportBeerXml()
        : await onImportBrewfatherJson();
      const details = formatFieldErrors(result.fieldErrors);
      if (result.ok) {
        setStatus({
          tone: "success",
          message: result.message || `${formatLabel} импортирован. Открываем рецепт...`
        });
      } else {
        setStatus({
          tone: "error",
          message: result.message || `${formatLabel} не удалось импортировать.`,
          details
        });
      }
    } catch (error) {
      setStatus({
        tone: "error",
        message: `${formatLabel} не удалось импортировать.`,
        details: [error instanceof Error ? error.message : "Неизвестная ошибка."]
      });
    } finally {
      setLocalPending(false);
    }
  };

  const handleExport = async () => {
    if (!activeRecipeId) {
      setStatus({ tone: "error", message: "Сначала сохраните рецепт, затем подготовьте экспорт." });
      return;
    }

    setLocalPending(true);
    setStatus({ tone: "pending", message: "Готовим BeerXML экспорт..." });
    try {
      const result = await onExportBeerXml();
      const details = formatFieldErrors(result.fieldErrors);
      setStatus({
        tone: result.ok ? "success" : "error",
        message: result.message,
        details
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: "BeerXML экспорт не удалось подготовить.",
        details: [error instanceof Error ? error.message : "Неизвестная ошибка."]
      });
    } finally {
      setLocalPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Импорт и экспорт рецепта" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-950">Импорт / экспорт</h3>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-zinc-900">1. Что хотите сделать?</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setMode("import")} className={`rounded-lg px-3 py-3 text-sm ${mode === "import" ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-700"}`}>Импортировать рецепт</button>
              <button type="button" onClick={() => setMode("export")} className={`rounded-lg px-3 py-3 text-sm ${mode === "export" ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-700"}`}>Экспортировать рецепт</button>
            </div>
          </section>

          {mode === "import" ? (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-zinc-900">2. Формат импорта</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setFormat("beerxml")} className={`rounded-lg px-3 py-3 text-sm ${format === "beerxml" ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-700"}`}>BeerXML</button>
                <button type="button" onClick={() => setFormat("brewfather_json")} className={`rounded-lg px-3 py-3 text-sm ${format === "brewfather_json" ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-700"}`}>Импорт из Brewfather (тестовая поддержка)</button>
              </div>
            </section>
          ) : null}

          {status ? (
            <div className={`rounded-lg border px-3 py-2.5 text-sm ${getStatusClasses(status.tone)}`} role={status.tone === "error" ? "alert" : "status"}>
              <p className="font-medium">{status.message}</p>
              {status.details?.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                  {status.details.map((detail) => <li key={detail}>{detail}</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}

          {mode === "import" ? (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-zinc-900">3. Вставьте текст или загрузите файл</h4>
              <input type="file" accept={fileAccept} onChange={(event) => handleFile(event.target.files?.[0] ?? null)} className="block w-full text-sm text-zinc-600" />
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                className="min-h-56 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800"
                placeholder={format === "beerxml" ? "<RECIPES>...</RECIPES>" : "{\"name\":\"Recipe\"}"}
              />
              <ImportSummaryCard result={importSummary} />
              <button
                type="button"
                disabled={busy || !importText.trim()}
                onClick={() => void handleImport()}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "Импортируем..." : "Импортировать"}
              </button>
            </section>
          ) : (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-zinc-900">2. Экспорт BeerXML</h4>
              <button
                type="button"
                disabled={!activeRecipeId || busy}
                onClick={() => void handleExport()}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "Экспортируем..." : "Экспортировать BeerXML"}
              </button>
              <textarea
                value={beerXmlExport}
                readOnly
                className="min-h-56 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800"
                placeholder="Экспорт появится здесь."
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!beerXmlExport}
                  onClick={() => void navigator.clipboard?.writeText(beerXmlExport)}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 disabled:opacity-50"
                >
                  Копировать
                </button>
                <a
                  href={beerXmlExport ? `data:text/xml;charset=utf-8,${encodeURIComponent(beerXmlExport)}` : undefined}
                  download="recipe.beerxml"
                  className={`rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 ${beerXmlExport ? "" : "pointer-events-none opacity-50"}`}
                >
                  Скачать
                </a>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
