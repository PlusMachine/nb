const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
};

const transliterate = (value: string) => value
  .toLowerCase()
  .split("")
  .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
  .join("");

export const toRecipeSlugBase = (title: string) => {
  const transliterated = transliterate(title);
  const sanitized = transliterated
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  const sliced = sanitized.slice(0, 200).replace(/-+$/g, "");
  return sliced || "recipe";
};

export const appendSlugSuffix = (base: string, index: number) => {
  if (index <= 1) {
    return base;
  }

  const suffix = `-${index}`;
  const trimmedBase = base.slice(0, Math.max(1, 220 - suffix.length)).replace(/-+$/g, "");
  return `${trimmedBase}${suffix}`;
};
