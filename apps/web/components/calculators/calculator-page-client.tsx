"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  Trash2
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

import { calibrateWcf, sgToBrix } from "@nb/brewing-core";

import { calculatorBySlug, type CalculatorSlug } from "@/features/calculators/catalog";
import {
  calculatorStorageKey,
  calculatorDefinitionBySlug,
  computeRefractometerView,
  initialCalculatorStateFromQuery,
  refractometerOgDefault,
  refractometerOgUnitOptions,
  REFRACTOMETER_FORMULA_OPTIONS,
  type ArrayCalculatorField,
  type CalculatorField,
  type CalculatorResult,
  type CalculatorState,
  type RefractometerView,
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
        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-semibold text-zinc-500">?</span>
      </summary>
      <p className="mt-3 text-sm leading-6 text-zinc-500">{formula}</p>
    </details>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  fill = true
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  size?: "md" | "sm";
  fill?: boolean;
}) {
  const buttonSize = size === "md" ? "h-10 text-sm" : "h-8 text-xs";

  return (
    <div role="group" aria-label={ariaLabel} className={`${fill ? "flex" : "inline-flex"} gap-1 rounded-xl bg-zinc-100 p-1`}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`${fill ? "flex-1" : ""} rounded-lg px-3 font-medium transition-colors ${buttonSize} ${
              active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function RefractoNumberInput({
  label,
  unit,
  helper,
  value,
  onChange,
  step = 0.1,
  min = 0
}: {
  label: string;
  unit?: string;
  helper?: string;
  value: unknown;
  onChange: (value: string) => void;
  step?: number;
  min?: number;
}) {
  return (
    <label className="block min-w-0 text-xs font-medium text-zinc-600">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        {unit ? <span className="font-normal text-zinc-400">{unit}</span> : null}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={String(value ?? "")}
        min={min}
        step={step}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base tabular-nums text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 sm:text-sm"
      />
      {helper ? <span className="mt-1 block text-[11px] font-normal leading-4 text-zinc-400">{helper}</span> : null}
    </label>
  );
}

function WcfCalibrator({ onApply }: { onApply: (wcf: number) => void }) {
  const [refractoBrix, setRefractoBrix] = useState("");
  const [hydroReading, setHydroReading] = useState("");
  const [hydroUnit, setHydroUnit] = useState<"SG" | "Plato">("SG");

  const refracto = Number(refractoBrix);
  const hydro = Number(hydroReading);
  const hasInputs = refractoBrix.trim() !== "" && hydroReading.trim() !== ""
    && Number.isFinite(refracto) && refracto > 0 && Number.isFinite(hydro) && hydro > 0;

  const trueBrix = hasInputs ? (hydroUnit === "SG" ? sgToBrix(hydro) : hydro) : null;
  const wcf = hasInputs && trueBrix != null && trueBrix > 0
    ? calibrateWcf({ refractometerBrix: refracto, hydrometerReading: hydro, hydrometerUnit: hydroUnit })
    : null;

  return (
    <div className="space-y-3">
      <div className={fieldGridClassName}>
        <RefractoNumberInput
          label="Рефрактометр"
          unit="Brix"
          value={refractoBrix}
          step={0.1}
          onChange={(value) => setRefractoBrix(value)}
        />
        <RefractoNumberInput
          label="Ареометр / сахаромер"
          unit={hydroUnit === "SG" ? "SG" : "°P"}
          value={hydroReading}
          step={hydroUnit === "SG" ? 0.001 : 0.1}
          onChange={(value) => setHydroReading(value)}
        />
      </div>

      <SegmentedControl
        ariaLabel="Шкала ареометра"
        size="sm"
        fill={false}
        options={[
          { value: "SG", label: "SG" },
          { value: "Plato", label: "°P" }
        ]}
        value={hydroUnit}
        onChange={(value) => setHydroUnit(value as "SG" | "Plato")}
      />

      <div className="rounded-lg bg-zinc-50 px-3 py-2.5 text-sm tabular-nums text-zinc-600">
        {wcf != null && trueBrix != null ? (
          <span>{refracto} ÷ {trueBrix.toFixed(1)} Brix = <strong className="text-zinc-900">{wcf}</strong></span>
        ) : (
          <span className="text-xs text-zinc-400">Коэффициент = показание рефрактометра ÷ Brix по ареометру</span>
        )}
      </div>

      <button
        type="button"
        disabled={wcf == null}
        onClick={() => { if (wcf != null) { onApply(wcf); } }}
        className="h-10 w-full rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
      >
        Применить коэффициент
      </button>
      <p className="text-[11px] leading-4 text-zinc-400">
        Делается один раз — дальше значение постоянно для твоего прибора. Замеряй по суслу до брожения (без спирта).
      </p>
    </div>
  );
}

function RefractometerFieldsBlock({
  state,
  onChange,
  onReset
}: {
  state: CalculatorState;
  onChange: (name: string, value: unknown) => void;
  onReset: () => void;
}) {
  const mode = String(state.mode ?? "post_fermentation");
  const originalUnit = String(state.originalUnit ?? "Brix");
  const isPost = mode === "post_fermentation";
  const ogUnitLabel = refractometerOgUnitOptions.find((option) => option.value === originalUnit)?.label ?? originalUnit;

  const coefficientField = (
    <RefractoNumberInput
      label="Поправочный коэффициент"
      unit="WCF"
      value={state.wortCorrectionFactor}
      min={0.8}
      step={0.01}
      onChange={(value) => onChange("wortCorrectionFactor", value)}
    />
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-zinc-900">Замер рефрактометром</h2>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Сбросить
        </button>
      </div>

      <div className="space-y-5 p-5">
        <div className="space-y-2">
          <SegmentedControl
            ariaLabel="Режим"
            options={[
              { value: "pre_fermentation", label: "До брожения" },
              { value: "post_fermentation", label: "Во время и после" }
            ]}
            value={mode}
            onChange={(value) => onChange("mode", value)}
          />
          <p className="text-xs leading-5 text-zinc-500">
            {isPost
              ? "Спирт искажает показания рефрактометра — нужны начальная и текущая плотности."
              : "Несброженное сусло: спирта ещё нет, нужен только поправочный коэффициент."}
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            <RefractoNumberInput
              label={isPost ? "Текущая плотность" : "Плотность сусла"}
              unit="Brix"
              value={state.currentBrix}
              step={0.1}
              onChange={(value) => onChange("currentBrix", value)}
            />
            {isPost ? (
              <RefractoNumberInput
                label="Начальная плотность (OG)"
                unit={ogUnitLabel}
                value={state.originalValue}
                min={0}
                step={originalUnit === "SG" ? 0.001 : 0.1}
                onChange={(value) => onChange("originalValue", value)}
              />
            ) : coefficientField}
          </div>

          {isPost ? (
            <div className="grid gap-x-4 gap-y-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]">
              {coefficientField}
              <label className="block min-w-0 text-xs font-medium text-zinc-600">
                <span>Формула пересчёта</span>
                <select
                  value={String(state.formula ?? "novotny")}
                  onChange={(event) => onChange("formula", event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 sm:text-sm"
                >
                  {REFRACTOMETER_FORMULA_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <div className="min-w-0">
                <span className="block text-xs font-medium text-zinc-600">Единица OG</span>
                <div className="mt-1">
                  <SegmentedControl
                    ariaLabel="Единица OG"
                    size="sm"
                    fill={false}
                    options={refractometerOgUnitOptions}
                    value={originalUnit}
                    onChange={(nextUnit) => {
                      onChange("originalUnit", nextUnit);
                      onChange("originalValue", String(refractometerOgDefault(nextUnit)));
                    }}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <details className="group rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-700">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white shadow-sm">
              <ChevronRight className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-90" />
            </div>
            Калибровка коэффициента
          </summary>
          <div className="mt-4 space-y-4">
            <p className="text-[11px] leading-4 text-zinc-500">
              Рефрактометр откалиброван по чистой сахарозе, а в сусле есть белки и декстрины — поэтому он немного завышает. Поправочный коэффициент подгоняет прибор под твоё сусло: 1,04 — рабочее значение, но точнее измерить своё.
            </p>
            <WcfCalibrator onApply={(wcf) => onChange("wortCorrectionFactor", String(wcf))} />
          </div>
        </details>
      </div>
    </div>
  );
}

function RefractometerResultPanel({ state }: { state: CalculatorState }) {
  let view: RefractometerView;
  try {
    view = computeRefractometerView(state);
  } catch {
    return (
      <aside className="lg:sticky lg:top-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">Скорректированная плотность</p>
          <p className="mt-2 text-sm leading-5 text-zinc-500">Проверьте входные значения.</p>
        </div>
      </aside>
    );
  }

  const isPost = view.mode === "post_fermentation";
  // The big result follows the unit chosen for the OG input (post). Pre-fermentation
  // has no unit picker, so it keeps the conventional SG as the headline.
  const primaryUnit = isPost ? String(state.originalUnit ?? "Brix") : "SG";
  const correctedUnits = [
    { key: "SG", value: view.corrected.sg.toFixed(3), label: "SG" },
    { key: "Plato", value: view.corrected.plato.toFixed(1), label: "°P" },
    { key: "Brix", value: view.corrected.brix.toFixed(1), label: "Brix" }
  ];
  const primary = correctedUnits.find((unit) => unit.key === primaryUnit) ?? correctedUnits[0];
  const secondary = correctedUnits.filter((unit) => unit.key !== primary.key);

  const attenuationText = view.attenuationBand === "low"
    ? "Ниже 65% — брожение, возможно, не завершено."
    : view.attenuationBand === "high"
      ? "Выше 80% — сухой профиль (лагеры, сэзоны, дикие дрожжи)."
      : "65–80% — нормально для большинства элей.";

  return (
    <aside className="lg:sticky lg:top-6">
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 bg-gradient-to-b from-zinc-50 to-white px-5 py-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">Скорректированная плотность</p>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold leading-none tabular-nums text-zinc-950">{primary.value}</span>
            <span className="text-sm font-medium text-zinc-400">{primary.label}</span>
          </div>
          <div className="mt-3 flex gap-2">
            {secondary.map((unit) => (
              <span key={unit.key} className="rounded-md bg-white px-2.5 py-1 text-xs font-medium tabular-nums text-zinc-600 ring-1 ring-zinc-200">{unit.value} {unit.label}</span>
            ))}
          </div>
        </div>

        {isPost ? (
          <div className="space-y-3 p-5">
            <dl className="grid grid-cols-2 gap-3">
              <div className="min-w-0 rounded-xl border border-zinc-100 bg-zinc-50/70 px-3 py-2.5">
                <dt className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">ABV оценка</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">{view.estimatedABV.toFixed(1)}%</dd>
              </div>
              <div className={`min-w-0 rounded-xl border px-3 py-2.5 ${
                view.attenuationBand === "normal"
                  ? "border-emerald-100 bg-emerald-50 text-emerald-950"
                  : "border-amber-100 bg-amber-50 text-amber-950"
              }`}>
                <dt className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">Сбраживание</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{view.attenuation.toFixed(0)}%</dd>
              </div>
            </dl>
            <p className="rounded-xl border border-zinc-100 bg-zinc-50/70 px-3 py-2.5 text-xs leading-5 text-zinc-600">{attenuationText}</p>
          </div>
        ) : (
          <div className="p-5">
            <p className="rounded-xl border border-zinc-100 bg-zinc-50/70 px-3 py-2.5 text-xs leading-5 text-zinc-600">
              Спирт ещё не учитывается — это плотность несброженного сусла.
            </p>
          </div>
        )}
      </div>
    </aside>
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
  // The refractometer block renders its own advanced section (WCF + calibrator + formula),
  // so the generic advanced panel must stay off to avoid duplicating those fields.
  const showAdvanced = advancedFields.length > 0 && definition.catalog.slug !== "refractometer-correction";

  const handleFieldChange = (name: string, value: unknown) => {
    setState((current) => ({ ...current, [name]: value }));
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

  const isRefractometer = definition.catalog.slug === "refractometer-correction";
  const gridClassName = isRefractometer
    ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6"
    : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]";

  return (
    <main className={`space-y-5 pb-24 pt-8 ${isRefractometer ? "mx-auto max-w-5xl" : ""}`}>
      <Link href="/calculators" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" />
        Все калькуляторы
      </Link>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="max-w-3xl space-y-2">
          <h1 className="text-2xl font-semibold leading-tight text-zinc-950 sm:text-3xl">{definition.catalog.title}</h1>
          <p className="text-sm leading-6 text-zinc-600">{definition.catalog.intro}</p>
        </div>
      </section>

      <div className={gridClassName}>
        <section className="space-y-4">
          {definition.catalog.slug === "refractometer-correction" ? (
            <RefractometerFieldsBlock state={state} onChange={handleFieldChange} onReset={resetState} />
          ) : (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={resetState}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Сбросить
                </button>
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
          )}

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

        {definition.catalog.slug === "refractometer-correction" ? (
          <RefractometerResultPanel state={state} />
        ) : (
          <ResultPanel result={result} />
        )}
      </div>

      <FormulaDetails formula={definition.catalog.formula} />

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
    </main>
  );
}
