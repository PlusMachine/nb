"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, WandSparkles } from "lucide-react";

import { Button, Checkbox, Input, Select, Textarea } from "@nb/ui";
import { NumericInput } from "@/components/shared/numeric-input";

import type { IngredientCatalogItemDto } from "@/features/ingredients/contracts";
import { ingredientAliasLocales, ingredientDisplayModes } from "@/features/ingredients/contracts";
import {
  buildAliasPayload,
  buildPackageVariantPayload,
  createAdminAliasRow,
  createAdminPackageVariantRow,
  formatEnumLabel,
  formatJsonText,
  getAdminIngredientFieldVisibility,
  getAdminIngredientSubtypeOptions,
  getNextAdminIngredientTaxonomyState,
  ingredientAliasLocaleLabels,
  parseJsonField,
  stringifyJson,
  toAdminAliasRows,
  toAdminPackageVariantRows,
  validateJsonText,
  type AdminAliasRow,
  type AdminPackageVariantRow,
  type JsonFieldShape
} from "@/features/ingredients/admin-form-model";
import {
  buildIngredientTypedSummary,
  resolveIngredientDisplayNames
} from "@/features/ingredients/presentation";
import {
  ingredientCategories,
  resolveIngredientCategory,
  resolveIngredientSubtype,
  resolveLegacyIngredientType,
  type IngredientCategory,
  type IngredientSubtype
} from "@/features/ingredients/taxonomy";

type IngredientFormValue = Partial<IngredientCatalogItemDto> & { id?: string };

const sectionClassName = "space-y-4 rounded-lg border border-border bg-card p-4";
const sectionTitleClassName = "text-sm font-semibold text-foreground";
const fieldLabelClassName = "text-sm font-medium text-foreground";
const numericInputClassName = "h-10 w-full rounded-md border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm";

const readOptionalText = (formData: FormData, key: string) => {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
};

const readOptionalBoolean = (formData: FormData, key: string) => {
  const raw = formData.get(key);
  if (raw == null) {
    return false;
  }

  return raw === "on" || raw === "true";
};

const TextField = ({
  name,
  label,
  defaultValue,
  readOnly
}: {
  name: string;
  label: string;
  defaultValue?: string;
  readOnly?: boolean;
}) => {
  const id = `field-${name}`;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={fieldLabelClassName}>{label}</label>
      <Input
        id={id}
        name={name}
        defaultValue={defaultValue}
        readOnly={readOnly}
        className={readOnly ? "bg-muted" : undefined}
      />
    </div>
  );
};

/**
 * JSON-поле с проверкой на лету: ошибка показывается сразу при вводе, а не
 * всплывает при отправке всей формы (главный источник потерь ввода в этой форме).
 */
const JsonField = ({
  id,
  label,
  value,
  shape,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  shape: JsonFieldShape;
  onChange: (next: string) => void;
}) => {
  const error = validateJsonText(value, shape);
  const errorId = `${id}-error`;

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={fieldLabelClassName}>{label}</label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={error !== null}
          onClick={() => {
            const formatted = formatJsonText(value);
            if (formatted !== null) {
              onChange(formatted);
            }
          }}
        >
          <WandSparkles className="h-3.5 w-3.5" aria-hidden />
          Форматировать
        </Button>
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        className={`min-h-[120px] font-mono text-xs ${error ? "border-destructive-border focus:ring-destructive/40" : ""}`}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
};

const AliasEditor = ({
  rows,
  onChange
}: {
  rows: AdminAliasRow[];
  onChange: (next: AdminAliasRow[]) => void;
}) => (
  <div className="space-y-3">
    {rows.length === 0 ? (
      <p className="text-sm text-muted-foreground">Алиасов нет.</p>
    ) : (
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.id ?? `alias-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto_auto] sm:items-center">
            <Input
              value={row.alias}
              aria-label={`Алиас ${index + 1}`}
              placeholder="Альтернативное название"
              onChange={(event) => onChange(rows.map((item, itemIndex) => (
                itemIndex === index ? { ...item, alias: event.target.value } : item
              )))}
            />
            <Select
              value={row.locale}
              aria-label={`Язык алиаса ${index + 1}`}
              onChange={(event) => onChange(rows.map((item, itemIndex) => (
                itemIndex === index
                  ? { ...item, locale: event.target.value as AdminAliasRow["locale"] }
                  : item
              )))}
            >
              {ingredientAliasLocales.map((locale) => (
                <option key={locale} value={locale}>{ingredientAliasLocaleLabels[locale]}</option>
              ))}
            </Select>
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={row.isEnabled}
                onCheckedChange={(checked) => onChange(rows.map((item, itemIndex) => (
                  itemIndex === index ? { ...item, isEnabled: checked } : item
                )))}
              />
              Включён
            </label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Удалить алиас ${index + 1}`}
              onClick={() => onChange(rows.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    )}
    <Button type="button" size="sm" variant="outline" onClick={() => onChange([...rows, createAdminAliasRow()])}>
      <Plus className="h-4 w-4" aria-hidden />
      Добавить алиас
    </Button>
  </div>
);

const PackageVariantEditor = ({
  rows,
  onChange
}: {
  rows: AdminPackageVariantRow[];
  onChange: (next: AdminPackageVariantRow[]) => void;
}) => {
  const patch = (index: number, next: Partial<AdminPackageVariantRow>) => {
    onChange(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item)));
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Вариантов фасовки нет.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, index) => (
            <li key={row.id} className="space-y-3 rounded-md border border-border p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={row.brand ?? ""}
                  aria-label={`Бренд варианта ${index + 1}`}
                  placeholder="Бренд"
                  onChange={(event) => patch(index, { brand: event.target.value || null })}
                />
                <Input
                  value={row.productNameRu ?? ""}
                  aria-label={`Название варианта ${index + 1}`}
                  placeholder="Название товара"
                  onChange={(event) => patch(index, { productNameRu: event.target.value || null })}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                <NumericInput
                  value={row.packageAmountText}
                  aria-label={`Объём упаковки варианта ${index + 1}`}
                  placeholder="Упаковка"
                  className={numericInputClassName}
                  onChange={(event) => patch(index, { packageAmountText: event.target.value })}
                />
                <Input
                  value={row.packageUnit ?? ""}
                  aria-label={`Единица упаковки варианта ${index + 1}`}
                  placeholder="Единица (g, ml)"
                  onChange={(event) => patch(index, { packageUnit: event.target.value || null })}
                />
                <NumericInput
                  value={row.stockContentAmountText}
                  aria-label={`Содержимое на складе варианта ${index + 1}`}
                  placeholder="На складе"
                  className={numericInputClassName}
                  onChange={(event) => patch(index, { stockContentAmountText: event.target.value })}
                />
                <Input
                  value={row.stockContentUnit ?? ""}
                  aria-label={`Единица склада варианта ${index + 1}`}
                  placeholder="Единица склада"
                  onChange={(event) => patch(index, { stockContentUnit: event.target.value || null })}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={row.isDefaultForStock}
                    onCheckedChange={(checked) => patch(index, { isDefaultForStock: checked })}
                  />
                  По умолчанию на складе
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Удалить вариант ${index + 1}`}
                  onClick={() => onChange(rows.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange([...rows, createAdminPackageVariantRow(rows.length)])}
      >
        <Plus className="h-4 w-4" aria-hidden />
        Добавить вариант
      </Button>
    </div>
  );
};

export const AdminIngredientForm = ({ initial }: { initial?: IngredientFormValue }) => {
  const router = useRouter();

  const initialCategory = resolveIngredientCategory({
    category: initial?.category,
    type: initial?.type,
    subtype: initial?.subtype ?? initial?.itemKind
  });
  const initialSubtype = resolveIngredientSubtype({
    category: initialCategory,
    type: initial?.type,
    subtype: initial?.subtype ?? initial?.itemKind
  }) ?? getAdminIngredientSubtypeOptions(initialCategory)[0] ?? null;

  const [selectedCategory, setSelectedCategory] = useState<IngredientCategory>(initialCategory);
  const [selectedSubtype, setSelectedSubtype] = useState<IngredientSubtype | null>(initialSubtype);
  const [aliasRows, setAliasRows] = useState<AdminAliasRow[]>(() => toAdminAliasRows(initial?.aliases));
  const [packageVariantRows, setPackageVariantRows] = useState<AdminPackageVariantRow[]>(
    () => toAdminPackageVariantRows(initial?.packageVariants)
  );
  const [attributesJson, setAttributesJson] = useState(() => stringifyJson(initial?.attributes ?? {}));
  const [sourcesJson, setSourcesJson] = useState(() => stringifyJson(initial?.sources ?? []));
  const [quantityDefaultsJson, setQuantityDefaultsJson] = useState(
    () => stringifyJson(initial?.quantityDefaults ?? null)
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const subtypeOptions = getAdminIngredientSubtypeOptions(selectedCategory);
  const fieldVisibility = getAdminIngredientFieldVisibility(selectedCategory, selectedSubtype);
  const resolvedType = resolveLegacyIngredientType({
    category: selectedCategory,
    subtype: selectedSubtype
  });

  const showPackageVariants = selectedCategory === "consumable";
  const showQuantityDefaults = selectedCategory === "consumable" || selectedCategory === "water_treatment";

  const jsonError = validateJsonText(attributesJson, "object")
    ?? validateJsonText(sourcesJson, "array")
    ?? (showQuantityDefaults ? validateJsonText(quantityDefaultsJson, "object_or_null") : null);

  const preview = useMemo(() => {
    let attributes: Record<string, unknown> = {};

    try {
      attributes = parseJsonField<Record<string, unknown>>(attributesJson, {}, "Атрибуты");
    } catch {
      attributes = {};
    }

    const primaryAndSecondary = resolveIngredientDisplayNames({
      type: resolvedType,
      countryCode: initial?.countryCode ?? null,
      countryName: initial?.countryName ?? null,
      nameRu: initial?.nameRu ?? null,
      nameEn: initial?.nameEn ?? null,
      displayModeRu: initial?.displayModeRu ?? "auto",
      displayNameOverrideRu: initial?.displayNameOverrideRu ?? null,
      secondaryNameOverrideRu: initial?.secondaryNameOverrideRu ?? null,
      hideSecondaryNameRu: initial?.hideSecondaryNameRu ?? false
    });

    return {
      ...primaryAndSecondary,
      summary: buildIngredientTypedSummary({
        type: resolvedType,
        category: selectedCategory,
        subtype: selectedSubtype,
        technicalData: {
          type: resolvedType,
          ...attributes
        }
      }) ?? null
    };
  }, [
    attributesJson,
    initial?.countryCode,
    initial?.countryName,
    initial?.displayModeRu,
    initial?.displayNameOverrideRu,
    initial?.hideSecondaryNameRu,
    initial?.nameEn,
    initial?.nameRu,
    initial?.secondaryNameOverrideRu,
    resolvedType,
    selectedCategory,
    selectedSubtype
  ]);

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);

        if (jsonError) {
          setError("Проверьте JSON-поля: есть незакрытые ошибки.");
          return;
        }

        const formData = new FormData(event.currentTarget);

        try {
          setIsSubmitting(true);

          const attributes = parseJsonField<Record<string, unknown>>(attributesJson, {}, "Атрибуты");
          const sources = parseJsonField<Array<{
            id?: string;
            kind?: string | null;
            label?: string | null;
            url?: string | null;
            sourceBasis?: string | null;
            position?: number;
          }>>(sourcesJson, [], "Источники");
          const quantityDefaults = parseJsonField<Record<string, unknown> | null>(
            quantityDefaultsJson,
            null,
            "Количества по умолчанию"
          );

          const payload = {
            id: initial?.id,
            type: resolvedType,
            category: selectedCategory,
            itemKind: selectedSubtype,
            nameRu: readOptionalText(formData, "nameRu"),
            nameEn: readOptionalText(formData, "nameEn"),
            descriptionRu: readOptionalText(formData, "descriptionRu"),
            displayModeRu: String(formData.get("displayModeRu") ?? "auto"),
            displayNameOverrideRu: readOptionalText(formData, "displayNameOverrideRu"),
            secondaryNameOverrideRu: readOptionalText(formData, "secondaryNameOverrideRu"),
            hideSecondaryNameRu: readOptionalBoolean(formData, "hideSecondaryNameRu"),
            isActive: readOptionalBoolean(formData, "isActive"),
            inventoryEnabled: readOptionalBoolean(formData, "inventoryEnabled"),
            countryCode: readOptionalText(formData, "countryCode"),
            countryName: readOptionalText(formData, "countryName"),
            brand: readOptionalText(formData, "brand"),
            producer: readOptionalText(formData, "producer"),
            productCode: readOptionalText(formData, "productCode"),
            groupName: readOptionalText(formData, "groupName"),
            sourceCategory: readOptionalText(formData, "sourceCategory"),
            subcategory: readOptionalText(formData, "subcategory"),
            presentOnBirrf: formData.get("presentOnBirrf") === ""
              ? null
              : formData.get("presentOnBirrf") === "true",
            attributes,
            quantityDefaults,
            aliases: buildAliasPayload(aliasRows),
            sources: sources.map((source, index) => ({
              id: source.id,
              kind: source.kind ?? null,
              label: source.label ?? null,
              url: source.url ?? null,
              sourceBasis: source.sourceBasis ?? null,
              position: source.position ?? index
            })),
            packageVariants: showPackageVariants ? buildPackageVariantPayload(packageVariantRows) : []
          };

          const method = initial?.id ? "PATCH" : "POST";
          const endpoint = initial?.id ? `/api/admin/ingredients/${initial.id}` : "/api/admin/ingredients";
          const response = await fetch(endpoint, {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const data = await response.json() as { error?: string };
            setError(data.error ?? "Не удалось выполнить запрос");
            return;
          }

          router.push("/admin/ingredients");
          router.refresh();
        } catch (submissionError) {
          setError(submissionError instanceof Error ? submissionError.message : "Не удалось выполнить запрос");
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground ring-1 ring-inset ring-destructive-border"
        >
          {error}
        </p>
      ) : null}

      <section className={sectionClassName}>
        <h2 className={sectionTitleClassName}>Таксономия</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Select
            label="Категория"
            value={selectedCategory}
            onChange={(event) => {
              const nextState = getNextAdminIngredientTaxonomyState({
                category: selectedCategory,
                subtype: selectedSubtype
              }, {
                category: event.target.value as IngredientCategory
              });
              setSelectedCategory(nextState.category);
              setSelectedSubtype(nextState.subtype);
            }}
          >
            {ingredientCategories.map((category) => (
              <option key={category} value={category}>{formatEnumLabel(category)}</option>
            ))}
          </Select>
          <Select
            label="Подтип"
            value={selectedSubtype ?? ""}
            onChange={(event) => setSelectedSubtype(resolveIngredientSubtype({
              category: selectedCategory,
              subtype: event.target.value
            }))}
          >
            {subtypeOptions.map((subtype) => (
              <option key={subtype} value={subtype}>{formatEnumLabel(subtype)}</option>
            ))}
          </Select>
          <div className="grid gap-1.5">
            <label htmlFor="field-type" className={fieldLabelClassName}>Тип</label>
            <Input id="field-type" value={resolvedType} readOnly className="bg-muted" />
          </div>
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className={sectionTitleClassName}>Названия и отображение</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField name="nameRu" label="Название (рус.)" defaultValue={initial?.nameRu ?? ""} />
          <TextField name="nameEn" label="Название (англ.)" defaultValue={initial?.nameEn ?? ""} />
          <Select
            label="Режим отображения (рус.)"
            name="displayModeRu"
            defaultValue={initial?.displayModeRu ?? "auto"}
          >
            {ingredientDisplayModes.map((mode) => (
              <option key={mode} value={mode}>{mode}</option>
            ))}
          </Select>
          <TextField
            name="displayNameOverrideRu"
            label="Своё основное название"
            defaultValue={initial?.displayNameOverrideRu ?? ""}
          />
          <TextField
            name="secondaryNameOverrideRu"
            label="Своё второе название"
            defaultValue={initial?.secondaryNameOverrideRu ?? ""}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm text-foreground md:mt-6">
            <Checkbox name="hideSecondaryNameRu" defaultChecked={initial?.hideSecondaryNameRu ?? false} />
            Скрыть второе название
          </label>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="field-descriptionRu" className={fieldLabelClassName}>Описание</label>
          <Textarea
            id="field-descriptionRu"
            name="descriptionRu"
            defaultValue={initial?.descriptionRu ?? ""}
            rows={8}
          />
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className={sectionTitleClassName}>Метаданные</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <TextField name="brand" label="Бренд" defaultValue={initial?.brand ?? ""} />
          <TextField name="producer" label="Производитель" defaultValue={initial?.producer ?? ""} />
          <TextField name="productCode" label="Артикул" defaultValue={initial?.productCode ?? ""} />
          <TextField name="countryCode" label="Код страны" defaultValue={initial?.countryCode ?? ""} />
          <TextField name="countryName" label="Название страны" defaultValue={initial?.countryName ?? ""} />
          <TextField name="groupName" label="Группа" defaultValue={initial?.groupName ?? ""} />
          <TextField name="sourceCategory" label="Категория источника" defaultValue={initial?.sourceCategory ?? ""} />
          <TextField name="subcategory" label="Подкатегория" defaultValue={initial?.subcategory ?? ""} />
          <Select
            label="Есть в BIRRF"
            name="presentOnBirrf"
            defaultValue={initial?.presentOnBirrf == null ? "" : String(initial.presentOnBirrf)}
          >
            <option value="">Не указано</option>
            <option value="true">Да</option>
            <option value="false">Нет</option>
          </Select>
          <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
            <Checkbox name="isActive" defaultChecked={initial?.isActive ?? true} />
            Активен
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
            <Checkbox name="inventoryEnabled" defaultChecked={initial?.inventoryEnabled ?? true} />
            Доступен на складе
          </label>
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className={sectionTitleClassName}>Алиасы</h2>
        <AliasEditor rows={aliasRows} onChange={setAliasRows} />
      </section>

      {showPackageVariants ? (
        <section className={sectionClassName}>
          <h2 className={sectionTitleClassName}>Варианты упаковки</h2>
          <PackageVariantEditor rows={packageVariantRows} onChange={setPackageVariantRows} />
        </section>
      ) : null}

      <section className={sectionClassName}>
        <h2 className={sectionTitleClassName}>Атрибуты</h2>
        <JsonField
          id="json-attributes"
          label="Атрибуты"
          value={attributesJson}
          shape="object"
          onChange={setAttributesJson}
        />
        <JsonField
          id="json-sources"
          label="Источники"
          value={sourcesJson}
          shape="array"
          onChange={setSourcesJson}
        />
        {showQuantityDefaults ? (
          <JsonField
            id="json-quantity-defaults"
            label="Количества по умолчанию"
            value={quantityDefaultsJson}
            shape="object_or_null"
            onChange={setQuantityDefaultsJson}
          />
        ) : null}
      </section>

      <section className={sectionClassName}>
        <h2 className={sectionTitleClassName}>Предпросмотр</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-border bg-muted p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Каталог / Поиск</p>
            <p className="mt-2 font-medium text-foreground">{preview.primaryName || "Без основного названия"}</p>
            {preview.secondaryName ? <p className="text-sm text-muted-foreground">{preview.secondaryName}</p> : null}
            {preview.summary ? <p className="mt-2 text-sm text-muted-foreground">{preview.summary}</p> : null}
          </div>
          <div className="rounded-md border border-border bg-muted p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Рецепт / Склад</p>
            <p className="mt-2 font-medium text-foreground">{preview.primaryName || "Без основного названия"}</p>
            <p className="text-sm text-muted-foreground">{resolvedType} / {selectedCategory} / {selectedSubtype ?? "none"}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Основные поля: {fieldVisibility.primary.join(", ")}
            </p>
            {fieldVisibility.advanced.length ? (
              <p className="text-sm text-muted-foreground">Дополнительные поля: {fieldVisibility.advanced.join(", ")}</p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="md" disabled={isSubmitting || jsonError !== null}>
          {isSubmitting ? "Сохраняем..." : initial?.id ? "Сохранить" : "Создать"}
        </Button>
        <Link
          href="/admin/ingredients"
          className="inline-flex min-h-[44px] items-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Отмена
        </Link>
      </div>
    </form>
  );
};
