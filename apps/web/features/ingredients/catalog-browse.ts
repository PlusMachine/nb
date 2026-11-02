import type { UserCatalogIngredientDto } from "./contracts";
import { canonicalManufacturerLabel } from "./catalog-display";
import { normalizeSearchText } from "./normalization";
import { resolveCanonicalFamilyBucket } from "./match-group";

export type MaltBrowseFilters = { manufacturer?: string; maltType?: string; ebcMin?: number; ebcMax?: number };
export const maltBrowseTypeLabels: Record<string,string> = {
  base:"Любой базовый",pilsner:"Пилснер",pale_ale:"Пэйл эль",vienna:"Венский",munich:"Мюнхенский",
  wheat:"Пшеничный",rye:"Ржаной",oat:"Овсяный",caramel:"Карамельный",roasted:"Жжёный",
  smoked:"Копчёный",acidulated:"Кислый",biscuit:"Бисквитный",amber:"Янтарный",melanoidin:"Меланоидиновый",special:"Другой специальный"
};
export const resolveMaltBrowseType = (item: UserCatalogIngredientDto): string | null => {
  if (item.subtype !== "malt" || item.technicalData?.type !== "malt") return null;
  const text = normalizeSearchText([item.nameEn,item.nameRu,item.technicalData.maltType].join(" "));
  if (/acidulated|sauermalz|кислый/.test(text)) return "acidulated";
  if (/smoked|rauch|peated|копчен/.test(text)) return "smoked";
  if (/caramel|crystal|cara |caram|карамел|кристалл/.test(text)) return "caramel";
  if (/roast|chocolate|black|carafa|жжен|жжён|шоколад/.test(text)) return "roasted";
  if (/wheat|пшенич/.test(text)) return "wheat";
  if (/rye|ржан/.test(text)) return "rye";
  if (/oat|овсян/.test(text)) return "oat";
  if (/biscuit|бисквит/.test(text)) return "biscuit";
  if (/amber|янтарн/.test(text)) return "amber";
  if (/melanoidin|меланоидин/.test(text)) return "melanoidin";
  const family = resolveCanonicalFamilyBucket([item.nameEn, item.nameRu]);
  if (family) return family;
  return item.technicalData.maltType === "base" ? "base" : "special";
};

export const matchesMaltBrowseFilters = (item: UserCatalogIngredientDto, filters: MaltBrowseFilters): boolean => {
  if (filters.manufacturer && normalizeSearchText(canonicalManufacturerLabel(item.brand ?? item.producer) ?? "")
    !== normalizeSearchText(canonicalManufacturerLabel(filters.manufacturer) ?? "")) return false;
  if (filters.maltType === "base") {
    if (item.technicalData?.type !== "malt" || item.technicalData.maltType !== "base") return false;
  } else if (filters.maltType && resolveMaltBrowseType(item) !== filters.maltType) return false;
  if (filters.ebcMin != null || filters.ebcMax != null) {
    const data = item.technicalData;
    if (data?.type !== "malt") return false;
    const min = typeof data.colorEbcMin === "number" ? data.colorEbcMin : null;
    const max = typeof data.colorEbcMax === "number" ? data.colorEbcMax : null;
    if (min == null && max == null) return false;
    // Intersection with a specification range. One-sided bounds stay open;
    // an unknown colour cannot match a numeric interval.
    if (filters.ebcMin != null && max != null && max < filters.ebcMin) return false;
    if (filters.ebcMax != null && min != null && min > filters.ebcMax) return false;
  }
  return true;
};

export const buildMaltBrowseOptions = (items: UserCatalogIngredientDto[]) => ({
  manufacturers:[...new Set(items.filter((item) => item.subtype === "malt").map((item) => canonicalManufacturerLabel(item.brand ?? item.producer)).filter((value):value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b,"ru")),
  types:Object.entries(maltBrowseTypeLabels).filter(([key])=>items.some((item)=>key === "base" ? item.technicalData?.type === "malt" && item.technicalData.maltType === "base" : resolveMaltBrowseType(item)===key)).map(([value,label])=>({value,label}))
});

/** Identity must be asserted in the catalog: names alone never collapse suppliers. */
export const groupConfirmedHopSuppliers = (items: UserCatalogIngredientDto[]) => {
  const groups = new Map<string,UserCatalogIngredientDto[]>();
  for (const item of items) {
    const data = item.technicalData;
    const key = item.source === "catalog" && data?.type === "hop" && typeof data.varietyKey === "string"
      && data.varietyKey && item.countryCode && typeof data.hopForm === "string" && data.hopForm && data.isBlend === false
      ? `hop:${data.varietyKey}:${item.countryCode}:${data.hopForm}` : `${item.source}:${item.id}`;
    const group = groups.get(key) ?? []; group.push(item); groups.set(key,group);
  }
  return [...groups.entries()].map(([key,variants])=>({key,variants}));
};
