# Articles Rollout Plan

## Goal

Встроить в NB отдельный editorial-слой для:
- BJCP style articles
- equipment reviews
- будущих обычных статей и гайдов

Ключевой принцип:
- BJCP хранить как structured content и рендерить шаблоном
- обзоры и свободные статьи писать через Tiptap JSON body

## Phase 1

Статус: реализовано в пилоте

- File-backed content loader из `ingredients/bjcp`
- отдельный публичный раздел `/bjcp`
- `/bjcp/[slug]`
- выборочные featured-материалы для главной
- SEO metadata + sitemap foundation
- modern BJCP template
- Tiptap editor lab в `/admin/articles/new`

## Phase 2

Статус: следующий шаг

- таблица `content_articles`
- `type`, `slug`, `title`, `excerpt`, `publicationState`, `publishedAt`
- `bodyJson` для freeform-статей
- `metaJson` для BJCP / reviews
- `coverImageKey` / `coverImageUrl`
- `authorId`, `reviewerId`

## Phase 3

Статус: следующий шаг

- админский CRUD через server actions
- роли:
  - `editor`: создать/редактировать черновик
  - `moderator`: publish/unpublish/review
  - `admin`: полный доступ
- список материалов в `/admin/articles`
- фильтры по типу и статусу

## Phase 4

Статус: следующий шаг

- реальные изображения пива и оборудования
- storage adapter вместо mock
- upload flow
- OG images
- canonical + robots tuning
- JSON-LD расширение под reviews

## Content Types

### BJCP style

- `bjcpId`
- `category`
- `nameRu`
- `nameEn`
- `descriptionShortRu`
- `sectionsRu`
- `sectionsEn`
- `vitalStatistics`

### Equipment review

- `summary`
- `pros`
- `cons`
- `verdict`
- `specs`
- `priceRange`
- `rating`
- `gallery`
- `bodyJson`

### Article / guide

- `bodyJson`
- `relatedLinks`
- `cta`
- `coverImage`

## Notes

- BJCP JSON уже подходит для импорта почти без ручной нормализации.
- Для BJCP не нужен rich-text editor как primary storage.
- Для обычных статей Tiptap должен стать default body editor.
