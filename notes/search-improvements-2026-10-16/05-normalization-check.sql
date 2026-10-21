BEGIN READ ONLY;
with cases(input, expected) as (values ('Мёд'::text, 'мед'::text), ('Ёлки-палки'::text, 'елки палки'::text), ('US-05'::text, 'us 05'::text), ('SafAle US-05'::text, 'safale us 05'::text), ('US_05'::text, 'us 05'::text), ('US/05'::text, 'us 05'::text), ('US\05'::text, 'us 05'::text), ('US|05'::text, 'us 05'::text), ('  Мёд	
сырой  '::text, 'мед сырой'::text), ('ＡＢＣ １２３'::text, 'abc 123'::text), ('Kölsch'::text, 'kölsch'::text), ('Straße'::text, 'straße'::text), ('50%off'::text, '50%off'::text), ('Мёд''; drop table recipes; --'::text, 'мед drop table recipes'::text), (NULL::text, ''::text), ('!!!'::text, ''::text), (''::text, ''::text)) select json_build_object('normalization_cases', count(*), 'matching', count(*) filter(where trim(regexp_replace(
  translate(replace(lower(normalize(coalesce(input, ''), NFKC)), 'ё', 'е'), '.,;:!?()[]{}"“”«»''`´-_/\|	
                  　﻿', '                                                  '),
  ' +', ' ', 'g'
)) = expected), 'mismatches', coalesce(json_agg(input) filter(where trim(regexp_replace(
  translate(replace(lower(normalize(coalesce(input, ''), NFKC)), 'ё', 'е'), '.,;:!?()[]{}"“”«»''`´-_/\|	
                  　﻿', '                                                  '),
  ' +', ' ', 'g'
)) <> expected), '[]'::json)) from cases;
select json_build_object('matching_cases',count(*),'matching',count(*) filter(where expected=actual),'mismatches',coalesce(json_agg(value) filter(where expected<>actual),'[]'::json)) from (select 'Мёд'::text as value, 'мед'::text as query, 'true'::boolean as expected, trim(regexp_replace(
  translate(replace(lower(normalize(coalesce('Мёд'::text, ''), NFKC)), 'ё', 'е'), '.,;:!?()[]{}"“”«»''`´-_/\|	
                  　﻿', '                                                  '),
  ' +', ' ', 'g'
)) ilike any(array['%мед%']::text[]) as actual union all select 'Мёд'::text as value, 'мёд'::text as query, 'true'::boolean as expected, trim(regexp_replace(
  translate(replace(lower(normalize(coalesce('Мёд'::text, ''), NFKC)), 'ё', 'е'), '.,;:!?()[]{}"“”«»''`´-_/\|	
                  　﻿', '                                                  '),
  ' +', ' ', 'g'
)) ilike any(array['%мед%']::text[]) as actual union all select 'SafAle US-05'::text as value, 'US 05'::text as query, 'true'::boolean as expected, trim(regexp_replace(
  translate(replace(lower(normalize(coalesce('SafAle US-05'::text, ''), NFKC)), 'ё', 'е'), '.,;:!?()[]{}"“”«»''`´-_/\|	
                  　﻿', '                                                  '),
  ' +', ' ', 'g'
)) ilike any(array['%us 05%']::text[]) as actual union all select 'SafAle US-05'::text as value, 'US-05'::text as query, 'true'::boolean as expected, trim(regexp_replace(
  translate(replace(lower(normalize(coalesce('SafAle US-05'::text, ''), NFKC)), 'ё', 'е'), '.,;:!?()[]{}"“”«»''`´-_/\|	
                  　﻿', '                                                  '),
  ' +', ' ', 'g'
)) ilike any(array['%us 05%']::text[]) as actual union all select 'SafAle US-05'::text as value, 'US05'::text as query, 'false'::boolean as expected, trim(regexp_replace(
  translate(replace(lower(normalize(coalesce('SafAle US-05'::text, ''), NFKC)), 'ё', 'е'), '.,;:!?()[]{}"“”«»''`´-_/\|	
                  　﻿', '                                                  '),
  ' +', ' ', 'g'
)) ilike any(array['%us05%']::text[]) as actual union all select 'anything'::text as value, '!!!'::text as query, 'false'::boolean as expected, trim(regexp_replace(
  translate(replace(lower(normalize(coalesce('anything'::text, ''), NFKC)), 'ё', 'е'), '.,;:!?()[]{}"“”«»''`´-_/\|	
                  　﻿', '                                                  '),
  ' +', ' ', 'g'
)) ilike any(array['%!!!%']::text[]) as actual union all select 'anything'::text as value, '50%'::text as query, 'false'::boolean as expected, trim(regexp_replace(
  translate(replace(lower(normalize(coalesce('anything'::text, ''), NFKC)), 'ё', 'е'), '.,;:!?()[]{}"“”«»''`´-_/\|	
                  　﻿', '                                                  '),
  ' +', ' ', 'g'
)) ilike any(array['%50\%%']::text[]) as actual union all select '50%off'::text as value, '50%'::text as query, 'true'::boolean as expected, trim(regexp_replace(
  translate(replace(lower(normalize(coalesce('50%off'::text, ''), NFKC)), 'ё', 'е'), '.,;:!?()[]{}"“”«»''`´-_/\|	
                  　﻿', '                                                  '),
  ' +', ' ', 'g'
)) ilike any(array['%50\%%']::text[]) as actual) as matches;
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM generate_series(1, 10000) s(n) WHERE trim(regexp_replace(
  translate(replace(lower(normalize(coalesce(('Пиво на US-05 ' || n::text), ''), NFKC)), 'ё', 'е'), '.,;:!?()[]{}"“”«»''`´-_/\|	
                  　﻿', '                                                  '),
  ' +', ' ', 'g'
)) ilike any(array['%us 05%', '%мед%']::text[]);
ROLLBACK;
