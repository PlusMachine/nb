"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Beaker,
  ChevronRight,
  Droplet,
  FlaskConical,
  Gauge,
  Palette,
  Plus,
  RotateCcw,
  Thermometer,
  Trash2,
  Weight,
  type LucideIcon
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { calibrateWcf, convertBrewingUnitGroup, sgToBrix, sgToPlato, type CalculatorGravityUnit } from "@nb/brewing-core";
import { Button } from "@nb/ui";

import { CopyLinkButton } from "@/components/shared/copy-link-button";
import { RelatedLinksSection } from "@/components/shared/related-links-section";
import { NumericInput } from "@/components/shared/numeric-input";
import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import { KegCarbonationBlock } from "@/components/calculators/keg-carbonation-block";
import type { IngredientSuggestionItem } from "@/features/ingredients/contracts";
import { calculatorBySlug, type CalculatorSlug } from "@/features/calculators/catalog";
import {
  calculatorStorageKey,
  calculatorDefinitionBySlug,
  computeAbvView,
  CONVERTER_GROUP_UNITS,
  computeDilutionView,
  computeHydrometerView,
  computeRefractometerView,
  convertRefractometerOgFieldValue,
  dilutionFindOptions,
  dilutionOperationOptions,
  dilutionOperationOfMode,
  DILUTION_BOILOFF_RATE_MODES,
  DILUTION_GRAVITY_TARGET_MODES,
  DILUTION_VOLUME_TARGET_MODES,
  initialCalculatorStateFromQuery,
  parseCalculatorQuery,
  refractometerOgDefault,
  refractometerOgUnitOptions,
  serializeCalculatorStateToQuery,
  REFRACTOMETER_FORMULA_OPTIONS,
  type AbvView,
  type ArrayCalculatorField,
  type DilutionOperation,
  type DilutionView,
  type HydrometerView,
  type CalculatorField,
  type CalculatorFieldOption,
  type CalculatorResult,
  type CalculatorResultStat,
  type CalculatorResultWarning,
  type CalculatorState,
  type RefractometerView,
  type ScalarCalculatorField
} from "@/features/calculators/definitions";
import { loadViewerPreferredGravityUnit } from "@/features/system/gravity-unit-actions";
import {
  convertGravityFieldValue,
  convertGravityOffsetValue,
  formatGravity,
  formatGravitySecondary,
  fromCalculatorGravityUnit,
  toAbvGravityUnit,
  toCalculatorGravityUnit,
  type PreferredGravityUnit
} from "@/features/system/gravity-units";
import { useViewerGravityUnit } from "@/features/system/use-viewer-gravity-unit";

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

// Конвертер: группы + иконки. Списки единиц — из CONVERTER_GROUP_UNITS (definitions.ts),
// общего с валидацией from во входящих ссылках (applyQuery).
const CONVERTER_GROUPS: Array<{ id: string; label: string; units: string[]; icon: LucideIcon }> = [
  { id: "gravity", label: "Плотность", icon: Droplet },
  { id: "color", label: "Цвет", icon: Palette },
  { id: "volume", label: "Объём", icon: Beaker },
  { id: "weight", label: "Вес", icon: Weight },
  { id: "temperature", label: "Температура", icon: Thermometer },
  { id: "pressure", label: "Давление", icon: Gauge },
  { id: "concentration", label: "Концентрация", icon: FlaskConical }
].map((group) => ({ ...group, units: CONVERTER_GROUP_UNITS[group.id] }));

// Человеческая подпись, короткий хинт и разряды отображения для каждой единицы.
// trimZeros — для единиц, где десятые нужны (50.5 GP ≠ 51 GP), но хвост ".0"
// у круглых значений — шум.
type ConverterUnitMeta = { label: string; note?: string; decimals: number; trimZeros?: boolean };
const CONVERTER_UNIT_META: Record<string, ConverterUnitMeta> = {
  SG: { label: "SG", note: "плотность", decimals: 3 },
  Plato: { label: "°P", note: "Плато", decimals: 1 },
  Brix: { label: "°Bx", note: "Брикс", decimals: 1 },
  points: { label: "GP", note: "пункты плотности", decimals: 1, trimZeros: true },
  SRM: { label: "SRM", decimals: 1 },
  EBC: { label: "EBC", decimals: 1 },
  Lovibond: { label: "°L", note: "Lovibond", decimals: 1 },
  ml: { label: "мл", decimals: 0 },
  L: { label: "л", decimals: 2 },
  oz: { label: "унц.", note: "US", decimals: 1 },
  qt: { label: "кварты", note: "US", decimals: 2 },
  gal: { label: "галлоны", note: "US", decimals: 2 },
  g: { label: "г", decimals: 0 },
  kg: { label: "кг", decimals: 2 },
  lb: { label: "фунты", note: "US", decimals: 2 },
  C: { label: "°C", decimals: 1 },
  F: { label: "°F", decimals: 1 },
  K: { label: "K", decimals: 1 },
  PSI: { label: "PSI", decimals: 1 },
  bar: { label: "bar", decimals: 2 },
  kPa: { label: "kPa", decimals: 0 },
  ppm: { label: "ppm", note: "мг/л", decimals: 1 },
  "g/L": { label: "г/л", decimals: 2 }
};

// Один ключ единицы может значить разное в разных группах: oz в объёме — жидкая унция
// (29.57 мл), в весе — весовая (28.35 г). Ключи выхода convertBrewingUnitGroup совпадают,
// поэтому подписи различаем здесь, оверрайдом по группе.
const CONVERTER_UNIT_META_BY_GROUP: Record<string, Record<string, ConverterUnitMeta>> = {
  volume: { oz: { label: "жидк. унц.", note: "fl oz US", decimals: 1 } }
};

const converterUnitMeta = (groupId: string, unit: string): ConverterUnitMeta => (
  CONVERTER_UNIT_META_BY_GROUP[groupId]?.[unit] ?? CONVERTER_UNIT_META[unit] ?? { label: unit, decimals: 2 }
);

const formatConverted = (value: number, meta: ConverterUnitMeta): string => {
  if (!Number.isFinite(value)) {
    return "";
  }
  const fixed = value.toFixed(meta.decimals);
  return meta.trimZeros ? fixed.replace(/\.0+$/, "") : fixed;
};

// Видимость поля/секции: без visibleWhen — всегда показываем. Для верхнеуровневых полей
// и целых array-секций row не передаётся; для подполей array-строк row обязателен.
const isFieldVisible = (field: CalculatorField, state: CalculatorState, row?: Record<string, unknown>): boolean => (
  field.visibleWhen ? field.visibleWhen(state, row) : true
);

function CalculatorInput({
  field,
  value,
  state,
  row,
  size = "md",
  onChange
}: {
  field: ScalarCalculatorField;
  value: unknown;
  state: CalculatorState;
  row?: Record<string, unknown>;
  size?: "sm" | "md";
  onChange: (value: string) => void;
}) {
  const commonClassName = "mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground shadow-sm focus:border-border focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm";
  const options: CalculatorFieldOption[] = field.dynamicOptions ? field.dynamicOptions(state, row) : (field.options ?? []);
  const unitLabel = field.dynamicUnit ? field.dynamicUnit(state, row) : field.unit;
  const step = field.dynamicStep ? field.dynamicStep(state, row) : field.step;

  return (
    <label className="block min-w-0 text-xs font-medium text-muted-foreground">
      <span className="flex items-center justify-between gap-2">
        <span>{field.label}</span>
        {unitLabel ? <span className="font-normal text-muted-foreground">{unitLabel}</span> : null}
      </span>
      {field.kind === "select" ? (
        field.variant === "segmented" ? (
          <div className="mt-1">
            <SegmentedControl
              ariaLabel={field.label}
              size={size}
              options={options}
              value={String(value ?? "")}
              onChange={onChange}
            />
          </div>
        ) : field.variant === "chips" ? (
          <div className="mt-1">
            <ChipSelect
              ariaLabel={field.label}
              options={options}
              value={String(value ?? "")}
              onChange={onChange}
            />
          </div>
        ) : (
          <select
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
            className={commonClassName}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        )
      ) : field.kind === "number" ? (
        <NumericInput
          value={String(value ?? "")}
          integer={field.integer}
          min={field.min}
          max={field.max}
          step={step}
          // Без явного min (в основном температуры) поле должно принимать минус — иначе
          // отрицательные значения обрезаются посимвольным фильтром NumericInput.
          allowNegative={field.min === undefined || field.min < 0}
          onChange={(event) => onChange(event.target.value)}
          className={`${commonClassName} tabular-nums`}
        />
      ) : (
        <input
          type="date"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          className={commonClassName}
        />
      )}
      {field.helper ? <span className="mt-1 block text-[11px] font-normal leading-4 text-muted-foreground">{field.helper}</span> : null}
    </label>
  );
}

// Подполе строки массива kind: "ingredient" (см. brewhouse-efficiency "Засыпь"): вместо
// обычного контрола рендерит IngredientPicker. Свободный ввод текста без выбора из каталога
// валиден — сохраняется как есть в поле; выбор элемента каталога передаётся наверх (onPick
// в ArrayFieldEditor решает, какие соседние подполя строки заполнить).
function IngredientRowField({
  field,
  value,
  onValueChange,
  onSelect
}: {
  field: ScalarCalculatorField;
  value: unknown;
  onValueChange: (value: string) => void;
  onSelect: (item: IngredientSuggestionItem) => void;
}) {
  return (
    <label className="block min-w-0 text-xs font-medium text-muted-foreground">
      <span className="flex items-center justify-between gap-2">
        <span>{field.label}</span>
      </span>
      <div className="mt-1">
        <IngredientPicker
          category={field.ingredientCategory}
          value={String(value ?? "")}
          onValueChange={onValueChange}
          onSelect={onSelect}
          placeholder={field.placeholder}
          enableQuickStart
          includeCustom={false}
          // База — помощник, а не обязаловка: если позиции нет в каталоге, введённое
          // название уже принято (onValueChange пишет его в строку), и стандартное
          // «Ничего не найдено» читалось бы как тупик. Подсказываем ввести PPG вручную.
          emptyCta={
            <p className="text-xs text-muted-foreground">
              Нет в базе — оставьте своё название и укажите экстрактивность (PPG) вручную.
            </p>
          }
        />
      </div>
    </label>
  );
}

function ArrayFieldEditor({
  field,
  value,
  state,
  onChange
}: {
  field: ArrayCalculatorField;
  value: unknown;
  state: CalculatorState;
  onChange: (value: Array<Record<string, unknown>>) => void;
}) {
  const rows = Array.isArray(value) && value.length > 0
    ? value.filter((row): row is Record<string, unknown> => isRecord(row))
    : [{}];
  const minRows = field.minRows ?? 0;

  const updateRow = (index: number, key: string, nextValue: string) => {
    onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: nextValue } : row));
  };

  // Для kind: "ingredient" — onPick заполняет сразу несколько подполей строки (имя,
  // экстрактивность, тип затирания), а не только своё собственное поле.
  const applyRowPatch = (index: number, patch: Record<string, unknown>) => {
    onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  // Не клонируем первую строку целиком: числовые/дата-поля стартуют пустыми (нужен явный
  // ввод), select-поля наследуют значение последней строки (форма/тип хмеля обычно те же),
  // а скрытые/advanced — берут значение из шаблона (первой строки), чтобы не заставлять
  // пользователя открывать «Дополнительно» на каждую новую строку.
  const addRow = () => {
    const templateRow = rows[0] ?? {};
    const lastRow = rows[rows.length - 1] ?? templateRow;
    const nextRow: Record<string, unknown> = {};

    for (const subfield of field.fields) {
      if (subfield.advanced) {
        nextRow[subfield.name] = templateRow[subfield.name] ?? "";
      } else if (subfield.kind === "select") {
        nextRow[subfield.name] = lastRow[subfield.name] ?? templateRow[subfield.name] ?? "";
      } else {
        nextRow[subfield.name] = "";
      }
    }

    onChange([...rows, nextRow]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= minRows) {
      return;
    }

    onChange(rows.filter((_, rowIndex) => rowIndex !== index));
  };

  return (
    <section className="space-y-3 rounded-xl border border-border bg-muted/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{field.label}</h3>
          {field.helper ? <p className="text-xs text-muted-foreground">{field.helper}</p> : null}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          {field.addLabel}
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{field.rowLabel ?? field.label} {index + 1}</span>
              {rows.length > minRows ? (
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive-subtle hover:text-destructive"
                  aria-label="Удалить строку"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <div className={fieldGridClassName}>
              {field.fields
                .filter((subfield) => isFieldVisible(subfield, state, row))
                .map((subfield) => {
                  const input = subfield.kind === "ingredient" ? (
                    <IngredientRowField
                      field={subfield}
                      value={row[subfield.name]}
                      onValueChange={(nextValue) => updateRow(index, subfield.name, nextValue)}
                      onSelect={(item) => {
                        const updates = subfield.onPick?.(item) ?? [[subfield.name, item.primaryLabelRu ?? item.displayName]];
                        applyRowPatch(index, Object.fromEntries(updates));
                      }}
                    />
                  ) : (
                    <CalculatorInput
                      field={subfield}
                      value={row[subfield.name]}
                      state={state}
                      row={row}
                      size="sm"
                      onChange={(nextValue) => updateRow(index, subfield.name, nextValue)}
                    />
                  );

                  return (
                    <div key={subfield.name} className={subfield.fullWidth ? "sm:col-span-2" : undefined}>
                      {input}
                    </div>
                  );
                })}
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
  const visibleFields = fields.filter((field) => isFieldVisible(field, state));
  // Заголовок-разделитель печатается при смене group от поля к полю — поля без group
  // (обычно самые верхние) идут как раньше, вообще без заголовка.
  let renderedGroup: string | undefined;

  return (
    <div className="space-y-3">
      <div className={fieldGridClassName}>
        {visibleFields.filter((field): field is ScalarCalculatorField => field.kind !== "array").map((field) => {
          const showGroupHeader = Boolean(field.group) && field.group !== renderedGroup;
          if (showGroupHeader) {
            renderedGroup = field.group;
          }
          const input = (
            <CalculatorInput
              field={field}
              value={state[field.name]}
              state={state}
              onChange={(nextValue) => {
                onChange(field.name, nextValue);
                // Побочные пересчёты связанных полей (напр. смена шкалы плотности) — со
                // снимком state ДО применения nextValue: трансформер сам знает старую единицу.
                for (const [name, value] of field.transformOnChange?.(nextValue, state) ?? []) {
                  onChange(name, value);
                }
              }}
            />
          );
          return (
            <React.Fragment key={field.name}>
              {showGroupHeader ? (
                <p className="sm:col-span-2 pt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground first:pt-0">
                  {field.group}
                </p>
              ) : null}
              {field.fullWidth ? <div className="sm:col-span-2">{input}</div> : input}
            </React.Fragment>
          );
        })}
      </div>
      {visibleFields.filter((field): field is ArrayCalculatorField => field.kind === "array").map((field) => (
        <ArrayFieldEditor
          key={field.name}
          field={field}
          value={state[field.name]}
          state={state}
          onChange={(nextValue) => onChange(field.name, nextValue)}
        />
      ))}
    </div>
  );
}

function ConverterGroupCard({
  group,
  state,
  onChange
}: {
  group: { id: string; label: string; units: string[]; icon: LucideIcon };
  state: CalculatorState;
  onChange: (name: string, value: unknown) => void;
}) {
  const from = String(state[`${group.id}From`] ?? group.units[0]);
  const rawValue = String(state[`${group.id}Value`] ?? "");
  // Запятая — валидный разделитель до нормализации на blur (NumericInput); из ссылок
  // может прийти произвольная строка. Пустой/нечисловой ввод не превращаем в 0 —
  // соседние ячейки в этом случае пустые, а не «конверсия нуля» (у плотности это −616 °P).
  const parsed = Number(rawValue.replace(",", "."));
  const hasValue = rawValue.trim() !== "" && Number.isFinite(parsed);
  const converted = hasValue
    ? convertBrewingUnitGroup(group.id as Parameters<typeof convertBrewingUnitGroup>[0], parsed, from) as Record<string, number>
    : null;

  return (
    <section
      id={`converter-panel-${group.id}`}
      role="tabpanel"
      aria-labelledby={`converter-tab-${group.id}`}
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex items-center gap-2 pb-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <group.icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
      </div>
      <div className={fieldGridClassName}>
        {group.units.map((unit) => {
          const meta = converterUnitMeta(group.id, unit);
          const active = unit === from;
          // Активное поле показывает введённую строку как есть (иначе прыгает курсор),
          // остальные — пересчитанное и отформатированное значение.
          const display = active ? rawValue : converted ? formatConverted(converted[unit] ?? 0, meta) : "";

          return (
            <label
              key={unit}
              className={`block min-w-0 rounded-xl border px-3 py-2 transition-colors ${
                active ? "border-border bg-muted" : "border-border bg-card"
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-foreground">{meta.label}</span>
                {meta.note ? <span className="text-[10px] font-normal text-muted-foreground">{meta.note}</span> : null}
              </span>
              <NumericInput
                value={display}
                // Минус разрешён везде: температуры ниже нуля, SG < 1.000 после брожения
                // (отрицательные GP) — конвертер не форма, ему незачем запрещать ввод.
                allowNegative
                onChange={(event) => {
                  // Нормализация запятой на blur (NumericInput) приходит тем же onChange и для
                  // НЕактивных ячеек (у отображаемого значения срезаются хвостовые нули) —
                  // она не должна перехватывать роль источника ввода.
                  if (event.type === "blur" && !active) {
                    return;
                  }
                  onChange(`${group.id}From`, unit);
                  onChange(`${group.id}Value`, event.target.value);
                }}
                className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-2.5 text-base tabular-nums text-foreground shadow-sm focus:border-border focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
              />
            </label>
          );
        })}
      </div>
      {group.id === "gravity" ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Для сусла °Bx и °P практически совпадают. Показания рефрактометра во время брожения искажает спирт —
          используйте <Link href="/calculators/refractometer-correction" className="underline underline-offset-2 transition-colors hover:text-foreground">поправку рефрактометра</Link>.
        </p>
      ) : null}
    </section>
  );
}

function UnitConverterBlock({
  state,
  onChange,
  onReset
}: {
  state: CalculatorState;
  onChange: (name: string, value: unknown) => void;
  onReset: () => void;
}) {
  const activeGroup = String(state.activeGroup ?? "gravity");
  const group = CONVERTER_GROUPS.find((entry) => entry.id === activeGroup) ?? CONVERTER_GROUPS[0];
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Стандартная клавиатурная модель вкладок (roving tabindex): в tab-порядке участвует
  // только активная вкладка, остальные достижимы стрелками; выбор следует за фокусом.
  // Обе оси — раскладка горизонтальная на узких экранах и вертикальная на lg+.
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = CONVERTER_GROUPS.length - 1;
    const nextIndex = event.key === "ArrowRight" || event.key === "ArrowDown"
      ? (index + 1) % CONVERTER_GROUPS.length
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? (index + lastIndex) % CONVERTER_GROUPS.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? lastIndex
            : null;
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    onChange("activeGroup", CONVERTER_GROUPS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="space-y-3" data-testid="unit-converter">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Сбросить
        </button>
      </div>
      <div className="lg:flex lg:items-start lg:gap-4">
        <div
          role="tablist"
          aria-label="Категория единиц"
          className="flex flex-wrap gap-1.5 lg:w-52 lg:shrink-0 lg:flex-col lg:flex-nowrap lg:gap-1"
        >
          {CONVERTER_GROUPS.map((entry, index) => {
            const active = entry.id === group.id;
            return (
              <button
                key={entry.id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`converter-tab-${entry.id}`}
                aria-selected={active}
                aria-controls={`converter-panel-${entry.id}`}
                tabIndex={active ? 0 : -1}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                onClick={() => onChange("activeGroup", entry.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors lg:w-full lg:justify-start lg:px-3 lg:py-2 ${
                  active
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <entry.icon className="h-4 w-4 shrink-0" />
                {entry.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 lg:mt-0 lg:min-w-0 lg:flex-1">
          <ConverterGroupCard group={group} state={state} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}

// Строка = уже готовый русский текст с тоном warning (обратная совместимость),
// объект — из translateCoreWarnings/coreWarningCopy, тон явный.
const normalizeWarning = (warning: string | CalculatorResultWarning): CalculatorResultWarning => (
  typeof warning === "string" ? { text: warning, tone: "warning" } : warning
);

const WARNINGS_DISPLAY_LIMIT = 6;

// warning-тон (требует внимания) — всегда раньше info-тона (постоянная сноска), иначе
// action-able предупреждение в хвосте списка (напр. target_not_reached_within_max_acid
// у water-ph, после пары info-сносок) молча срезается капой при большом числе кодов.
// .sort стабилен (ECMA2019+), так что порядок внутри одного тона сохраняется.
const sortWarningsForDisplay = (warnings: Array<string | CalculatorResultWarning>): CalculatorResultWarning[] => (
  warnings
    .map(normalizeWarning)
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "warning" ? -1 : 1))
);

// tone → цветовые классы карточки/чипа результата — общий для крупного primary (ResultPanel,
// StickyResultBar) и рядовых stat-карточек (ResultPanel). "hero" — крупный блок без
// собственной рамки в default-состоянии (просто акцентный фон); "card" — обычная
// stat-карточка со своей рамкой в default-состоянии. Раньше тернарник дублировался в
// трёх местах и расходился бы при правке одной из копий.
const toneClassName = (tone: CalculatorResultStat["tone"], variant: "hero" | "card" = "card"): string => (
  tone === "warning"
    ? "border-warning/30 bg-warning-subtle text-warning-subtle-foreground"
    : tone === "good"
      ? "border-success/30 bg-success-subtle text-success-subtle-foreground"
      : variant === "hero"
        ? "border-transparent bg-muted text-foreground"
        : "border-border bg-card text-foreground"
);

function ResultPanel({
  result
}: {
  result: CalculatorResult;
}) {
  const primaryToneClassName = toneClassName(result.primary.tone, "hero");

  return (
    <aside id="calculator-result" className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-[calc(var(--chrome-top)+1rem)]">
      <div className={`rounded-xl border p-4 ${primaryToneClassName}`}>
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{result.primary.label}</p>
        <div className="mt-1 flex items-center gap-2.5">
          {result.primary.swatchColor ? (
            <span
              aria-hidden="true"
              className="h-7 w-7 shrink-0 rounded-full border border-black/10 shadow-inner"
              style={{ backgroundColor: result.primary.swatchColor }}
            />
          ) : null}
          <p className="break-words text-3xl font-semibold leading-tight tabular-nums">{result.primary.value}</p>
        </div>
        {result.primary.helper ? <p className="mt-2 text-sm leading-5 text-muted-foreground">{result.primary.helper}</p> : null}
      </div>
      <dl className="grid grid-cols-2 gap-2">
        {result.stats.map((stat) => (
          <div
            key={stat.label}
            className={`min-w-0 rounded-xl border px-3 py-2.5 ${toneClassName(stat.tone, "card")}`}
          >
            <dt className="break-words text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{stat.label}</dt>
            <dd className="mt-1 break-words text-sm font-semibold tabular-nums">{stat.value}</dd>
            {stat.helper ? <p className="mt-0.5 text-[11px] font-normal leading-4 text-muted-foreground">{stat.helper}</p> : null}
          </div>
        ))}
      </dl>
      {result.warnings && result.warnings.length > 0 ? (
        <div className="space-y-1.5">
          {sortWarningsForDisplay(result.warnings).slice(0, WARNINGS_DISPLAY_LIMIT).map((warning, index) => (
            warning.tone === "warning" ? (
              <p key={`${index}-${warning.text}`} className="flex gap-1.5 rounded-xl border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning-subtle-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{warning.text}</span>
              </p>
            ) : (
              <p key={`${index}-${warning.text}`} className="rounded-xl border border-border bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
                {warning.text}
              </p>
            )
          ))}
        </div>
      ) : null}
    </aside>
  );
}

const STICKY_BAR_BOTTOM_PADDING_CLASSNAME = "pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]";

// Мобильный липкий бар результата (<lg): пока форма ниже поля результата, число всё равно
// на виду. Питается тем же result.primary, что и большая панель справа (см. вызов ниже) —
// без повторного вызова definition.calculate(). Тап — плавный скролл к полной панели.
function StickyResultBar({ primary }: { primary: CalculatorResultStat }) {
  const toneAccentClassName = toneClassName(primary.tone, "hero");
  const barRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const node = barRef.current;
    if (!node) {
      return;
    }

    // Другие fixed-элементы (кнопка «Обратная связь», тосты) должны знать высоту этого
    // бара, чтобы не лечь поверх него. ResizeObserver, а не разовый замер: высота зависит
    // от контента (helper-строка) и safe-area, которые меняются после монтирования.
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0;
      document.documentElement.style.setProperty("--nb-sticky-bar-h", `${height}px`);
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--nb-sticky-bar-h");
    };
  }, []);

  return (
    <button
      ref={barRef}
      type="button"
      onClick={() => {
        document.getElementById("calculator-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className={`fixed inset-x-0 bottom-[var(--chrome-bottom,0px)] z-40 flex w-full items-center gap-3 border-t border-border bg-card px-4 pt-2.5 text-left shadow-[0_-6px_16px_rgba(0,0,0,0.08)] lg:hidden ${STICKY_BAR_BOTTOM_PADDING_CLASSNAME}`}
    >
      <span className={`min-w-0 flex-1 rounded-xl border px-3 py-2 ${toneAccentClassName}`}>
        <span className="block truncate text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{primary.label}</span>
        <span className="mt-0.5 flex items-baseline gap-1.5">
          <span className="truncate text-xl font-semibold leading-tight tabular-nums">{primary.value}</span>
        </span>
        {primary.helper ? <span className="mt-0.5 block truncate text-[11px] font-normal leading-4 text-muted-foreground">{primary.helper}</span> : null}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
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
  // Четыре и больше сегментов в один ряд не влезают на узком экране (подписи вроде
  // «Вскрытая»/«Россыпью» слипаются) — до sm раскладываем их в два столбца.
  const wraps = fill && options.length > 3;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`${fill ? "flex" : "inline-flex"} ${wraps ? "flex-wrap sm:flex-nowrap" : ""} gap-1 rounded-xl bg-muted p-1`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`${fill ? "min-w-0 flex-1" : ""} ${wraps ? "basis-[calc(50%-0.125rem)] sm:basis-0" : ""} rounded-lg px-3 font-medium transition-colors ${buttonSize} ${
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// Переносящиеся пилюли авто-ширины — для select-опций с длинными подписями разной длины,
// которые не влезают в равноширокий SegmentedControl (напр. типы праймера).
function ChipSelect({
  options,
  value,
  onChange,
  ariaLabel
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground hover:border-border hover:bg-accent"
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
    <label className="block min-w-0 text-xs font-medium text-muted-foreground">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        {unit ? <span className="font-normal text-muted-foreground">{unit}</span> : null}
      </span>
      <NumericInput
        value={String(value ?? "")}
        min={min}
        step={step}
        allowNegative={min < 0}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-base tabular-nums text-foreground shadow-sm focus:border-border focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
      />
      {helper ? <span className="mt-1 block text-[11px] font-normal leading-4 text-muted-foreground">{helper}</span> : null}
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

      <div className="rounded-lg bg-muted px-3 py-2.5 text-sm tabular-nums text-muted-foreground">
        {wcf != null && trueBrix != null ? (
          <span>{refracto} ÷ {trueBrix.toFixed(1)} Brix = <strong className="text-foreground">{wcf}</strong></span>
        ) : (
          <span className="text-xs text-muted-foreground">Коэффициент = показание рефрактометра ÷ Brix по ареометру</span>
        )}
      </div>

      <Button
        type="button"
        size="md"
        disabled={wcf == null}
        onClick={() => { if (wcf != null) { onApply(wcf); } }}
        className="w-full"
      >
        Применить коэффициент
      </Button>
      <p className="text-[11px] leading-4 text-muted-foreground">
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
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-foreground">Замер рефрактометром</h2>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
          <p className="text-xs leading-5 text-muted-foreground">
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
                helper={originalUnit === "Brix"
                  ? "Показание рефрактометра — с поправкой на коэффициент."
                  : "С ареометра или из рецепта — без поправки."}
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
              <label className="block min-w-0 text-xs font-medium text-muted-foreground">
                <span>Формула пересчёта</span>
                <select
                  value={String(state.formula ?? "novotny")}
                  onChange={(event) => onChange("formula", event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground shadow-sm focus:border-border focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
                >
                  {REFRACTOMETER_FORMULA_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <div className="min-w-0">
                <span className="block text-xs font-medium text-muted-foreground">Шкала OG</span>
                <div className="mt-1">
                  <SegmentedControl
                    ariaLabel="Шкала OG"
                    size="sm"
                    fill={false}
                    options={refractometerOgUnitOptions}
                    value={originalUnit}
                    onChange={(nextUnit) => {
                      const converted = convertRefractometerOgFieldValue(state, state.originalValue, originalUnit as CalculatorGravityUnit, nextUnit as CalculatorGravityUnit);
                      onChange("originalValue", converted !== "" ? converted : String(refractometerOgDefault(nextUnit)));
                      onChange("originalUnit", nextUnit);
                      onChange("gravityUnitTouched", true);
                    }}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <details className="group rounded-xl border border-border bg-muted/60 px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-card shadow-sm">
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
            </div>
            Калибровка коэффициента
          </summary>
          <div className="mt-4 space-y-4">
            <p className="text-[11px] leading-4 text-muted-foreground">
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
  // До брожения нет собственного переключателя единицы (пресна нет OG-контекста) — берём
  // единицу предпочтения зрителя (до догрузки — дефолт Plato), как и остальные публичные
  // поверхности. После старта брожения первичной остаётся выбранная единица OG (как была).
  const { unit: viewerUnit } = useViewerGravityUnit();
  let view: RefractometerView;
  try {
    view = computeRefractometerView(state);
  } catch {
    return (
      <aside id="calculator-result" className="lg:sticky lg:top-[calc(var(--chrome-top)+1.5rem)]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Скорректированная плотность</p>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">Проверьте входные значения.</p>
        </div>
      </aside>
    );
  }

  const isPost = view.mode === "post_fermentation";
  // The big result follows the unit chosen for the OG input (post). Pre-fermentation
  // has no unit picker, so it follows the viewer's density unit preference instead.
  const primaryUnit = isPost ? String(state.originalUnit ?? "Brix") : toCalculatorGravityUnit(viewerUnit);
  const correctedUnits = [
    { key: "SG", value: view.corrected.sg.toFixed(3), label: "SG" },
    { key: "Plato", value: view.corrected.plato.toFixed(1), label: "°P" },
    { key: "Brix", value: view.corrected.brix.toFixed(1), label: "Brix" }
  ];
  const primary = correctedUnits.find((unit) => unit.key === primaryUnit) ?? correctedUnits[0];
  // Один чип второй единицы вместо оставшихся двух (см. A5).
  const secondaryValue = formatGravitySecondary(view.corrected.sg, fromCalculatorGravityUnit(primary.key as CalculatorGravityUnit));

  const attenuationText = view.attenuationBand === "low"
    ? "Ниже 65% — брожение, возможно, не завершено."
    : view.attenuationBand === "high"
      ? "Выше 80% — сухой профиль (лагеры, сэзоны, дикие дрожжи)."
      : "65–80% — нормально для большинства элей.";

  return (
    <aside id="calculator-result" className="lg:sticky lg:top-[calc(var(--chrome-top)+1.5rem)]">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-gradient-to-b from-muted to-card px-5 py-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Скорректированная плотность</p>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold leading-none tabular-nums text-foreground">{primary.value}</span>
            <span className="text-sm font-medium text-muted-foreground">{primary.label}</span>
          </div>
          <div className="mt-3 flex gap-2">
            {secondaryValue ? (
              <span className="rounded-md bg-card px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground ring-1 ring-ring">{secondaryValue}</span>
            ) : null}
          </div>
        </div>

        {isPost ? (
          <div className="space-y-3 p-5">
            <dl className="grid grid-cols-2 gap-3">
              <div className="min-w-0 rounded-xl border border-border bg-muted/70 px-3 py-2.5">
                <dt className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">ABV оценка</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{view.estimatedABV.toFixed(1)}%</dd>
              </div>
              <div className={`min-w-0 rounded-xl border px-3 py-2.5 ${
                view.attenuationBand === "normal"
                  ? "border-success/30 bg-success-subtle text-success-subtle-foreground"
                  : "border-warning/30 bg-warning-subtle text-warning-subtle-foreground"
              }`}>
                <dt className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Сбраживание</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{view.attenuation.toFixed(0)}%</dd>
              </div>
            </dl>
            <p className="rounded-xl border border-border bg-muted/70 px-3 py-2.5 text-xs leading-5 text-muted-foreground">{attenuationText}</p>
          </div>
        ) : (
          <div className="p-5">
            <p className="rounded-xl border border-border bg-muted/70 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              Спирт ещё не учитывается — это плотность несброженного сусла.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

const ABV_UNIT_OPTIONS = [
  { value: "SG", label: "SG" },
  { value: "Plato", label: "°P" }
];

const ABV_FORMULA_OPTIONS = [
  { value: "standard", label: "Стандартная" },
  { value: "alternate", label: "Альтернативная (крепкое пиво)" }
];

function AbvFieldsBlock({
  state,
  onChange,
  onReset
}: {
  state: CalculatorState;
  onChange: (name: string, value: unknown) => void;
  onReset: () => void;
}) {
  // Нормализуем к SG/°P: опции Brix больше нет, но в localStorage могло остаться старое
  // значение. Для °P и Brix математика одинаковая (обе через platoToSg), так что показываем °P.
  const unit = String(state.gravityUnit ?? "SG") === "SG" ? "SG" : "Plato";
  const unitLabel = unit === "Plato" ? "°P" : "SG";
  const step = unit === "Plato" ? 0.1 : 0.001;
  const view = computeAbvView(state);
  const highOgOnStandard = view.ogSg >= 1.07 && String(state.abvFormula ?? "standard") === "standard";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-foreground">Замеры плотности</h2>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Сбросить
        </button>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <RefractoNumberInput
            label="Начальная плотность (OG)"
            unit={unitLabel}
            value={state.og}
            min={0}
            step={step}
            onChange={(value) => onChange("og", value)}
          />
          <RefractoNumberInput
            label="Конечная плотность (FG)"
            unit={unitLabel}
            value={state.fg}
            // FG ниже 1.000 SG (сухие крепкие сорта, бретты) в °P — отрицательное число.
            min={unit === "Plato" ? -5 : 0}
            step={step}
            onChange={(value) => onChange("fg", value)}
          />
          <div className="min-w-0">
            <span className="block text-xs font-medium text-muted-foreground">Шкала плотности</span>
            <div className="mt-1">
              <SegmentedControl
                ariaLabel="Шкала плотности"
                size="sm"
                fill={false}
                options={ABV_UNIT_OPTIONS}
                value={unit}
                onChange={(nextUnit) => {
                  onChange("og", convertGravityFieldValue(state.og, unit as CalculatorGravityUnit, nextUnit as CalculatorGravityUnit));
                  onChange("fg", convertGravityFieldValue(state.fg, unit as CalculatorGravityUnit, nextUnit as CalculatorGravityUnit));
                  onChange("gravityUnit", nextUnit);
                  onChange("gravityUnitTouched", true);
                }}
              />
            </div>
          </div>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          Меряешь рефрактометром?{" "}
          <Link
            href="/calculators/refractometer-correction"
            className="font-medium text-foreground underline underline-offset-2 hover:text-foreground"
          >
            Сначала поправка рефрактометра
          </Link>{" "}
          — показание Brix после брожения занижает крепость.
        </p>

        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
          <label className="block min-w-0 text-xs font-medium text-muted-foreground">
            <span>Формула крепости</span>
            <select
              value={String(state.abvFormula ?? "standard")}
              onChange={(event) => onChange("abvFormula", event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-base text-foreground shadow-sm focus:border-border focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
            >
              {ABV_FORMULA_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {highOgOnStandard ? (
              <span className="mt-1 block text-[11px] font-normal leading-4 text-warning-subtle-foreground">
                OG выше 1.070 (17 °P) — стандартная формула занижает крепость.{" "}
                <button
                  type="button"
                  onClick={() => onChange("abvFormula", "alternate")}
                  className="font-medium underline underline-offset-2"
                >
                  Переключить на альтернативную
                </button>
              </span>
            ) : (
              <span className="mt-1 block text-[11px] font-normal leading-4 text-muted-foreground">
                Альтернативная точнее для крепкого пива (выше ~1.070 (17 °P)).
              </span>
            )}
          </label>
          <RefractoNumberInput
            label="Порция для калорий"
            unit="мл"
            value={state.servingSizeMl}
            min={1}
            step={50}
            onChange={(value) => onChange("servingSizeMl", value)}
          />
        </div>
      </div>
    </div>
  );
}

function AbvResultPanel({ state }: { state: CalculatorState }) {
  let view: AbvView;
  try {
    view = computeAbvView(state);
  } catch {
    return (
      <aside id="calculator-result" className="lg:sticky lg:top-[calc(var(--chrome-top)+1.5rem)]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Крепость</p>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">Проверьте входные значения.</p>
        </div>
      </aside>
    );
  }

  const attenuationText = view.attenuationBand === "low"
    ? "Ниже 65% — брожение, возможно, не завершено."
    : view.attenuationBand === "high"
      ? "Выше 80% — сухой профиль (лагеры, сэзоны, дикие дрожжи)."
      : "65–80% — нормально для большинства элей.";

  // OG/FG в чипах — в единице ввода (как у AbvFieldsBlock), плюс второй слой мельче рядом.
  const unit = String(state.gravityUnit ?? "SG") === "SG" ? "SG" : "Plato";
  const prefUnit = fromCalculatorGravityUnit(unit as CalculatorGravityUnit);
  const ogText = `OG ${formatGravity(view.ogSg, prefUnit)} · ${formatGravitySecondary(view.ogSg, prefUnit)}`;
  const fgText = `FG ${formatGravity(view.fgSg, prefUnit)} · ${formatGravitySecondary(view.fgSg, prefUnit)}`;

  return (
    <aside id="calculator-result" className="lg:sticky lg:top-[calc(var(--chrome-top)+1.5rem)]">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-gradient-to-b from-muted to-card px-5 py-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Крепость</p>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold leading-none tabular-nums text-foreground">{view.abv.toFixed(1)}</span>
            <span className="text-sm font-medium text-muted-foreground">% ABV</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-md bg-card px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground ring-1 ring-ring">ABW {view.abw.toFixed(1)}%</span>
            <span className="rounded-md bg-card px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground ring-1 ring-ring">{ogText}</span>
            <span className="rounded-md bg-card px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground ring-1 ring-ring">{fgText}</span>
          </div>
        </div>

        {view.ogTooLow || view.fgAboveOg ? (
          <div className="p-5">
            <p className="flex gap-1.5 rounded-xl border border-warning/30 bg-warning-subtle px-3 py-2.5 text-xs leading-5 text-warning-subtle-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {view.ogTooLow
                  ? "Начальная плотность должна быть выше 1.000 (0 °P) — проверьте замер."
                  : "Конечная плотность выше начальной — проверьте замеры."}
              </span>
            </p>
          </div>
        ) : (
          <div className="space-y-3 p-5">
            <dl className="grid grid-cols-2 gap-3">
              <div className={`min-w-0 rounded-xl border px-3 py-2.5 ${
                view.attenuationBand === "normal"
                  ? "border-success/30 bg-success-subtle text-success-subtle-foreground"
                  : "border-warning/30 bg-warning-subtle text-warning-subtle-foreground"
              }`}>
                <dt className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Сбраживание</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{view.attenuation.toFixed(0)}%</dd>
              </div>
              <div className="min-w-0 rounded-xl border border-border bg-muted/70 px-3 py-2.5">
                <dt className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Калории</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                  {view.calories} <span className="text-xs font-normal text-muted-foreground">ккал / {Math.round(view.servingSizeMl)} мл</span>
                </dd>
              </div>
            </dl>
            <p className="rounded-xl border border-border bg-muted/70 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              Видимое сбраживание: {attenuationText}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

const HYDROMETER_UNIT_OPTIONS = [
  { value: "SG", label: "SG" },
  { value: "Plato", label: "°P" },
  { value: "Brix", label: "Brix" }
];

function HydrometerFieldsBlock({
  state,
  onChange,
  onReset
}: {
  state: CalculatorState;
  onChange: (name: string, value: unknown) => void;
  onReset: () => void;
}) {
  const unit = String(state.readingUnit ?? "SG");
  const unitLabel = unit === "SG" ? "SG" : unit === "Brix" ? "Brix" : "°P";
  const step = unit === "SG" ? 0.001 : 0.1;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-foreground">Замер ареометром</h2>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Сбросить
        </button>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <RefractoNumberInput
            label="Показание ареометра"
            unit={unitLabel}
            value={state.reading}
            min={0}
            step={step}
            onChange={(value) => onChange("reading", value)}
          />
          <RefractoNumberInput
            label="Температура пробы"
            unit="°C"
            value={state.sampleTemperatureC}
            step={0.5}
            onChange={(value) => onChange("sampleTemperatureC", value)}
          />
          <div className="min-w-0">
            <span className="block text-xs font-medium text-muted-foreground">Шкала плотности</span>
            <div className="mt-1">
              <SegmentedControl
                ariaLabel="Шкала плотности"
                size="sm"
                fill={false}
                options={HYDROMETER_UNIT_OPTIONS}
                value={unit}
                onChange={(nextUnit) => {
                  onChange("reading", convertGravityFieldValue(state.reading, unit as CalculatorGravityUnit, nextUnit as CalculatorGravityUnit));
                  // Поправка прибора — дельта в шкале показания: конвертируется вместе с ним.
                  onChange("offset", convertGravityOffsetValue(state.offset, unit as CalculatorGravityUnit, nextUnit as CalculatorGravityUnit));
                  onChange("readingUnit", nextUnit);
                  onChange("gravityUnitTouched", true);
                }}
              />
            </div>
          </div>
        </div>

        <details className="group rounded-xl border border-border bg-muted/60 px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-card shadow-sm">
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
            </div>
            Дополнительно
          </summary>
          <div className="mt-4 grid gap-x-4 gap-y-4 sm:grid-cols-2">
            <RefractoNumberInput
              label="Температура калибровки"
              unit="°C"
              helper="Обычно 20 °C, иногда 15,6 °C — смотри на колбе прибора."
              value={state.calibrationTemperatureC}
              step={0.5}
              onChange={(value) => onChange("calibrationTemperatureC", value)}
            />
            <RefractoNumberInput
              label="Поправка прибора"
              unit={unitLabel}
              helper={`Если в дистилляте прибор показывает не ${unit === "SG" ? "1.000" : `0 ${unitLabel}`} — впиши разницу (можно минус).`}
              value={state.offset}
              min={-1}
              step={step}
              onChange={(value) => onChange("offset", value)}
            />
          </div>
        </details>
      </div>
    </div>
  );
}

function HydrometerResultPanel({ state }: { state: CalculatorState }) {
  let view: HydrometerView;
  try {
    view = computeHydrometerView(state);
  } catch {
    return (
      <aside id="calculator-result" className="lg:sticky lg:top-[calc(var(--chrome-top)+1.5rem)]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Скорректированная плотность</p>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">Проверьте входные значения.</p>
        </div>
      </aside>
    );
  }

  const unitLabel = view.unit === "SG" ? "SG" : view.unit === "Brix" ? "Brix" : "°P";
  const decimals = view.unit === "SG" ? 3 : 1;
  const deltaDecimals = view.unit === "SG" ? 4 : 2;
  const signedDelta = `${view.deltaInUnit >= 0 ? "+" : "−"}${Math.abs(view.deltaInUnit).toFixed(deltaDecimals)}`;
  // Один чип второй единицы вместо двух (Plato и Brix раньше показывались рядом одновременно —
  // это одна и та же шкала, дублирование без смысла; см. A5).
  const secondaryValue = formatGravitySecondary(view.correctedSg, fromCalculatorGravityUnit(view.unit));

  // Чип «Поправка» показывает итоговую дельту (температура + поправка прибора), поэтому
  // при ненулевом офсете пояснение обязано упомянуть его вклад — иначе текст про «поправка
  // добавлена» противоречил бы отрицательному числу в чипе (и наоборот).
  const offsetNote = view.offsetInUnit !== 0
    ? ` Итог включает поправку прибора (${view.offsetInUnit > 0 ? "+" : "−"}${Math.abs(view.offsetInUnit).toFixed(deltaDecimals)} ${unitLabel}).`
    : "";
  const directionText = (view.direction === "hot"
    ? `Проба теплее калибровки на ${Math.abs(view.tempDeltaC)} °C — сырое показание было занижено, температурная поправка добавлена.`
    : view.direction === "cold"
      ? `Проба холоднее калибровки на ${Math.abs(view.tempDeltaC)} °C — сырое показание было завышено, температурная поправка вычтена.`
      : "Проба у температуры калибровки — температурная поправка минимальна.") + offsetNote;

  return (
    <aside id="calculator-result" className="lg:sticky lg:top-[calc(var(--chrome-top)+1.5rem)]">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-gradient-to-b from-muted to-card px-5 py-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Скорректированная плотность</p>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold leading-none tabular-nums text-foreground">{view.correctedInUnit.toFixed(decimals)}</span>
            <span className="text-sm font-medium text-muted-foreground">{unitLabel}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {secondaryValue ? (
              <span className="rounded-md bg-card px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground ring-1 ring-ring">{secondaryValue}</span>
            ) : null}
          </div>
        </div>

        <div className="space-y-3 p-5">
          <dl className="grid grid-cols-2 gap-3">
            <div className="min-w-0 rounded-xl border border-border bg-muted/70 px-3 py-2.5">
              <dt className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">До поправки</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{view.rawInUnit.toFixed(decimals)} <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span></dd>
            </div>
            <div className="min-w-0 rounded-xl border border-border bg-muted/70 px-3 py-2.5">
              <dt className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Поправка</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{signedDelta} <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span></dd>
            </div>
          </dl>
          {view.sampleTempBand !== "ok" ? (
            <p className="flex gap-1.5 rounded-xl border border-warning/30 bg-warning-subtle px-3 py-2.5 text-xs leading-5 text-warning-subtle-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {view.sampleTempBand === "out_of_range"
                  ? "Температура пробы вне диапазона 0–100 °C — проверьте значение."
                  : "Выше ~60 °C показания ареометра ненадёжны даже с поправкой — охладите пробу ближе к температуре калибровки."}
              </span>
            </p>
          ) : null}
          <p className="rounded-xl border border-border bg-muted/70 px-3 py-2.5 text-xs leading-5 text-muted-foreground">{directionText}</p>
        </div>
      </div>
    </aside>
  );
}

const DILUTION_GRAVITY_UNIT_OPTIONS = [
  { value: "SG", label: "SG" },
  { value: "Plato", label: "°P" },
  { value: "Brix", label: "°Bx" }
];

const formatDilutionLiters = (value: number) => `${Number(value.toFixed(2))} л`;
const formatDilutionGrams = (value: number) => `${Number(value.toFixed(1))} г`;

function DilutionFieldsBlock({
  state,
  onChange,
  onReset
}: {
  state: CalculatorState;
  onChange: (name: string, value: unknown) => void;
  onReset: () => void;
}) {
  const mode = String(state.mode ?? "dilute_to_gravity");
  const operation = dilutionOperationOfMode(mode);
  const unit = String(state.gravityUnit ?? "SG");
  const unitLabel = DILUTION_GRAVITY_UNIT_OPTIONS.find((option) => option.value === unit)?.label ?? unit;
  const gravityStep = unit === "SG" ? 0.001 : 0.1;
  const findOptions = dilutionFindOptions[operation];

  const selectOperation = (nextOperation: string) => {
    const nextMode = dilutionFindOptions[nextOperation as DilutionOperation][0].mode;
    if (nextMode !== mode) {
      onChange("mode", nextMode);
    }
  };

  const changeUnit = (nextUnit: string) => {
    onChange("currentGravity", convertGravityFieldValue(state.currentGravity, unit as CalculatorGravityUnit, nextUnit as CalculatorGravityUnit));
    onChange("targetGravity", convertGravityFieldValue(state.targetGravity, unit as CalculatorGravityUnit, nextUnit as CalculatorGravityUnit));
    onChange("gravityUnit", nextUnit);
    onChange("gravityUnitTouched", true);
  };

  const showTargetGravity = DILUTION_GRAVITY_TARGET_MODES.has(mode);
  const showTargetVolume = DILUTION_VOLUME_TARGET_MODES.has(mode);
  const showRate = DILUTION_BOILOFF_RATE_MODES.has(mode);
  const showAddition = mode === "add_extract_to_gravity";
  const hasTargetRow = showTargetGravity || showTargetVolume || showRate || showAddition;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Сбросить
        </button>
      </div>

      <div className="space-y-5">
        <SegmentedControl
          ariaLabel="Что делаем"
          options={dilutionOperationOptions.map((option) => ({ value: option.id, label: option.label }))}
          value={operation}
          onChange={selectOperation}
        />

        {findOptions.length > 1 ? (
          <div>
            <span className="block text-xs font-medium text-muted-foreground">Что рассчитать</span>
            <div className="mt-1">
              <SegmentedControl
                ariaLabel="Что рассчитать"
                size="sm"
                options={findOptions.map((option) => ({ value: option.mode, label: option.label }))}
                value={mode}
                onChange={(nextMode) => onChange("mode", nextMode)}
              />
            </div>
          </div>
        ) : null}

        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <RefractoNumberInput
            label="Текущий объём"
            unit="л"
            value={state.currentVolumeL}
            min={0.1}
            step={0.5}
            onChange={(value) => onChange("currentVolumeL", value)}
          />
          <RefractoNumberInput
            label="Текущая плотность"
            unit={unitLabel}
            value={state.currentGravity}
            min={0}
            step={gravityStep}
            onChange={(value) => onChange("currentGravity", value)}
          />
          <div className="min-w-0">
            <span className="block text-xs font-medium text-muted-foreground">Шкала плотности</span>
            <div className="mt-1">
              <SegmentedControl
                ariaLabel="Шкала плотности"
                size="sm"
                fill={false}
                options={DILUTION_GRAVITY_UNIT_OPTIONS}
                value={unit}
                onChange={changeUnit}
              />
            </div>
          </div>
        </div>

        {hasTargetRow ? (
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            {showTargetGravity ? (
              <RefractoNumberInput
                label="Целевая плотность"
                unit={unitLabel}
                value={state.targetGravity}
                min={0}
                step={gravityStep}
                onChange={(value) => onChange("targetGravity", value)}
              />
            ) : null}
            {showTargetVolume ? (
              <RefractoNumberInput
                label="Конечный объём"
                unit="л"
                value={state.targetVolumeL}
                min={0.1}
                step={0.5}
                onChange={(value) => onChange("targetVolumeL", value)}
              />
            ) : null}
            {showRate ? (
              <RefractoNumberInput
                label="Скорость испарения"
                unit="л/ч"
                value={state.boilOffRateLPerHour}
                min={0}
                step={0.5}
                onChange={(value) => onChange("boilOffRateLPerHour", value)}
              />
            ) : null}
            {showAddition ? (
              <label className="block min-w-0 text-xs font-medium text-muted-foreground">
                <span>Что добавить</span>
                <div className="mt-1">
                  <SegmentedControl
                    ariaLabel="Что добавить"
                    size="sm"
                    options={[
                      { value: "dme", label: "Сухой экстракт" },
                      { value: "sugar", label: "Сахар" }
                    ]}
                    value={String(state.additionType ?? "dme")}
                    onChange={(value) => onChange("additionType", value)}
                  />
                </div>
              </label>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DilutionResultPanel({ state }: { state: CalculatorState }) {
  let view: DilutionView;
  try {
    view = computeDilutionView(state);
  } catch {
    return (
      <aside id="calculator-result" className="lg:sticky lg:top-[calc(var(--chrome-top)+1.5rem)]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Результат</p>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">Проверьте входные значения.</p>
        </div>
      </aside>
    );
  }

  const sg = view.resultingGravitySg;
  const gravityUnits = [
    { key: "SG", label: "SG", value: sg.toFixed(3) },
    { key: "Plato", label: "°P", value: sgToPlato(sg).toFixed(1) },
    { key: "Brix", label: "°Bx", value: sgToBrix(sg).toFixed(1) }
  ];
  const primaryGravity = gravityUnits.find((entry) => entry.key === view.unit) ?? gravityUnits[0];
  const gravityText = `${primaryGravity.value} ${primaryGravity.label}`;
  // Один чип второй единицы вместо двух оставшихся (см. A5).
  const secondaryGravityText = formatGravitySecondary(sg, fromCalculatorGravityUnit(view.unit));

  // Герой: для gravity-режимов — итоговая плотность (крупно + мелкие дубли в других единицах),
  // иначе — объём/масса/время.
  const isGravityHero = view.find === "gravity";
  const hero = isGravityHero
    ? {
        label: "Итоговая плотность",
        value: primaryGravity.value,
        unit: primaryGravity.label,
        helper: view.mode === "gravity_after_water"
          ? `Долить ${formatDilutionLiters(view.waterToAddL)} воды`
          : `Выпарить ${formatDilutionLiters(view.volumeToBoilOffL)}`
      }
    : view.mode === "dilute_to_gravity"
      ? { label: "Долить воды", value: formatDilutionLiters(view.waterToAddL), unit: undefined, helper: `Плотность станет ${gravityText}` }
      : view.mode === "boil_to_gravity"
        ? { label: "Выпарить", value: formatDilutionLiters(view.volumeToBoilOffL), unit: undefined, helper: view.extraBoilTimeMinutes > 0 ? `≈ ${view.extraBoilTimeMinutes} мин при заданной скорости` : `Плотность станет ${gravityText}` }
        : view.mode === "extra_boil_time"
          ? { label: "Кипятить ещё", value: `${view.extraBoilTimeMinutes} мин`, unit: undefined, helper: `Выпарить ${formatDilutionLiters(view.volumeToBoilOffL)}` }
          : { label: view.isSugar ? "Добавить сахар" : "Добавить экстракт", value: formatDilutionGrams(view.extractG), unit: undefined, helper: `Плотность станет ${gravityText}` };

  const stats: Array<{ label: string; value: string; helper?: string }> = [
    { label: "Итоговый объём", value: formatDilutionLiters(view.resultingVolumeL) }
  ];
  if (!isGravityHero) {
    stats.push({
      label: "Итоговая плотность",
      value: gravityText,
      helper: secondaryGravityText ?? undefined
    });
  }
  if (view.mode === "gravity_after_water") {
    stats.push({ label: "Долить воды", value: formatDilutionLiters(view.waterToAddL) });
  }
  if (view.mode === "gravity_after_boiloff" || view.mode === "extra_boil_time") {
    stats.push({ label: "Выпарить", value: formatDilutionLiters(view.volumeToBoilOffL) });
  }
  if (view.mode === "boil_to_gravity" && view.extraBoilTimeMinutes > 0) {
    stats.push({ label: "Доп. время", value: `${view.extraBoilTimeMinutes} мин` });
  }

  const warnings = sortWarningsForDisplay(view.warnings).slice(0, WARNINGS_DISPLAY_LIMIT);

  return (
    <aside id="calculator-result" className="lg:sticky lg:top-[calc(var(--chrome-top)+1.5rem)]">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-gradient-to-b from-muted to-card px-5 py-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{hero.label}</p>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold leading-none tabular-nums text-foreground">{hero.value}</span>
            {hero.unit ? <span className="text-sm font-medium text-muted-foreground">{hero.unit}</span> : null}
          </div>
          {isGravityHero && secondaryGravityText ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-md bg-card px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground ring-1 ring-ring">{secondaryGravityText}</span>
            </div>
          ) : null}
          {hero.helper ? <p className="mt-3 text-sm leading-5 text-muted-foreground">{hero.helper}</p> : null}
        </div>

        <div className="space-y-3 p-5">
          <dl className="grid grid-cols-2 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="min-w-0 rounded-xl border border-border bg-muted/70 px-3 py-2.5">
                <dt className="break-words text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{stat.label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{stat.value}</dd>
                {stat.helper ? <p className="mt-0.5 text-[11px] font-normal leading-4 text-muted-foreground">{stat.helper}</p> : null}
              </div>
            ))}
          </dl>
          {warnings.length > 0 ? (
            <div className="space-y-1.5">
              {warnings.map((warning, index) => (
                warning.tone === "warning" ? (
                  <p key={`${index}-${warning.text}`} className="flex gap-1.5 rounded-xl border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning-subtle-foreground">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{warning.text}</span>
                  </p>
                ) : (
                  <p key={`${index}-${warning.text}`} className="rounded-xl border border-border bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {warning.text}
                  </p>
                )
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

// A1: единый механизм подхвата предпочтения плотности пользователя — slug калькулятора →
// какое поле хранит единицу, какие поля хранят значения в этой единице, и как смэппить
// PreferredGravityUnit профиля в CalculatorGravityUnit самого калькулятора (ABV не знает
// Brix, остальные — SG/Plato/Brix как есть). unit-converter обрабатывается отдельно ниже:
// там меняется только дефолт активной ячейки, без пересчёта значений.
type GravityPreferenceConfig = {
  unitField: string;
  valueFields: string[];
  // Дельта-поля (поправка прибора у ареометра): конвертируются с якорем на воде
  // (convertGravityOffsetValue), а не как абсолютная плотность.
  offsetFields?: string[];
  mapPref: (unit: PreferredGravityUnit) => CalculatorGravityUnit;
  // Значение поля — не всегда «чистая» плотность: у рефрактометра Brix — сырое показание
  // прибора, а SG/°P — истинная плотность, и конверсия между ними обязана видеть state
  // (WCF). Без хука — обычная convertGravityFieldValue.
  convertValue?: (state: CalculatorState, rawValue: unknown, fromUnit: CalculatorGravityUnit, toUnit: CalculatorGravityUnit) => string;
};

const GRAVITY_PREFERENCE_CONFIG: Partial<Record<CalculatorSlug, GravityPreferenceConfig>> = {
  "abv-attenuation": { unitField: "gravityUnit", valueFields: ["og", "fg"], mapPref: toAbvGravityUnit },
  "dilution-boiloff": { unitField: "gravityUnit", valueFields: ["currentGravity", "targetGravity"], mapPref: toCalculatorGravityUnit },
  "hydrometer-correction": { unitField: "readingUnit", valueFields: ["reading"], offsetFields: ["offset"], mapPref: toCalculatorGravityUnit },
  "refractometer-correction": {
    unitField: "originalUnit",
    valueFields: ["originalValue"],
    mapPref: toCalculatorGravityUnit,
    convertValue: convertRefractometerOgFieldValue
  },
  ibu: { unitField: "gravityUnit", valueFields: ["wortGravity"], mapPref: toCalculatorGravityUnit },
  "yeast-starter": { unitField: "gravityUnit", valueFields: ["gravity"], mapPref: toCalculatorGravityUnit },
  "speise-krausen": { unitField: "gravityUnit", valueFields: ["speiseGravity"], mapPref: toCalculatorGravityUnit },
  "brewhouse-efficiency": { unitField: "gravityUnit", valueFields: ["measuredOg"], mapPref: toCalculatorGravityUnit }
};

// Переводит состояние калькулятора на единицу предпочтения: переключает unitField и
// пересчитывает значения из их текущей единицы. Ручной выбор (gravityUnitTouched) не
// перетирает — важно и при догрузке предпочтения (пользователь мог успеть переключить
// шкалу, пока летел запрос), и при сбросе. Возвращает исходный объект, если менять нечего.
const applyGravityPreference = (
  state: CalculatorState,
  gravityConfig: GravityPreferenceConfig,
  unit: PreferredGravityUnit
): CalculatorState => {
  if (state.gravityUnitTouched === true) {
    return state;
  }
  const nextUnit = gravityConfig.mapPref(unit);
  const currentUnit = String(state[gravityConfig.unitField] ?? nextUnit) as CalculatorGravityUnit;
  if (currentUnit === nextUnit) {
    return state;
  }
  const next: CalculatorState = { ...state, [gravityConfig.unitField]: nextUnit };
  for (const field of gravityConfig.valueFields) {
    next[field] = gravityConfig.convertValue
      ? gravityConfig.convertValue(state, state[field], currentUnit, nextUnit)
      : convertGravityFieldValue(state[field], currentUnit, nextUnit);
  }
  for (const field of gravityConfig.offsetFields ?? []) {
    next[field] = convertGravityOffsetValue(state[field], currentUnit, nextUnit);
  }
  return next;
};

export function CalculatorPageClient({ slug }: { slug: CalculatorSlug }) {
  const definition = calculatorDefinitionBySlug[slug];
  // Страница калькулятора статическая (generateStaticParams) и не читает
  // searchParams на сервере — состояние из shared-ссылок (?og=…&fg=…) читаем
  // здесь, на клиенте, через useSearchParams (см. app/(public)/calculators/[slug]/page.tsx).
  const searchParams = useSearchParams();
  const initialQuery = useMemo(
    () => parseCalculatorQuery(Object.fromEntries(searchParams.entries())),
    [searchParams]
  );
  const [state, setState] = useState<CalculatorState>(() => (
    initialCalculatorStateFromQuery(definition, initialQuery)
  ));
  const [mounted, setMounted] = useState(false);
  // Догруженное предпочтение плотности — чтобы «Сбросить» мог синхронно вернуть не голые
  // SG-дефолты, а дефолты в единице пользователя (без повторного похода на сервер).
  const viewerGravityUnitRef = useRef<PreferredGravityUnit | null>(null);

  useEffect(() => {
    const rawStoredState = normalizeStoredState(window.localStorage.getItem(calculatorStorageKey(definition.catalog.slug)));
    // Чиним осиротевшие/переосмысленные значения ДО мержа с дефолтами — иначе миграция
    // видела бы уже подмешанные дефолтные поля вместо реального сохранённого состояния.
    const storedState = rawStoredState && definition.migrateStoredState
      ? definition.migrateStoredState(rawStoredState)
      : rawStoredState;
    const baseState = storedState ? { ...cloneState(definition.defaults), ...storedState } : cloneState(definition.defaults);
    const initialState = initialCalculatorStateFromQuery(definition, initialQuery, baseState);
    setState(initialState);

    let active = true;
    const finishMounting = () => {
      if (active) {
        setMounted(true);
      }
    };

    // unit-converter — особый случай: подтягиваем только дефолт активной ячейки при первом
    // визите (нет сохранённого стейта), сами значения внутри конвертера не пересчитываем —
    // это живой ввод, а не выбор единицы записи данных.
    if (definition.catalog.slug === "unit-converter") {
      if (!storedState) {
        loadViewerPreferredGravityUnit()
          .then((unit) => {
            if (active) {
              viewerGravityUnitRef.current = unit;
              setState((current) => (
                // Пользователь мог успеть начать ввод, пока летел запрос, — тогда активная
                // ячейка уже его выбор, и перетаскивать её на предпочтение нельзя.
                current.gravityFrom === definition.defaults.gravityFrom && current.gravityValue === definition.defaults.gravityValue
                  ? { ...current, gravityFrom: toCalculatorGravityUnit(unit) }
                  : current
              ));
            }
          })
          .catch(() => {
            // Сеть/сессия недоступны — остаёмся на дефолтной ячейке SG.
          })
          .finally(finishMounting);
        return () => {
          active = false;
        };
      }
      finishMounting();
      return undefined;
    }

    // Страницы калькуляторов статические (SSG) и не читают сессию на сервере — дефолт
    // единицы плотности подтягивается на клиенте. gravityUnitTouched — «прилипание»
    // ручного выбора: если пользователь уже переключал единицу внутри ЭТОГО калькулятора
    // (в т.ч. в прошлый визит — флаг сохраняется в localStorage), предпочтение из профиля
    // больше не переопределяет её. Иначе — догружаем предпочтение и пересчитываем значения
    // из ИХ текущей (сохранённой/дефолтной) единицы в новую, лечим «застревание» на SG,
    // если предпочтение в профиле поменялось уже после того, как локально осел старый стейт.
    // Предпочтение догружается и при gravityUnitTouched — applyGravityPreference тогда
    // no-op, но ref нужен кнопке «Сбросить»: сброс стирает флаг, и дефолты должны сразу
    // вернуться в единице пользователя, а не в SG. Сам флаг проверяется внутри
    // applyGravityPreference по СВЕЖЕМУ состоянию: пользователь мог переключить шкалу
    // руками, пока летел запрос.
    const gravityConfig = GRAVITY_PREFERENCE_CONFIG[definition.catalog.slug];
    if (gravityConfig) {
      loadViewerPreferredGravityUnit()
        .then((unit) => {
          if (!active) {
            return;
          }
          viewerGravityUnitRef.current = unit;
          setState((current) => applyGravityPreference(current, gravityConfig, unit));
        })
        .catch(() => {
          // Сеть/сессия недоступны — остаёмся на текущей единице.
        })
        .finally(finishMounting);
      return () => {
        active = false;
      };
    }

    finishMounting();
    return undefined;
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
    } catch {
      // error.message из core — техническое сообщение на английском (имя JS-переменной);
      // пользователю показываем только понятный русский текст.
      return {
        primary: { label: "Расчет недоступен", value: "—", helper: "Проверьте входные значения." },
        stats: [],
        warnings: [],
        links: []
      } satisfies CalculatorResult;
    }
  }, [definition, state]);

  const isRefractometer = definition.catalog.slug === "refractometer-correction";
  const isAbv = definition.catalog.slug === "abv-attenuation";
  const isHydrometer = definition.catalog.slug === "hydrometer-correction";
  const isDilution = definition.catalog.slug === "dilution-boiloff";
  const isUnitConverter = definition.catalog.slug === "unit-converter";
  const isKegCarbonation = definition.catalog.slug === "keg-carbonation";
  const mainFields = definition.fields.filter((field) => !field.advanced);
  const advancedFields = definition.fields.filter((field) => field.advanced);
  const visibleAdvancedFields = advancedFields.filter((field) => isFieldVisible(field, state));
  const modeHint = definition.modeHint?.(state) ?? null;
  // The refractometer, ABV and hydrometer blocks render their own advanced section, so the
  // generic advanced panel must stay off for them to avoid duplicating those fields.
  const showAdvanced = visibleAdvancedFields.length > 0 && !isRefractometer && !isAbv && !isHydrometer && !isDilution;

  const handleFieldChange = (name: string, value: unknown) => {
    setState((current) => ({ ...current, [name]: value }));
  };

  // Сброс возвращает дефолты в единице пользователя (если предпочтение уже догружено),
  // а не голый SG из definition.defaults — иначе до перезагрузки страницы калькулятор
  // молча расходился бы со шкалой всего остального приложения.
  const resetState = () => {
    setState((current) => {
      let next = cloneState(definition.defaults);
      const preferred = viewerGravityUnitRef.current;
      const gravityConfig = GRAVITY_PREFERENCE_CONFIG[definition.catalog.slug];
      if (preferred && gravityConfig) {
        next = applyGravityPreference(next, gravityConfig, preferred);
      } else if (definition.catalog.slug === "unit-converter") {
        if (preferred) {
          next.gravityFrom = toCalculatorGravityUnit(preferred);
        }
        // Сброс возвращает значения, но не телепортирует на первую вкладку —
        // пользователь остаётся в той группе, где нажал «Сбросить».
        next.activeGroup = current.activeGroup ?? next.activeGroup;
      }
      return next;
    });
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(calculatorStorageKey(definition.catalog.slug));
    }
  };

  const linkMap = new Map<string, string>();
  // Целевые калькуляторы уже покрытые явной (обычно query-содержащей) ссылкой из
  // result.links — общий цикл relatedSlugs ниже не должен дублировать их голым
  // /calculators/<slug> без параметров.
  const linkedCalculatorPaths = new Set<string>();
  for (const link of result.links ?? []) {
    linkMap.set(link.href, link.label);
    linkedCalculatorPaths.add(link.href.split("?")[0]);
  }
  for (const slug of definition.catalog.relatedSlugs) {
    const path = `/calculators/${slug}`;
    if (definition.catalog.slug !== slug && !linkedCalculatorPaths.has(path)) {
      linkMap.set(path, calculatorBySlug[slug].shortTitle);
    }
  }
  const links = [...linkMap.entries()].map(([href, label]) => ({
    href,
    label: label || href.split("/").pop()?.replaceAll("-", " ") || href
  }));
  // Внешние назначения (вне /calculators) идут после калькуляторных ссылок.
  const nextLinks = [...links, ...(definition.catalog.related ?? [])];

  const gridClassName = isRefractometer
    ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6"
    : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]";

  // keg-carbonation и unit-converter не имеют generic-состояния/результата (свои блоки,
  // своя логика) — для них нет ни липкого мобильного бара, ни ссылки на расчёт.
  // До монтирования (гидратации) бар тоже не показываем — до этого state мог ещё не
  // подхватить сохранённое состояние/query, число было бы обманчивым.
  const showResultActions = mounted && !isKegCarbonation && !isUnitConverter;

  return (
    <>
      {isKegCarbonation ? (
        <KegCarbonationBlock initialQuery={initialQuery} onReset={resetState} />
      ) : isUnitConverter ? (
        <UnitConverterBlock state={state} onChange={handleFieldChange} onReset={resetState} />
      ) : (
        <div className={gridClassName}>
          <section className="space-y-4">
            {isRefractometer ? (
              <RefractometerFieldsBlock state={state} onChange={handleFieldChange} onReset={resetState} />
            ) : isAbv ? (
              <AbvFieldsBlock state={state} onChange={handleFieldChange} onReset={resetState} />
            ) : isHydrometer ? (
              <HydrometerFieldsBlock state={state} onChange={handleFieldChange} onReset={resetState} />
            ) : isDilution ? (
              <DilutionFieldsBlock state={state} onChange={handleFieldChange} onReset={resetState} />
            ) : (
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex justify-end">
                  <button
                    type="button"
                    onClick={resetState}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Сбросить
                  </button>
                </div>
                <FieldsBlock fields={mainFields} state={state} onChange={handleFieldChange} />
                {modeHint ? <p className="mt-3 text-xs leading-5 text-muted-foreground">{modeHint}</p> : null}
                {definition.altMethod ? (
                  <Link
                    href={definition.altMethod.href(state)}
                    className="group mt-3 flex items-center gap-3 rounded-xl border border-border bg-muted px-3 py-2.5 transition-colors hover:border-border hover:bg-card"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{definition.altMethod.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{definition.altMethod.description}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                  </Link>
                ) : null}
              </div>
            )}

            {showAdvanced ? (
              <details className="group rounded-2xl border border-border bg-card p-4 shadow-sm">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
                  </div>
                  Дополнительно
                </summary>
                <div className="mt-4">
                  <FieldsBlock fields={visibleAdvancedFields} state={state} onChange={handleFieldChange} />
                </div>
              </details>
            ) : null}
          </section>

          <div className="space-y-3">
            {isRefractometer ? (
              <RefractometerResultPanel state={state} />
            ) : isAbv ? (
              <AbvResultPanel state={state} />
            ) : isHydrometer ? (
              <HydrometerResultPanel state={state} />
            ) : isDilution ? (
              <DilutionResultPanel state={state} />
            ) : (
              <ResultPanel result={result} />
            )}
            <CopyLinkButton
              buildHref={() => {
                const query = serializeCalculatorStateToQuery(definition, state).toString();
                return `${window.location.origin}/calculators/${definition.catalog.slug}${query ? `?${query}` : ""}`;
              }}
              label="Скопировать ссылку на расчёт"
              successTitle="Ссылка на расчёт скопирована"
            />
          </div>
        </div>
      )}

      <RelatedLinksSection links={nextLinks} />

      {showResultActions ? <StickyResultBar primary={result.primary} /> : null}
    </>
  );
}
