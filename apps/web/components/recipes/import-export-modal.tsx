"use client";

import React, { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Button, Dialog, DialogCloseButton, DialogHeader } from "@nb/ui";

import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { importBeerXmlToCanonicalRecipes } from "@/features/recipes/interop/beerxml";
import { importBrewfatherJsonToCanonicalRecipes } from "@/features/recipes/interop/brewfather-json";
import { RECIPE_IMPORT_MAX_INPUT_BYTES } from "@/features/recipes/contracts";
import { importWarnings } from "@/features/recipes/interop/readers";
import { recipeImportErrorMessage } from "@/features/recipes/interop/errors";
import type { CanonicalRecipe } from "@/features/recipes/interop/canonical";
import { defaultPreferredGravityUnit, formatGravity, type PreferredGravityUnit } from "@/features/system/gravity-units";

export type ImportExportActionResult = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

type ImportExportStatus = {
  tone: "pending" | "success" | "error" | "info";
  message: string;
  details?: string[];
  importCompleted?: boolean;
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
  warnings: string[];
  recipes?: Array<{ title: string; ingredientCount: number }>;
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
  if (tone === "success") return "border-success/30 bg-success-subtle text-success-subtle-foreground";
  if (tone === "error") return "border-destructive-border bg-destructive-subtle text-destructive-subtle-foreground";
  if (tone === "pending") return "border-warning/30 bg-warning-subtle text-warning-subtle-foreground";
  return "border-border bg-muted text-foreground";
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const readFiniteNumber = (value: unknown) => {
  if (value == null || typeof value === "boolean" || (typeof value === "string" && !value.trim())) return null;
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
  consumable: "специи и добавки",
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

const summarizeCanonicalRecipe = (
  canonical: CanonicalRecipe,
  preferredGravityUnit: PreferredGravityUnit
): ImportRecipeSummary => {
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
    // og/fg из файла — всегда SG (BeerXML/Brewfather так и хранят), formatGravity
    // сам переводит их в предпочитаемую единицу пользователя.
    stats.og != null ? `OG ${formatGravity(stats.og, preferredGravityUnit)}` : null,
    stats.fg != null ? `FG ${formatGravity(stats.fg, preferredGravityUnit)}` : null,
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
    parameters: parameters || "объём и процесс не указаны",
    stats: statsLabel || "расчётные показатели в файле не указаны",
    mash: mashStepCount ? `Шагов затирания: ${mashStepCount}` : "профиль затирания не найден",
    ingredientPreview: ingredientPreview || "позиции не найдены",
    warnings: importWarnings(canonical.importMeta),
  };
};

const mapImportSummaryError = (error: unknown) => {
  const specificMessage = recipeImportErrorMessage(error);
  if (specificMessage) return specificMessage;
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
    return "Не удалось найти рецепты в файле BeerXML. Проверьте файл или экспортируйте его заново.";
  }

  if (error.message === "INVALID_BREWFATHER_JSON") {
    return "Не удалось прочитать рецепт Brewfather. Загрузите JSON-файл, экспортированный из Brewfather.";
  }

  if (error.message === "IMPORT_RECIPE_EMPTY") {
    return "В рецепте не найдены ингредиенты для импорта.";
  }

  if (error.message === "IMPORT_INPUT_TOO_LARGE") return "Файл превышает 8 МБ. Разделите библиотеку на несколько файлов.";
  if (error.message === "IMPORT_TOO_MANY_RECIPES") return "За один раз можно импортировать до 100 рецептов. Разделите библиотеку на несколько файлов.";
  if (error.message.startsWith("UNSUPPORTED_IMPORT_UNIT:")) return `Единица измерения не поддерживается: ${error.message.split(":").slice(1).join(":").trim()}. Укажите массу, объём или число упаковок в Brewfather и повторите экспорт.`;
  return error.message;
};

export const buildImportRecipeSummary = (
  format: ImportFormat,
  text: string,
  preferredGravityUnit: PreferredGravityUnit = defaultPreferredGravityUnit
): ImportRecipeSummaryResult | null => {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const recipes = format === "beerxml"
      ? importBeerXmlToCanonicalRecipes(trimmed)
      : importBrewfatherJsonToCanonicalRecipes(JSON.parse(trimmed));
    for (const recipe of recipes) {
      if (!recipe.ingredients.length || recipe.ingredients.some((line) => !Number.isFinite(line.amount) || line.amount <= 0)) {
        throw new Error(`«${recipe.title}»: количество каждого ингредиента должно быть больше нуля.`);
      }
    }
    const summary = summarizeCanonicalRecipe(recipes[0]!, preferredGravityUnit);
    if (recipes.length > 1) {
      summary.title = `Рецептов: ${recipes.length}`;
      summary.ingredientCountLabel = `${recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0)} поз. всего`;
      summary.parameters = "Все рецепты будут доступны только вам";
      summary.ingredientBreakdown = "Состав указан для каждого рецепта в списке";
      summary.stats = "Показатели сохраняются отдельно для каждого рецепта";
      summary.mash = `Всего шагов затирания: ${recipes.reduce((sum, recipe) => sum + readMashStepCount(recipe), 0)}`;
      summary.ingredientPreview = "Полный состав доступен после открытия рецепта";
      summary.recipes = recipes.map((recipe) => ({ title: recipe.title, ingredientCount: recipe.ingredients.length }));
      summary.warnings = recipes.flatMap((recipe) => importWarnings(recipe.importMeta).map((warning) => `${recipe.title}: ${warning}`));
    }
    return { ok: true, summary };
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
      <div className="rounded-lg border border-destructive-border bg-destructive-subtle px-3 py-2.5 text-sm text-destructive-subtle-foreground">
        <p className="font-medium">Сводка импорта недоступна.</p>
        <p className="mt-1 text-xs">{result.message}</p>
      </div>
    );
  }

  const { summary } = result;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3 text-sm text-foreground">
      <p className="text-xs font-semibold uppercase text-muted-foreground">Сводка импорта</p>
      <h5 className="mt-1 text-base font-semibold text-foreground">{summary.title}</h5>
      {summary.recipes ? <ul className="mt-2 max-h-48 list-disc overflow-auto pl-5 text-sm">{summary.recipes.map((recipe, index) => <li key={index}>{recipe.title} — {recipe.ingredientCount} поз.</li>)}</ul> : null}
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Ингредиенты</dt>
          <dd className="font-medium text-foreground">{summary.ingredientCountLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">По категориям</dt>
          <dd className="font-medium text-foreground">{summary.ingredientBreakdown}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Параметры</dt>
          <dd className="font-medium text-foreground">{summary.parameters}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Показатели из файла</dt>
          <dd className="font-medium text-foreground">{summary.stats}</dd>
        </div>
      </dl>
      {summary.warnings.length ? <div className="mt-3 rounded border border-warning/30 bg-warning-subtle p-3 text-xs"><p className="font-semibold">Проверьте после переноса</p><ul className="mt-1 max-h-48 list-disc overflow-auto pl-4">{summary.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div> : null}
      <p className="mt-3 text-xs text-muted-foreground">Затирание: {summary.mash}</p>
      <p className="mt-1 text-xs text-muted-foreground">Позиции: {summary.ingredientPreview}</p>
    </div>
  );
}

/**
 * "Грязна" ли форма (для guard'а Dialog): есть непустой введённый/загруженный текст
 * импорта, а импорт ещё не завершился успехом (успех = данные уже применены,
 * терять нечего).
 */
export const isImportExportModalDirty = ({
  importText,
  statusTone
}: {
  importText: string;
  statusTone: ImportExportStatus["tone"] | null;
}) => Boolean(importText.trim()) && statusTone !== "success";

export function ImportExportModal({
  open,
  pending,
  activeRecipeId,
  beerXmlExport,
  beerXmlImport,
  brewfatherJsonImport,
  originalBrewfatherJson,
  onBeerXmlImportChange,
  onBrewfatherJsonImportChange,
  onExportBeerXml,
  onImportBeerXml,
  onImportBrewfatherJson,
  onClose,
  preferredGravityUnit
}: {
  open: boolean;
  pending: boolean;
  activeRecipeId: string | null;
  beerXmlExport: string;
  beerXmlImport: string;
  brewfatherJsonImport: string;
  originalBrewfatherJson?: string;
  onBeerXmlImportChange: (next: string) => void;
  onBrewfatherJsonImportChange: (next: string) => void;
  onExportBeerXml: () => Promise<ImportExportActionResult>;
  onImportBeerXml: () => Promise<ImportExportActionResult>;
  onImportBrewfatherJson: () => Promise<ImportExportActionResult>;
  onClose: () => void;
  preferredGravityUnit: PreferredGravityUnit;
}) {
  const [mode, setMode] = useState<"import" | "export">("export");
  const [format, setFormat] = useState<ImportFormat>("beerxml");
  const [localPending, setLocalPending] = useState(false);
  const [status, setStatus] = useState<ImportExportStatus | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setStatus(null);
    }
  }, [open]);

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
  const importSummary = useMemo(
    () => buildImportRecipeSummary(format, importText, preferredGravityUnit),
    [format, importText, preferredGravityUnit]
  );
  const formatLabel = format === "beerxml" ? "BeerXML" : "Brewfather JSON";
  const fileAccept = format === "beerxml"
    ? ".xml,.beerxml,application/xml,text/xml"
    : ".json,application/json";
  const dirty = isImportExportModalDirty({ importText, statusTone: status?.importCompleted ? "success" : null });

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
          ? "Выберите файл BeerXML с расширением .xml или .beerxml."
          : "Выберите файл Brewfather в формате JSON с расширением .json."
      });
      return;
    }

    if (file.size > RECIPE_IMPORT_MAX_INPUT_BYTES) {
      setStatus({ tone: "error", message: "Файл превышает 8 МБ. Разделите библиотеку на несколько файлов." });
      return;
    }
    const reader = new FileReader();
    setStatus({ tone: "pending", message: `Читаем файл ${file.name}...` });
    reader.onerror = () => {
      setStatus({
        tone: "error",
        message: "Файл не удалось прочитать.",
        details: [reader.error?.message ?? "Попробуйте выбрать файл ещё раз."]
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
          importCompleted: true,
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
    setStatus({ tone: "pending", message: "Готовим экспорт в BeerXML…" });
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
        message: "Не удалось подготовить экспорт в BeerXML.",
        details: [error instanceof Error ? error.message : "Неизвестная ошибка."]
      });
    } finally {
      setLocalPending(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            onClose();
          }
        }}
        title="Импорт / экспорт"
        hideTitle
        size="lg"
        guard={{
          isDirty: () => dirty,
          onGuardedClose: () => setCloseConfirmOpen(true)
        }}
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Импорт / экспорт</h3>
            </div>
          </div>
          <DialogCloseButton />
        </DialogHeader>

        <div className="space-y-4 p-5">
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">1. Что хотите сделать?</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setMode("import")} className={`rounded-lg px-3 py-3 text-sm ${mode === "import" ? "bg-foreground text-background" : "border border-border bg-card text-foreground"}`}>Импортировать рецепт</button>
              <button type="button" onClick={() => setMode("export")} className={`rounded-lg px-3 py-3 text-sm ${mode === "export" ? "bg-foreground text-background" : "border border-border bg-card text-foreground"}`}>Экспортировать рецепт</button>
            </div>
          </section>

          {mode === "import" ? (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">2. Формат импорта</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setFormat("beerxml")} className={`rounded-lg px-3 py-3 text-sm ${format === "beerxml" ? "bg-foreground text-background" : "border border-border bg-card text-foreground"}`}>BeerXML</button>
                <button type="button" onClick={() => setFormat("brewfather_json")} className={`rounded-lg px-3 py-3 text-sm ${format === "brewfather_json" ? "bg-foreground text-background" : "border border-border bg-card text-foreground"}`}>Импорт из Brewfather</button>
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
              <h4 className="text-sm font-semibold text-foreground">3. Вставьте текст или загрузите файл</h4>
              <p className="text-xs text-muted-foreground">{format === "brewfather_json" ? "В Brewfather экспортируйте рецепт в JSON или скачайте резервную копию: Settings → Data → Export. Можно загрузить один или несколько рецептов, в том числе из резервной копии: до 100 рецептов и до 8 МБ. Склад и история варок не переносятся. Исходный файл рецепта сохранится и будет доступен только вам." : "Можно загрузить один рецепт или несколько рецептов в одном файле: до 100 рецептов и до 8 МБ."} Все импортированные рецепты будут доступны только вам.</p>
              <input type="file" accept={fileAccept} onChange={(event) => handleFile(event.target.files?.[0] ?? null)} className="block w-full text-sm text-muted-foreground" />
              <textarea
                value={importText}
                onChange={(event) => { setStatus(null); setImportText(event.target.value); }}
                className="min-h-56 w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground"
                placeholder={format === "beerxml" ? "<RECIPES>...</RECIPES>" : "{\"name\":\"Recipe\"}"}
              />
              <ImportSummaryCard result={importSummary} />
              <Button
                type="button"
                size="sm"
                disabled={busy || !importText.trim() || !importSummary?.ok}
                onClick={() => void handleImport()}
              >
                {busy ? "Импортируем..." : importSummary?.ok && importSummary.summary.recipes ? `Импортировать рецепты (${importSummary.summary.recipes.length})` : "Импортировать"}
              </Button>
            </section>
          ) : (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">2. Экспорт BeerXML</h4>
              <p className="text-xs text-muted-foreground">В файл входят описание, ингредиенты и процесс. Личные заметки автора в файл не включаются. Дополнительные поля NB позволяют восстановить настройки воды и этапы варки при повторном импорте.</p>
              {originalBrewfatherJson ? <div className="rounded border border-border p-3 text-xs"><p>Исходный рецепт Brewfather доступен только владельцу и содержит все поля исходного JSON, включая заметки.</p><a className="mt-1 inline-block underline" href={`data:application/json;charset=utf-8,${encodeURIComponent(originalBrewfatherJson)}`} download="original-brewfather-recipe.json">Скачать исходный Brewfather JSON</a></div> : null}
              <Button
                type="button"
                size="sm"
                disabled={!activeRecipeId || busy}
                onClick={() => void handleExport()}
              >
                {busy ? "Экспортируем..." : "Экспортировать BeerXML"}
              </Button>
              <textarea
                value={beerXmlExport}
                readOnly
                className="min-h-56 w-full rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground"
                placeholder="Экспорт появится здесь."
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!beerXmlExport}
                  onClick={() => void navigator.clipboard?.writeText(beerXmlExport)}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
                >
                  Скопировать BeerXML
                </button>
                <a
                  href={beerXmlExport ? `data:text/xml;charset=utf-8,${encodeURIComponent(beerXmlExport)}` : undefined}
                  download="recipe.beerxml"
                  className={`rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground ${beerXmlExport ? "" : "pointer-events-none opacity-50"}`}
                >
                  Скачать BeerXML
                </a>
              </div>
            </section>
          )}
        </div>
      </Dialog>

      <ConfirmActionDialog
        open={closeConfirmOpen}
        title="Закрыть без сохранения?"
        description="Введённые данные будут потеряны."
        confirmLabel="Закрыть"
        tone="danger"
        onConfirm={() => {
          setCloseConfirmOpen(false);
          onClose();
        }}
        onClose={() => setCloseConfirmOpen(false)}
      />
    </>
  );
}
