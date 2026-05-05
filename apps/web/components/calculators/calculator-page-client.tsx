"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Clipboard,
  Plus,
  RotateCcw,
  Share2,
  Trash2
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

import { calculatorBySlug, type CalculatorSlug } from "@/features/calculators/catalog";
import {
  calculatorStorageKey,
  calculatorDefinitionBySlug,
  initialCalculatorStateFromQuery,
  serializeCalculatorStateToQuery,
  type ArrayCalculatorField,
  type CalculatorField,
  type CalculatorResult,
  type CalculatorState,
  type ScalarCalculatorField
} from "@/features/calculators/definitions";

const cloneState = (state: CalculatorState): CalculatorState => JSON.parse(JSON.stringify(state)) as CalculatorState;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
);

const normalizeStoredState = (value: string | null): CalculatorState | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const fieldGridClassName = "grid gap-3 sm:grid-cols-2";

const converterGroupDefaults: Record<string, { from: string; value: string }> = {
  gravity: { from: "SG", value: "1.05" },
  color: { from: "SRM", value: "6" },
  volume: { from: "L", value: "20" },
  weight: { from: "kg", value: "1" },
  temperature: { from: "C", value: "20" },
  pressure: { from: "PSI", value: "14.5" },
  concentration: { from: "ppm", value: "100" }
};

function CalculatorInput({
  field,
  value,
  onChange
}: {
  field: ScalarCalculatorField;
  value: unknown;
  onChange: (value: string) => void;
}) {
  const commonClassName = "mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200";

  return (
    <label className="block min-w-0 text-xs font-medium text-zinc-600">
      <span className="flex items-center justify-between gap-2">
        <span>{field.label}</span>
        {field.unit ? <span className="font-normal text-zinc-400">{field.unit}</span> : null}
      </span>
      {field.kind === "select" ? (
        <select
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          className={commonClassName}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={field.kind}
          value={String(value ?? "")}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(event) => onChange(event.target.value)}
          className={`${commonClassName} ${field.kind === "number" ? "tabular-nums" : ""}`}
        />
      )}
      {field.helper ? <span className="mt-1 block text-[11px] font-normal leading-4 text-zinc-400">{field.helper}</span> : null}
    </label>
  );
}

function ArrayFieldEditor({
  field,
  value,
  onChange
}: {
  field: ArrayCalculatorField;
  value: unknown;
  onChange: (value: Array<Record<string, unknown>>) => void;
}) {
  const rows = Array.isArray(value) && value.length > 0
    ? value.filter((row): row is Record<string, unknown> => isRecord(row))
    : [{}];
  const minRows = field.minRows ?? 0;

  const updateRow = (index: number, key: string, nextValue: string) => {
    onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: nextValue } : row));
  };

  const addRow = () => {
    const template = rows[0] ?? {};
    onChange([...rows, { ...template }]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= minRows) {
      return;
    }

    onChange(rows.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <section className="space-y-3 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800">{field.label}</h3>
          {field.helper ? <p className="text-xs text-zinc-400">{field.helper}</p> : null}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {field.addLabel}
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="rounded-xl border border-zinc-100 bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-500">{field.label} {index + 1}</span>
              {rows.length > minRows ? (
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Удалить строку"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <div className={fieldGridClassName}>
              {field.fields.map((subfield) => (
                <CalculatorInput
                  key={subfield.name}
                  field={subfield}
                  value={row[subfield.name]}
                  onChange={(nextValue) => updateRow(index, subfield.name, nextValue)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FieldsBlock({
  fields,
  state,
  onChange
}: {
  fields: CalculatorField[];
  state: CalculatorState;
  onChange: (name: string, value: unknown) => void;
}) {
  return (
    <div className="space-y-3">
      <div className={fieldGridClassName}>
        {fields.filter((field) => field.kind !== "array").map((field) => (
          <CalculatorInput
            key={field.name}
            field={field}
            value={state[field.name]}
            onChange={(nextValue) => onChange(field.name, nextValue)}
          />
        ))}
      </div>
      {fields.filter((field): field is ArrayCalculatorField => field.kind === "array").map((field) => (
        <ArrayFieldEditor
          key={field.name}
          field={field}
          value={state[field.name]}
          onChange={(nextValue) => onChange(field.name, nextValue)}
        />
      ))}
    </div>
  );
}

function UnitConverterFieldsBlock({
  state,
  result,
  onChange
}: {
  state: CalculatorState;
  result: CalculatorResult;
  onChange: (name: string, value: unknown) => void;
}) {
  const group = String(state.group ?? "gravity");

  return (
    <div className="space-y-3">
      <CalculatorInput
        field={{
          kind: "select",
          name: "group",
          label: "Группа",
          options: [
            { value: "gravity", label: "Плотность" },
            { value: "color", label: "Цвет" },
            { value: "volume", label: "Объем" },
            { value: "weight", label: "Вес" },
            { value: "temperature", label: "Температура" },
            { value: "pressure", label: "Давление" },
            { value: "concentration", label: "Концентрации" }
          ]
        }}
        value={group}
        onChange={(nextGroup) => {
          const defaults = converterGroupDefaults[nextGroup] ?? converterGroupDefaults.gravity;
          onChange("group", nextGroup);
          onChange("from", defaults.from);
          onChange("value", defaults.value);
        }}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {result.stats.map((stat) => (
          <label key={stat.label} className="block min-w-0 text-xs font-medium text-zinc-600">
            <span className="flex items-center justify-between gap-2">
              <span>{stat.label}</span>
              {String(state.from) === stat.label ? <span className="font-normal text-zinc-400">исходное</span> : null}
            </span>
            <input
              type="number"
              value={stat.value}
              step={stat.label === "SG" ? 0.001 : 0.01}
              onChange={(event) => {
                onChange("from", stat.label);
                onChange("value", event.target.value);
              }}
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm tabular-nums text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function ResultPanel({
  result
}: {
  result: CalculatorResult;
}) {
  return (
    <aside className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">
      <div className="rounded-xl bg-zinc-50 p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">{result.primary.label}</p>
        <p className="mt-1 break-words text-3xl font-semibold leading-tight tabular-nums text-zinc-950">{result.primary.value}</p>
        {result.primary.helper ? <p className="mt-2 text-sm leading-5 text-zinc-500">{result.primary.helper}</p> : null}
      </div>
      <dl className="grid grid-cols-2 gap-2">
        {result.stats.map((stat) => (
          <div
            key={`${stat.label}-${stat.value}`}
            className={`min-w-0 rounded-xl border px-3 py-2.5 ${
              stat.tone === "warning"
                ? "border-amber-100 bg-amber-50 text-amber-950"
                : stat.tone === "good"
                  ? "border-emerald-100 bg-emerald-50 text-emerald-950"
                  : "border-zinc-100 bg-white text-zinc-950"
            }`}
          >
            <dt className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">{stat.label}</dt>
            <dd className="mt-1 break-words text-sm font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      {result.warnings && result.warnings.length > 0 ? (
        <div className="space-y-1 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          {result.warnings.slice(0, 4).map((warning) => (
            <p key={warning} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warning}</span>
            </p>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function FormulaDetails({ formula }: { formula: string }) {
  return (
    <details className="group rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-700">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100">
          <ChevronRight className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-90" />
        </div>
        Метод расчета
      </summary>
      <p className="mt-3 text-sm leading-6 text-zinc-500">{formula}</p>
    </details>
  );
}

export function CalculatorPageClient({
  slug,
  initialQuery
}: {
  slug: CalculatorSlug;
  initialQuery: Record<string, string>;
}) {
  const definition = calculatorDefinitionBySlug[slug];
  const [state, setState] = useState<CalculatorState>(() => (
    initialCalculatorStateFromQuery(definition, initialQuery)
  ));
  const [mounted, setMounted] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    const storedState = normalizeStoredState(window.localStorage.getItem(calculatorStorageKey(definition.catalog.slug)));
    const baseState = storedState ? { ...cloneState(definition.defaults), ...storedState } : cloneState(definition.defaults);
    setState(initialCalculatorStateFromQuery(definition, initialQuery, baseState));
    setMounted(true);
  }, [definition, initialQuery]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    window.localStorage.setItem(calculatorStorageKey(definition.catalog.slug), JSON.stringify(state));
  }, [definition.catalog.slug, mounted, state]);

  const result = useMemo(() => {
    try {
      return definition.calculate(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Проверьте входные значения.";
      return {
        primary: { label: "Расчет недоступен", value: "—", helper: message },
        stats: [],
        warnings: [message],
        links: []
      } satisfies CalculatorResult;
    }
  }, [definition, state]);

  const mainFields = definition.fields.filter((field) => !field.advanced);
  const advancedFields = definition.fields.filter((field) => field.advanced);
  const showAdvanced = advancedFields.length > 0;

  const handleFieldChange = (name: string, value: unknown) => {
    setState((current) => ({ ...current, [name]: value }));
  };

  const shareUrl = () => {
    const params = serializeCalculatorStateToQuery(definition, state);
    const query = params.toString();
    const path = definition.catalog.href;
    return `${window.location.origin}${path}${query ? `?${query}` : ""}`;
  };

  const copyResult = async () => {
    const text = `${definition.catalog.title}: ${result.primary.label} ${result.primary.value}${result.primary.helper ? ` (${result.primary.helper})` : ""}`;
    await navigator.clipboard?.writeText(text);
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 1400);
  };

  const copyShareUrl = async () => {
    await navigator.clipboard?.writeText(shareUrl());
    setShareState("copied");
    window.setTimeout(() => setShareState("idle"), 1400);
  };

  const resetState = () => {
    const next = cloneState(definition.defaults);
    setState(next);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(calculatorStorageKey(definition.catalog.slug));
    }
  };

  const linkMap = new Map<string, string>();
  for (const link of result.links ?? []) {
    linkMap.set(link.href, link.label);
  }
  for (const slug of definition.catalog.relatedSlugs) {
    if (definition.catalog.slug !== slug) {
      linkMap.set(`/calculators/${slug}`, calculatorBySlug[slug].shortTitle);
    }
  }
  const links = [...linkMap.entries()].map(([href, label]) => ({
    href,
    label: label || href.split("/").pop()?.replaceAll("-", " ") || href
  }));

  return (
    <main className="space-y-5 pb-24 pt-8">
      <Link href="/calculators" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" />
        Все калькуляторы
      </Link>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <h1 className="text-2xl font-semibold leading-tight text-zinc-950 sm:text-3xl">{definition.catalog.title}</h1>
            <p className="text-sm leading-6 text-zinc-600">{definition.catalog.intro}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyResult}
              aria-label="Копировать"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              {copyState === "copied" ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
              {copyState === "copied" ? "Готово" : "Копировать"}
            </button>
            <button
              type="button"
              onClick={copyShareUrl}
              aria-label="Ссылка"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              {shareState === "copied" ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
              {shareState === "copied" ? "Готово" : "Ссылка"}
            </button>
            <button
              type="button"
              onClick={resetState}
              aria-label="Сбросить"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Сбросить
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-zinc-950">Ввод</h2>
            </div>
            {definition.catalog.slug === "unit-converter" ? (
              <UnitConverterFieldsBlock
                state={state}
                result={result}
                onChange={handleFieldChange}
              />
            ) : (
              <FieldsBlock fields={mainFields} state={state} onChange={handleFieldChange} />
            )}
          </div>

          {showAdvanced ? (
            <details className="group rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-700">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100">
                  <ChevronRight className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-90" />
                </div>
                Дополнительно
              </summary>
              <div className="mt-4">
                <FieldsBlock fields={advancedFields} state={state} onChange={handleFieldChange} />
              </div>
            </details>
          ) : null}
        </section>

        <ResultPanel result={result} />
      </div>

      <section className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Дальше</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              {link.label}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
      </section>

      <FormulaDetails formula={definition.catalog.formula} />
    </main>
  );
}
