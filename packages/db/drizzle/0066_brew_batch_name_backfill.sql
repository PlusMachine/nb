-- Легаси-хвосты автошаблонов имени партии (до F5, где номер уехал в отдельную
-- колонку brew_number): первый шаблон клеил " brew", второй — " №N" с номером
-- варки. Хранимое name теперь должно быть чистым — номер собирается на рендере
-- (formatBrewBatchDisplayTitle) из name + brew_number.
UPDATE "brew_batches"
SET "name" = regexp_replace("name", '\s+brew$', ''),
    "updated_at" = now()
WHERE "name" ~ '\s+brew$';--> statement-breakpoint

UPDATE "brew_batches"
SET "name" = regexp_replace("name", '\s+№' || "brew_number" || '$', ''),
    "updated_at" = now()
WHERE "name" ~ ('\s+№' || "brew_number" || '$');