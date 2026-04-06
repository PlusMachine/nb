# Раздел `/app/ingredients` (`Склад моих ингредиентов`)

Дата фиксации: `2026-04-05`

Этот документ описывает текущее поведение раздела `/app/ingredients` по коду и связанным UI-компонентам. Он покрывает:

- состав страницы;
- реальные ссылки и переходы;
- все модалки и немодальные оверлеи;
- flow фильтрации, сортировки, поиска, добавления, редактирования, удаления, обнуления и ссылок на покупку;
- связь склада с каталогом ингредиентов.

Если документация и код расходятся, source of truth - текущая реализация в `apps/web`.

Документ повторно сверён с текущим кодом `2026-04-05` и актуализирован с учётом purchase links / user metadata flow.

Для низкоуровневого разбора add-flow есть отдельный документ: `docs/ingredients-add-flow.md`. Этот файл не заменяет его, а собирает полную карту раздела `/app/ingredients` и связывает add-flow с остальными сценариями страницы.

## Основные файлы

- `apps/web/app/(app)/app/ingredients/page.tsx`
- `apps/web/app/(app)/app/ingredients/actions.ts`
- `apps/web/app/(app)/app/ingredients/metadata-actions.ts`
- `apps/web/components/inventory/add-ingredient-trigger.tsx`
- `apps/web/components/inventory/add-ingredient-modal.tsx`
- `apps/web/components/inventory/catalog-ingredient-form.tsx`
- `apps/web/components/inventory/custom-ingredient-panel.tsx`
- `apps/web/components/inventory/custom-ingredient-form.tsx`
- `apps/web/components/inventory/inventory-purchase-links-trigger.tsx`
- `apps/web/components/inventory/inventory-toolbar.tsx`
- `apps/web/components/inventory/grouped-inventory-list.tsx`
- `apps/web/components/inventory/inventory-list-item.tsx`
- `apps/web/components/inventory/inventory-quantity-editor.tsx`
- `apps/web/components/inventory/inventory-item-details-editor.tsx`
- `apps/web/components/inventory/delete-inventory-item-button.tsx`
- `apps/web/components/ingredients/ingredient-purchase-links-field.tsx`
- `apps/web/components/ingredients/ingredient-purchase-links-manager.tsx`
- `apps/web/components/shared/confirm-action-dialog.tsx`
- `apps/web/components/inventory/inventory-empty-state.tsx`
- `apps/web/components/inventory/inventory-search-input.tsx`
- `apps/web/features/inventory/page-model.ts`
- `apps/web/features/inventory/service.ts`
- `apps/web/features/ingredients/catalog-service.ts`
- `apps/web/app/(app)/app/catalog/[source]/[id]/page.tsx`
- `apps/web/app/api/inventory/suggestions/route.ts`
- `apps/web/app/api/ingredients/custom/route.ts`

## 1. Назначение страницы

`/app/ingredients` - это пользовательский склад ингредиентов.

Страница показывает не общий каталог, а именно запасы конкретного пользователя:

- сколько ингредиента осталось;
- в каких единицах он учитывается;
- когда куплен;
- до какого срока годен;
- сколько стоил;
- какие заметки оставлены по партии;
- связан ли остаток с системным каталогом или с пользовательским ингредиентом.

По доменной модели склад хранит:

- ссылку либо на системный catalog ingredient;
- либо на user custom ingredient;
- плюс собственные batch/inventory-поля: количество, единица, цена, даты, заметки.

## 2. Что страница читает из URL

Текущий route: `/app/ingredients`

Поддерживаемые query-параметры:

- `search` - текстовый поиск по складу;
- `category` - категория (`fermentable`, `hop`, `yeast`, `water_treatment`, `consumable`);
- `subtype` - подтип для fermentables (`malt` или `fermentable`);
- `finished=true` - показать позиции с нулевым остатком;
- `sort` - сортировка (`default`, `name`, `quantity`, `updated`, `best_before`, `price`);
- `addSource` - deep-link для открытия add modal c уже выбранным ингредиентом (`catalog` или `custom`);
- `addId` - id ингредиента для `addSource`.

Есть legacy-совместимость:

- старый `type` может быть преобразован в `category`;
- старый `stock` влияет на `showFinished`.

Практически важный сценарий:

- `/app/ingredients?addSource=catalog&addId=...`
- `/app/ingredients?addSource=custom&addId=...`

Если ingredient по этим параметрам найден, add modal открывается сразу и уже содержит выбранный ingredient.

## 3. Что пользователь видит на странице

### 3.1. Хедер

Верхний блок страницы содержит:

- заголовок `Склад моих ингредиентов`;
- summary-строку вида `N в наличии · M закончились`, если на складе вообще есть позиции;
- кнопку `Добавить ингредиент`.

Кнопка `Добавить ингредиент` не ведет на отдельную страницу. Она открывает modal overlay поверх текущего route.

### 3.2. Toolbar

Под хедером всегда рендерится `InventoryToolbar`.

В нем есть:

- tile-фильтры по основным группам;
- строка поиска;
- toggle показа закончившихся;
- dropdown сортировки;
- кнопка сброса фильтров.

Основные группы в UI:

- `Солод`
- `Сбраживаемое сырье`
- `Хмель`
- `Дрожжи`
- `Водоподготовка`
- `Расходники`

Важно:

- `Солод` и `Сбраживаемое сырье` - это две разные кнопки UI;
- в домене обе относятся к `category = fermentable`;
- различаются они через `subtype = malt` и `subtype = fermentable`.

На tile-кнопках показывается count.

Поведение count:

- если `finished=false`, показываются только count позиций в наличии;
- если `finished=true`, показываются count с учетом пустых позиций;
- если count равен `0` и фильтр не активен, кнопка disabled и вместо числа пишет `Пусто`.

### 3.3. Основной контент

Ниже toolbar страница показывает либо:

- сгруппированный список ингредиентов;
- либо empty state.

Группы выводятся в фиксированном порядке:

1. `Солод`
2. `Сбраживаемое сырье`
3. `Хмель`
4. `Дрожжи`
5. `Водоподготовка`
6. `Расходники`

Внутри каждой группы позиции делятся на:

- `in stock`;
- `empty`.

Итоговый порядок внутри группы:

1. сначала все позиции с остатком `> 0`;
2. потом все позиции с остатком `<= 0`.

Это значит, что даже если общий sort уже применен, пустые позиции внутри группы все равно оказываются в хвосте своей группы.

### 3.4. Карточка ингредиента

Каждая карточка в списке показывает:

- имя ингредиента;
- второе имя, если оно есть;
- бренд и/или страну;
- технические badge'и;
- badge источника (`Свой`, `Измененный`, иногда `Архив`);
- цену покупки;
- цену за единицу;
- дату покупки;
- срок годности;
- quick trigger ссылок на покупку;
- заметки;
- inline editor количества и единицы;
- action-кнопки справа сверху.

Если для ingredient reference уже сохранены purchase links, карточка показывает control `Купить` и до трёх marketplace badge'ей.

Если ссылок ещё нет, на карточке показывается action `Добавить ссылку`.

Карточка может визуально менять состояние:

- обычная;
- semi-faded, если остаток нулевой;
- warning, если срок близок;
- danger, если срок уже просрочен.

### 3.5. Empty state

Если на складе вообще нет позиций, показывается empty state:

- заголовок `Пока нет ингредиентов`;
- пояснение про будущие запасы;
- CTA `Добавить ингредиент`.

Если позиции в принципе есть, но текущий фильтр/поиск ничего не нашел, заголовок и текст меняются в зависимости от ситуации:

- нет результата по search;
- выбрана категория и скрыты закончившиеся;
- выбрана категория и даже с закончившимися ничего нет;
- весь склад пуст только по остатку;
- включены finished и совпадений нет.

### 3.6. Error state

Если route падает в клиентском error boundary, показывается:

- заголовок `Не удалось загрузить "Мой склад"`;
- текст `Попробуйте обновить страницу. Если ошибка повторяется, вернитесь позже.`;
- кнопка `Повторить`.

## 4. Какие ссылки и переходы есть на странице

Ниже перечислены именно navigation-переходы, а также отдельно отмечено, что navigation не является.

### 4.1. Реальные ссылки на странице `/app/ingredients`

Единственная явная navigation-ссылка в карточке ингредиента:

- заголовок карточки ведет в detail page каталога:
  - для системного ингредиента: `/app/catalog/system/{sourceId}`
  - для пользовательского ингредиента: `/app/catalog/custom/{sourceId}`

Следствие:

- склад всегда дает обратный переход в каталог;
- если позиция в складе основана на derived/custom variant, пользователь уходит не в системную карточку, а в custom detail page.

### 4.2. Что на странице не является ссылкой

Не navigation, а client-side UI actions:

- `Добавить ингредиент` в хедере;
- `Добавить ингредиент` в empty state;
- category tiles;
- строка поиска;
- toggle `Показать/Скрыть закончившиеся`;
- dropdown сортировки;
- `Сбросить`;
- `Купить / Добавить ссылку`;
- `0 закончился`;
- иконка `Редактировать`;
- иконка `Удалить`.

Эти элементы либо:

- открывают modal/overlay;
- либо меняют query-параметры через `router.replace(...)`;
- либо отправляют server action.

### 4.3. Переходы, которые важны для раздела, но находятся уже вне самой страницы склада

Связанная detail page каталога `/app/catalog/[source]/[id]` содержит:

- ссылку `Добавить на склад` -> `/app/ingredients?addSource={catalog|custom}&addId={id}`;
- ссылку `Использовать в рецепте` -> `/app/recipes/new?addSource={catalog|custom}&addId={id}`;
- для системного ингредиента еще и `Создать свой вариант` -> `/app/catalog/new?derivedFrom={id}`.

Именно так каталог запускает add-flow на складе.

## 5. Какие модалки и оверлеи есть

### 5.1. Модалка `Добавить ингредиент`

Компонент: `AddIngredientModal`

Как открывается:

- по кнопке `Добавить ингредиент` в хедере;
- по кнопке из empty state;
- автоматически по deep-link `addSource/addId`.

Как выглядит:

- fullscreen затемнение;
- mobile-first bottom sheet;
- на desktop - центрированная модалка;
- внутри собственный scroll.

Что внутри:

- заголовок `Добавить ингредиент`;
- кнопка `Закрыть`;
- grid категорий;
- switch `Из каталога / Свой ингредиент`;
- дальше - catalog flow или custom flow.

Когда selection уже есть:

- grid категорий и mode switch скрываются;
- вместо этого показывается summary выбранного ингредиента и форма для сохранения.

Как закрывается:

- кнопкой `Закрыть`;
- кликом по backdrop, если pointer down и click закончились именно на backdrop;
- после успешного сохранения.

### 5.2. Модалка `Редактировать ингредиент на складе`

Компонент: `InventoryItemDetailsEditor`

Как открывается:

- по иконке карандаша в карточке.

Что внутри:

- заголовок `Редактировать ингредиент на складе`;
- кнопка `Закрыть`;
- если ingredient уже выбран, карточка выбранного ингредиента с действием `Заменить ингредиент`;
- если ingredient очищен, grid категорий и picker stage;
- блок обязательных полей;
- disclosure `Дополнительно`;
- кнопки `Сохранить` и `Отмена`.

Как закрывается:

- кнопкой `Закрыть`;
- кнопкой `Отмена`;
- кликом по backdrop;
- после успешного `Сохранить`.

### 5.3. Confirm dialog удаления

Компонент: `ConfirmActionDialog`

Как открывается:

- по иконке `Удалить` в карточке.

Что внутри:

- title `Удалить ингредиент?`;
- description `Позиция "{displayName}" будет удалена из запасов без возможности восстановления.`;
- confirm button `Удалить ингредиент`;
- cancel button `Отмена`.

Как закрывается:

- кнопкой `Отмена`;
- кликом по backdrop;
- клавишей `Escape`, если не идет pending state;
- автоматически после успешного удаления.

### 5.4. Диалог `Ссылки на покупку`

Компонент: `IngredientPurchaseLinksDialog`

Как открывается:

- по control `Купить` в карточке склада, если ссылки уже есть;
- по control `Добавить ссылку` в карточке склада, если ссылок ещё нет.

Что внутри:

- title `Ссылки на покупку`;
- верхняя метка `Покупка`;
- editor списка ссылок;
- add/edit/delete flow для URL;
- marketplace badge и host для каждой ссылки.

Как закрывается:

- кликом по backdrop;
- кнопкой закрытия;
- клавишей `Escape`.

Важно:

- это отдельный modal dialog;
- он редактирует не inventory row как таковую, а user metadata для ingredient reference (`catalog` или `custom`).

### 5.5. Немодальные оверлеи

На странице есть и overlays, которые не являются модалками:

- dropdown сортировки;
- suggestions panel у search/picker;
- manufacturer refinement chips в shared picker.

Важно не путать:

- сортировка открывается как обычный dropdown под кнопкой, а не как modal;
- поисковые подсказки и результаты picker'а рендерятся inline под input, а не в portal dialog.

## 6. Flow фильтрации и поиска

### 6.1. Flow category filter

1. Пользователь нажимает на одну из tile-кнопок категории.
2. Toolbar строит новый URL через `buildInventoryToolbarHref(...)`.
3. Параметры меняются через `router.replace(..., { scroll: false })`.
4. Страница серверно перечитывает `searchParams`.
5. `listInventoryForUser(...)` возвращает уже отфильтрованный список.
6. Список снова группируется и рендерится.

Поведение toggling:

- если нажать на уже активную обычную category-кнопку, фильтр сбрасывается на `all`;
- если нажать на уже активную subtype-кнопку `Солод` или `Сбраживаемое сырье`, subtype сбрасывается в `null`;
- если выбрать обычную category, subtype очищается;
- если выбрать `Солод` или `Сбраживаемое сырье`, category всегда становится `fermentable`.

### 6.2. Flow поиска

1. Пользователь печатает в поле `Поиск ингредиентов...`.
2. Локальный state search обновляется сразу.
3. Через debounce `250ms` toolbar обновляет URL.
4. Серверный route перечитывает `search`.
5. `listInventoryForUser(...)` фильтрует список по ILIKE по snapshot/live name полям.

Важно:

- сам page-level filter срабатывает по query-параметру и не требует минимум 2 символа;
- но suggestions у shared picker появляются только когда нормализованный query имеет длину не меньше `2`.

Поисковые подсказки на этой странице:

- идут не по общему каталогу, а по `/api/inventory/suggestions`;
- собираются из текущего склада пользователя;
- dedupe'ятся по `(sourceKind, sourceId, packageVariantId)`;
- при выборе suggestion input получает `displayName`, и URL обновляется сразу.

Если ничего не найдено:

- search input сам показывает inline empty CTA;
- а страница ниже показывает empty state `По вашему запросу ничего не найдено`.

### 6.3. Flow показа закончившихся

1. Пользователь нажимает кнопку с глазом.
2. Toolbar переключает `finished=true` в URL или убирает его.
3. На сервере `showFinished` влияет на `includeEmpty` и `stockState`.
4. По умолчанию склад показывает только `in stock`.
5. При включении finished начинают отображаться и позиции с `normalizedQuantity <= 0`.

UI-эффекты:

- label меняется между `Показать закончившиеся` и `Скрыть закончившиеся`;
- color кнопки меняется;
- counts на category tiles пересчитываются уже с учетом пустых позиций.

### 6.4. Flow сброса

1. Кнопка `Сбросить` видна только если есть активные фильтры.
2. По нажатию search очищается.
3. `category` сбрасывается в `all`.
4. `subtype` сбрасывается в `null`.
5. `finished` возвращается к default `false`.
6. `sort` возвращается к `default`.

## 7. Flow сортировки

### 7.1. Как работает UI

1. Пользователь нажимает кнопку сортировки.
2. Открывается dropdown под кнопкой.
3. Выбор нового варианта обновляет URL.
4. Dropdown закрывается.
5. Список перерисовывается с новой server-side сортировкой.

Dropdown закрывается также по клику вне него.

### 7.2. Доступные варианты сортировки

- `По умолчанию`
- `По названию`
- `По количеству`
- `По обновлению`
- `По сроку годности`
- `По цене`

### 7.3. Реальная server-side семантика сортировки

`listInventoryForUser(...)` сортирует так:

- `quantity` - по `normalizedQuantity` по убыванию;
- `updated` - по `updatedAt` по убыванию;
- `best_before` - по ближайшей `freshnessDate` вверх, `null` идут в конец;
- `price` - по `normalizedUnitCostMinorRub` по убыванию, позиции без цены уходят вниз;
- fallback - по `source.primaryLabelRu` по возрастанию.

Важно:

- текущий `default` фактически попадает в fallback-ветку;
- то есть сейчас `По умолчанию` по факту эквивалентно сортировке по названию.

### 7.4. Как сортировка сочетается с группировкой

Порядок такой:

1. сначала сервер сортирует плоский список;
2. потом клиент группирует items по inventory group;
3. внутри группы сохраняется относительный порядок от server-side sort;
4. но empty items внутри группы все равно переносятся в хвост группы.

## 8. Flow добавления ингредиента

Полный детальный разбор находится в `docs/ingredients-add-flow.md`.

Ниже - сжатая, но полная карта add-flow в контексте самой страницы.

### 8.1. Точки входа

- CTA в хедере;
- CTA в empty state;
- deep-link из каталога через `addSource/addId`.

### 8.2. Стартовое состояние add modal

При открытии modal:

- mode всегда сбрасывается в `catalog`;
- pending/result очищаются;
- category и subtype синхронизируются заново;
- selected ingredient берется либо из deep-link, либо отсутствует.

Приоритет стартовой категории:

1. `initialSelection`;
2. текущий page filter (`initialCategory` / `initialSubtype`);
3. последняя категория из `localStorage` (`nb:add-ingredient:last-category`);
4. fallback `malt`.

### 8.3. Как устроен add-flow

Внутри modal есть два верхних режима:

- `Из каталога`
- `Свой ингредиент`

Но это не две полностью независимые системы.

Фактическая модель такая:

- catalog mode использует shared `IngredientPicker`;
- этот picker по умолчанию ищет в unified source: system catalog + existing custom items;
- custom mode либо выбирает уже существующий user custom ingredient, либо создает новый.

### 8.4. Catalog mode

Когда категория выбрана и ingredient еще не выбран, пользователь видит:

- label `Ингредиент`;
- picker;
- inline suggestions.

Когда ingredient выбран, появляются:

- summary выбранного ингредиента;
- selection card;
- обязательные inventory-поля: количество и единица;
- optional disclosure с ценой, ссылками, датами и заметкой;
- иногда блок batch-specific technical overrides.

В optional disclosure catalog-flow можно заполнить:

- цену;
- ссылки на покупку;
- дату покупки;
- срок годности;
- заметку.

UI disclosure для optional полей в add-flow показывает summary состояния и позволяет оставить все эти поля пустыми до последующего редактирования.

Если выбран уже существующий ingredient reference:

- поле ссылок на покупку загружает уже сохранённые ссылки для этого reference;
- при submit add-flow может не только добавить item в inventory, но и обновить purchase links для выбранного `catalog` или `custom` ingredient.

Batch override поддерживается для:

- fermentables: цвет и экстрактивность;
- hops: alpha acid.

Если catalog ingredient добавляется без overrides:

- создается inventory row, связанный с catalog item.

Если catalog ingredient добавляется с overrides:

- каталог не мутируется;
- система определяет, можно ли использовать catalog path;
- либо создает/переиспользует derived custom ingredient;
- в склад попадает уже custom linkage;
- user получает сообщение `Свой вариант ингредиента добавлен в запасы.`

### 8.5. Custom mode

В custom mode пользователь сначала попадает в browser своих ингредиентов:

- search `Поиск среди своих ингредиентов`;
- sort `Сначала новые / По названию / По бренду`;
- button `Добавить новый`.

Дальше возможно два пути:

1. выбрать существующий custom ingredient и добавить его в inventory;
2. перейти в create form, создать новый ingredient и сразу добавить его в inventory.

Если пользователь идет в create form, он видит как минимум:

- блок `Параметры ингредиента`;
- блок `Количество и единица учета`;
- optional disclosure;
- submit `Создать и добавить в запасы`.

Поля create form зависят от category:

- всегда есть `Название ингредиента` и `Бренд`;
- для fermentable - `Цвет, EBC` и `Экстрактивность, %`;
- для hop - `Альфа-кислота, %` и `Год урожая`;
- для yeast - `Тип дрожжей` и `Аттенюация, %`;
- для category с subtype - еще и поле subtype.

Optional disclosure в create-custom flow теперь тоже включает:

- цену;
- ссылки на покупку;
- даты;
- заметку.

Так как нового custom ingredient ещё не существует, purchase links в этом сценарии сначала ведутся как draft без reference, а после успешного создания привязываются к созданному custom ingredient.

### 8.6. Что важно для UX

- при наличии selection category grid и mode switch скрываются;
- add modal запоминает последнюю использованную category;
- deep-link из каталога может открыть modal сразу на конкретном ingredient;
- успешный add закрывает modal и refresh'ит страницу;
- add-flow явно revalidate'ит и `/app/ingredients`, и `/app/catalog`.

## 9. Flow редактирования позиции склада

### 9.1. Как открывается

1. Пользователь нажимает иконку `Редактировать`.
2. Открывается `InventoryItemDetailsEditor`.
3. Форма и selection инициализируются из текущей карточки склада.

### 9.2. Что именно можно редактировать

Редактирование позволяет менять:

- сам связанный ingredient;
- category/subtype, если очистить текущий selection;
- количество;
- единицу измерения;
- дату покупки;
- срок годности;
- цену;
- заметки.

Это не только cosmetic update.

Если пользователь выбирает другой ingredient, `updateInventoryItem(...)` может:

- переключить позицию с `ingredientCatalogItemId` на `userCustomIngredientId`;
- либо наоборот;
- плюс обновить snapshot category/subtype/display name/unit metadata.

Важно:

- edit modal использует тот же shared picker-подход;
- в нем можно выбрать как системный, так и пользовательский ingredient, если он попадает в текущий search context;
- optional section edit modal теперь умеет редактировать и purchase links выбранного ingredient reference.

### 9.3. Как выглядит flow

1. Открывается modal с уже выбранным ingredient.
2. Пользователь может нажать `Заменить ингредиент`.
3. Тогда selection очищается.
4. Появляется category grid и picker stage.
5. После нового выбора показываются required fields.
6. По желанию открывается блок `Дополнительно`.
7. Нажатие `Сохранить` отправляет `updateInventoryItemAction(...)`.
8. При успехе modal закрывается, карточка обновляется.

В required fields edit modal редактируются:

- `Количество *`;
- `Ед. изм. *`.

В optional section edit modal редактируются:

- `Дата покупки`;
- `Годен до`;
- цена через `InventoryPriceInput`;
- `Ссылки на покупку`;
- `Заметки`.

При сохранении:

- inventory row обновляет batch fields;
- purchase links, если section была загружена/трогалась, заменяются для текущего выбранного reference.

### 9.4. Ограничения и важные детали

Редактирование в текущем UI требует положительное количество:

- `canSubmitInventoryForm(...)` пропускает submit только если quantity `> 0`.

Следствие:

- через edit modal нельзя штатно сохранить позицию с нулевым остатком;
- для этого предусмотрен отдельный flow `0 закончился`.

Дополнительные UX-детали:

- optional section по умолчанию закрыта;
- если сервер вернул ошибки optional полей, disclosure открывается автоматически;
- backdrop click закрывает modal и сбрасывает форму;
- если item не найден, пользователь получает `Позиция не найдена или недоступна.`

## 10. Flow inline-обновления количества

### 10.1. Что видно в карточке

В правой части карточки всегда есть inline editor:

- numeric input количества;
- select единицы;
- при необходимости подсказка эквивалента;
- dirty controls `OK` и `✕`.

### 10.2. Как работает submit

1. Пользователь меняет quantity или unit.
2. Форма становится dirty.
3. Появляются кнопки `OK` и `✕`.
4. По `Enter` или по `OK` отправляется `updateInventoryInlineAction(...)`.
5. При успехе saved state обновляется.

Клавиатурное поведение:

- `Enter` - сохранить;
- `Escape` - откатить draft к saved state.

Валидация:

- quantity должна быть finite;
- quantity должна быть `>= 0`.

Если значение невалидно:

- submit недоступен;
- под редактором выводится `Ошибка`.

## 11. Flow обнуления ингредиента

### 11.1. Основной пользовательский сценарий

Обнуление делается не через edit modal и не через delete dialog.

Основной current UI flow:

1. У позиции с количеством `> 0` показывается action `0 закончился`.
2. Кнопка доступна, только если inline editor не dirty.
3. По нажатию отправляется inline update c quantity = `0`.
4. Сервер возвращает обычный inline success response.
5. Карточка остается в складе, но становится empty item.

Важно:

- confirm dialog перед обнулением нет;
- отдельная модалка для обнуления отсутствует;
- действие не удаляет позицию, а только ставит нулевой остаток.

### 11.2. Что происходит после обнуления

После успешного обнуления:

- item не исчезает из базы склада;
- при `finished=false` пользователь чаще всего перестает видеть item, потому что по умолчанию пустые позиции скрыты;
- при `finished=true` item виден и остается в своей группе;
- внутри группы он переносится в хвост empty-позиций.

### 11.3. Технический нюанс реализации

В коде существует отдельный server action `setInventoryItemEmptyAction(...)`, который вызывает `setInventoryItemQuantityToZero(...)`.

Но в текущем клиентском UI карточки он не используется.

Реальный wired flow в интерфейсе сейчас другой:

- кнопка `0 закончился` вызывает `updateInventoryInlineAction(...)`;
- то есть обнуление реализовано как частный случай обычного inline update quantity.

## 12. Flow ссылок на покупку

### 12.1. Быстрый trigger в карточке склада

В карточке склада purchase links показываются в строке метаданных рядом с ценой и датами.

Логика trigger'а такая:

- если `purchaseLinks.count > 0`, кнопка показывает `Купить`;
- если ссылок нет, кнопка показывает `Добавить ссылку`;
- если ссылок несколько, рядом выводятся badge'и площадок, максимум `3`.

Summary для карточки приходит не из inventory row, а как `purchaseLinks` summary внутри `item.source`.

### 12.2. Что открывается по trigger'у

Trigger открывает `IngredientPurchaseLinksDialog`.

Внутри dialog пользователь может:

- увидеть текущие ссылки;
- открыть ссылку во внешнем tab/window;
- добавить новую ссылку;
- редактировать существующую;
- удалить существующую.

Площадка определяется автоматически по URL.

UI показывает:

- marketplace badge;
- label площадки;
- host ссылки.

### 12.3. Как purchase links встроены в add/edit flow

Purchase links присутствуют и в формах:

- add catalog flow;
- add existing custom flow;
- create custom flow;
- edit inventory item flow.

Во всех этих случаях links ведутся через `IngredientPurchaseLinksField`.

Важная доменная особенность:

- это metadata на уровне `UserIngredientReference`;
- они не принадлежат отдельной inventory row;
- изменение ссылок из склада отражается в detail page каталога для того же reference.

### 12.4. Что сохраняется на сервере

При add/edit из `/app/ingredients` purchase links проходят отдельным metadata path:

- UI передаёт `purchaseLinks` и `purchaseLinksTouched`;
- action нормализует URL;
- затем вызывает `replaceIngredientPurchaseLinksForReference(...)` для `catalog` или `custom` reference.

Если ссылка невалидна, пользователь получает ошибку:

- `Проверьте ссылки на покупку: одна из ссылок заполнена некорректно.`

## 13. Flow удаления

### 13.1. Пользовательский сценарий

1. Пользователь нажимает иконку `Удалить`.
2. Открывается confirm dialog.
3. После confirm вызывается `deleteInventoryItemAction(...)`.
4. Запись удаляется из `userIngredients`.
5. При успехе dialog закрывается, карточка исчезает из списка.

### 13.2. Важные свойства удаления

- это hard delete;
- undo/recovery path в UI нет;
- описание диалога прямо говорит `без возможности восстановления`.

Success message:

- `Ингредиент удален из запасов.`

## 14. Связь склада с каталогом ингредиентов

Это ключевой раздел, потому что склад и каталог в текущей архитектуре тесно связаны.

### 14.1. Связь на уровне переходов

Связь двусторонняя:

1. Из каталога можно открыть add-flow склада:
   - `Добавить на склад` -> `/app/ingredients?addSource=...&addId=...`
2. Из склада можно перейти обратно в catalog detail:
   - link в заголовке карточки -> `/app/catalog/system/...` или `/app/catalog/custom/...`

### 14.2. Связь на уровне данных

Inventory item связан с одной из двух сущностей:

- `ingredientCatalogItemId` - если это прямой системный ingredient;
- `userCustomIngredientId` - если это пользовательский ingredient или derived variant.

Это значит:

- inventory не хранит независимый каталог внутри себя;
- он хранит user-specific остатки, привязанные к catalog/custom domain.

### 14.3. Связь через unified catalog service

Каталог и склад используют общий ingredient layer:

- `getIngredientSuggestionByRef(...)` разрешает deep-link из каталога в add modal склада;
- `listUserCatalogIngredients(...)` возвращает и system catalog items, и custom items пользователя;
- custom browser в add modal читает `/api/ingredients/custom`, а тот поверх `listUserCatalogIngredients(..., { view: "mine" })`;
- shared `IngredientPicker` тоже работает поверх unified ingredient search.

Следствие:

- inventory custom flow не живет в отдельном ad-hoc хранилище;
- он использует тот же пользовательский каталог ингредиентов.

### 14.4. User metadata теперь тоже общая между складом и каталогом

Для ingredient reference теперь есть общий слой пользовательских metadata:

- `isFavorite`;
- `purchaseLinks`.

Catalog detail page читает:

- favorite state;
- полный список `purchaseLinks`.

На уровне UI это выражено так:

- в header detail page есть toggle избранного;
- ниже есть секция `Где купить` с полным editor'ом ссылок.

Inventory list page читает:

- summary purchase links для каждого `item.source`.

Следствие:

- на складе можно быстро открыть и изменить links через `Купить / Добавить ссылку`;
- в catalog detail для того же ingredient пользователь видит те же данные в секции `Где купить`;
- metadata-actions для favorite/purchase links revalidate и `/app/ingredients`, и `/app/catalog`, и detail page конкретного ingredient.

### 14.5. Usage counters в каталоге завязаны на склад

Catalog detail page показывает блок `Использование`:

- `Мой склад`
- `Мои рецепты`

Эти значения не статичны. Они считаются по реальным связям:

- `inventoryUsageCount` считается по `userIngredients`;
- `recipeUsageCount` считается по `recipeIngredients`.

Именно `applyUsageCounts(...)` в catalog service гидрирует catalog/custom items usage-count'ами.

Следствие:

- каталог знает, используется ли ingredient в складе;
- detail page может показать `Используется в остатках`.

### 14.6. Derived/custom path меняет то, как склад связан с каталогом

Если пользователь добавляет системный ingredient без overrides:

- inventory item остается привязан к системному catalog item.

Если пользователь добавляет системный ingredient с batch-specific overrides:

- catalog item не меняется;
- создается или переиспользуется derived custom ingredient;
- inventory item уже ссылается на custom ingredient;
- на карточке склада появляется badge `Измененный` или `Свой`;
- переход из склада идет уже в `/app/catalog/custom/...`.

Это очень важный момент:

- склад связан с каталогом не только напрямую;
- он может быть связан через пользовательский производный слой.

### 14.7. Что склад не делает

Склад не является отдельной копией каталога:

- он не хранит полноценную независимую карточку ингредиента вместо каталога;
- он не редактирует системный каталог при batch-override;
- он не открывает отдельную inventory detail page;
- роль detail/view layer остается у каталога.

## 15. Практический summary по пользовательским flow

### 15.1. Сортировка

- работает через query params и server-side sort;
- визуально меняет порядок внутри групп;
- пустые позиции все равно остаются в хвосте группы.

### 15.2. Добавление

- стартует из modal;
- поддерживает catalog path, existing custom path и create-custom path;
- может сохранить системный ingredient как derived custom variant;
- подробно разобрано в `docs/ingredients-add-flow.md`.

### 15.3. Редактирование

- открывает отдельную modal;
- может заменить сам ingredient, а не только batch details;
- не предназначено для выставления нулевого остатка.

### 15.4. Обнуление

- отдельной модалки нет;
- это inline action `0 закончился`;
- позиция остается на складе, просто становится empty.

### 15.5. Удаление

- идет через confirm dialog;
- удаляет запись без восстановления.

### 15.6. Ссылки на покупку

- на карточке склада это отдельный metadata-trigger;
- links общие для ingredient reference и видны также в каталоге;
- add/edit flow на складе умеют их менять.

## 16. Короткий список того, что стоит помнить при дальнейших изменениях UI

- На странице склада почти все действия делаются без перехода на новый route: через modal, dropdown или `router.replace`.
- Единственный регулярный navigation path со страницы - ссылка из имени карточки в catalog detail.
- `default` sort сейчас по факту эквивалентен sort by name.
- Обнуление и удаление - это разные сценарии: zero сохраняет карточку, delete удаляет строку.
- Edit modal умеет менять source linkage inventory item.
- Purchase links редактируются не на inventory row, а на ingredient reference metadata.
- Склад и каталог используют общий ingredient domain, а не два несвязанных набора данных.
