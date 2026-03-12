WITH base AS (
  SELECT
    id,
    trim(both '-' FROM regexp_replace(
      lower(
        replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(title,
          'щ', 'sch'), 'ш', 'sh'), 'ч', 'ch'), 'ж', 'zh'), 'ю', 'yu'), 'я', 'ya'), 'ё', 'e'),
          'й', 'y'), 'х', 'h'), 'ц', 'c'), 'э', 'e'), 'ъ', ''), 'ь', ''),
          'а', 'a'), 'б', 'b'), 'в', 'v'), 'г', 'g'), 'д', 'd'), 'е', 'e'),
          'з', 'z'), 'и', 'i'), 'к', 'k'), 'л', 'l'), 'м', 'm'), 'н', 'n'),
          'о', 'o'), 'п', 'p'), 'р', 'r'), 'с', 's'), 'т', 't'), 'у', 'u'),
          'ф', 'f'), 'ы', 'y')
      ),
      '[^a-z0-9]+', '-', 'g'
    )) AS slug_base
  FROM recipes
), normalized AS (
  SELECT
    id,
    CASE WHEN slug_base = '' THEN 'recipe' ELSE left(slug_base, 200) END AS slug_base
  FROM base
), ranked AS (
  SELECT
    id,
    slug_base,
    row_number() OVER (PARTITION BY slug_base ORDER BY id) AS slug_rank
  FROM normalized
)
UPDATE recipes r
SET slug = CASE
  WHEN ranked.slug_rank = 1 THEN ranked.slug_base
  ELSE left(ranked.slug_base, 220 - length(('-' || ranked.slug_rank)::text)) || '-' || ranked.slug_rank
END
FROM ranked
WHERE r.id = ranked.id
  AND (r.slug IS NULL OR r.slug = '');

ALTER TABLE recipes
ALTER COLUMN slug SET NOT NULL;
