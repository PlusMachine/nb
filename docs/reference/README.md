# Reference — технические справочники NB

Глубокие технические описания подсистем. Обзорный контекст и инварианты — в корневом [`CONTEXT.md`](../../CONTEXT.md); краткая памятка для агентов — [`CLAUDE.md`](../../CLAUDE.md).

Правило: при расхождении документа и кода **код важнее**. У каждого файла в шапке указаны источники истины (файлы кода) и дата обновления.

## Документы

| Документ | О чём |
|----------|-------|
| [recipes-editor.md](recipes-editor.md) | Редактор рецептов (recipe-designer): архитектура, фичи, data model, OG/FG/IBU/color, import/export, batches, фото |
| [water.md](water.md) | Водоподготовка: flow, профили source/target, salt/acid solver, mash pH, формулы, ограничения |
| [equipment.md](equipment.md) | Профили оборудования: поля, defaults, volume plan; что НЕ влияет на OG/FG/IBU |
| [recipes-public-page.md](recipes-public-page.md) | Публичная страница `/recipes`: URL-контракт, фильтры, серверный путь, рейтинги/сохранения, карта компонентов |
| [inventory.md](inventory.md) | Инвентарь (Мой склад): data model, сервис, страница `/app/ingredients`, цены/валюты, consume, normalization |
| [ingredient-add-and-search.md](ingredient-add-and-search.md) | Add-flow ингредиента и поиск в picker: ranking, normalization, per-category правила, quick-start |
| [ingredient-seed-schema.md](ingredient-seed-schema.md) | Структура seed-данных каталога и критичные несовместимости полей |
| [feedback.md](feedback.md) | Обратная связь: как пользователь отправляет, точки входа, анти-спам, очередь модерации (продуктовое описание) |

## Прочее в `docs/`

- [`../improvement-recommendations.md`](../improvement-recommendations.md) — аудит P1–P3 (2026-06-23)
- [`../articles-rollout-plan.md`](../articles-rollout-plan.md) — roadmap editorial/article CMS
- [`../deploy-checklist.md`](../deploy-checklist.md) — чеклист перед продакшен-деплоем (капча, 152-ФЗ, SMS/e-mail, секреты)
