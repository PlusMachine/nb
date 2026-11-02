"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Dialog } from "@nb/ui";

import { NumericInput } from "@/components/shared/numeric-input";
import type { MaltBrowseFilters } from "@/features/ingredients/catalog-browse";
import { ingredientPickerMaltQuickStartFallbackBrands, ingredientPickerMaltQuickStartFamilies } from "@/features/ingredients/picker-quick-start";

type Props = {
  options: { manufacturers: string[]; types: Array<{ value: string; label: string }> };
  filters: MaltBrowseFilters;
};

export function MaltCatalogFilters({ options, filters }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const [open, setOpen] = useState<"manufacturer" | "maltType" | null>(null);
  const [query, setQuery] = useState("");
  const [min, setMin] = useState(filters.ebcMin == null ? "" : String(filters.ebcMin));
  const [max, setMax] = useState(filters.ebcMax == null ? "" : String(filters.ebcMax));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMin(filters.ebcMin == null ? "" : String(filters.ebcMin));
    setMax(filters.ebcMax == null ? "" : String(filters.ebcMax));
    setError(null);
  }, [filters.ebcMin, filters.ebcMax]);

  const update = (patch: Record<string, string>) => {
    const params = new URLSearchParams(search.toString());
    params.delete("page");
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value); else params.delete(key);
    }
    router.replace(`/catalog/malts${params.size ? `?${params}` : ""}`);
  };
  const choices = open === "manufacturer"
    ? options.manufacturers.map((value) => ({ value, label: value }))
    : options.types;
  const visibleChoices = choices.filter((choice) => choice.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const inputClass = "rounded-xl border border-border bg-card px-3 py-2 text-sm";
  const quickBrands = ingredientPickerMaltQuickStartFallbackBrands.map((brand) => (
    options.manufacturers.find((value) => value.toLocaleLowerCase() === brand.label.toLocaleLowerCase())
  )).filter((value): value is string => Boolean(value));
  const choose = (value: string) => {
    if (open) update({ [open]: value });
    setOpen(null);
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4" aria-label="Фильтры солода">
      <div className="flex flex-wrap gap-2">
        {quickBrands.map((value) => (
          <button key={value} type="button" aria-pressed={filters.manufacturer === value}
            className={`${inputClass} ${filters.manufacturer === value ? "border-primary bg-primary/10" : ""}`}
            onClick={() => update({ manufacturer: filters.manufacturer === value ? "" : value })}>
            {value}
          </button>
        ))}
        <button type="button" className={inputClass} onClick={() => { setOpen("manufacturer"); setQuery(""); }}>
          {filters.manufacturer ?? "Все производители…"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {ingredientPickerMaltQuickStartFamilies.filter((family) => options.types.some((type) => type.value === family.key)).map((family) => (
          <button key={family.key} type="button" aria-pressed={filters.maltType === family.key}
            className={`${inputClass} ${filters.maltType === family.key ? "border-primary bg-primary/10" : ""}`}
            onClick={() => update({ maltType: filters.maltType === family.key ? "" : family.key })}>{family.label}</button>
        ))}
        <button type="button" className={inputClass} onClick={() => { setOpen("maltType"); setQuery(""); }}>
          {options.types.find((type) => type.value === filters.maltType)?.label ?? "Все виды…"}
        </button>
      </div>
      <form action="/catalog/malts" method="get" className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        const lower = min.replace(",", "."), upper = max.replace(",", ".");
        if ((lower && (!Number.isFinite(Number(lower)) || Number(lower) < 0))
          || (upper && (!Number.isFinite(Number(upper)) || Number(upper) < 0))) {
          setError("Укажите цвет EBC от 0 и выше.");
          return;
        }
        if (lower && upper && Number(lower) > Number(upper)) {
          setError("Нижняя граница должна быть не больше верхней.");
          return;
        }
        setError(null);
        update({ ebcMin: lower, ebcMax: upper });
      }}>
        {[...search.entries()].filter(([key]) => !["ebcMin", "ebcMax", "page"].includes(key)).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <label className="text-sm">Цвет, EBC · от
          <NumericInput name="ebcMin" min={0} className={`${inputClass} mt-1 block w-28`} value={min} onChange={(event) => setMin(event.target.value)} />
        </label>
        <label className="text-sm">до
          <NumericInput name="ebcMax" min={0} className={`${inputClass} mt-1 block w-28`} value={max} onChange={(event) => setMax(event.target.value)} />
        </label>
        <button type="submit" className={inputClass}>Применить</button>
        {(filters.manufacturer || filters.maltType || min || max) ? (
          <button type="button" className="px-2 py-2 text-sm text-muted-foreground underline" onClick={() => {
            setMin(""); setMax(""); setError(null);
            update({ manufacturer: "", maltType: "", ebcMin: "", ebcMax: "" });
          }}>Сбросить фильтры</button>
        ) : null}
      </form>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Dialog open={Boolean(open)} onOpenChange={(value) => { if (!value) setOpen(null); }}
        title={open === "manufacturer" ? "Производители солода" : "Виды солода"}>
        <div className="space-y-3 p-4">
          <input autoFocus aria-label="Поиск в списке" className={`${inputClass} w-full`} value={query}
            onChange={(event) => setQuery(event.target.value)} placeholder="Найти…" />
          <div className="max-h-80 overflow-y-auto">
            <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => choose("")}>Все</button>
            {visibleChoices.map((choice) => (
              <button key={choice.value} type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => choose(choice.value)}>{choice.label}</button>
            ))}
            {!visibleChoices.length ? <p className="px-3 py-2 text-sm text-muted-foreground">Ничего не найдено</p> : null}
          </div>
        </div>
      </Dialog>
    </section>
  );
}
