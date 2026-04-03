UPDATE "ingredients"
SET "display_mode_ru" = CASE
  WHEN NULLIF(TRIM("name_ru"), '') IS NOT NULL
    AND (
      COALESCE(NULLIF(UPPER(TRIM("country_code")), ''), '') IN ('RU', 'BY', 'UA', 'KZ', 'RUS', 'BLR', 'UKR', 'KAZ')
      OR COALESCE(NULLIF(LOWER(TRIM("country_name")), ''), '') IN (
        'россия',
        'russia',
        'российская федерация',
        'russian federation',
        'беларусь',
        'belarus',
        'украина',
        'ukraine',
        'казахстан',
        'kazakhstan'
      )
    )
    THEN 'localized_first'
  ELSE 'source_first'
END
WHERE ("type" = 'malt' AND "display_mode_ru" = 'localized_first')
   OR ("type" = 'yeast' AND "display_mode_ru" = 'source_first');
