# Flow добавления ингредиента на `/app/ingredients`

Дата фиксации: `2026-04-04`

Этот документ описывает текущее поведение flow добавления ингредиента в склад по коду. Если документация и код расходятся, source of truth - текущая реализация в `apps/web`.

## Что именно зафиксировано

- Точки входа на странице `/app/ingredients`
- Поведение модалки `Добавить ингредиент`
- Catalog-flow через shared picker
- Custom-flow через список своих ингредиентов и создание нового
- Inline-уточнение технических параметров для catalog ingredient
- Server-side ветки submit и derived custom path
- Успех, revalidation и deep-link/open-with-selection сценарии

## Основные файлы, на которые опирается текущий flow

- `apps/web/app/(app)/app/ingredients/page.tsx`
- `apps/web/components/inventory/add-ingredient-trigger.tsx`
- `apps/web/components/inventory/add-ingredient-modal.tsx`
- `apps/web/components/inventory/catalog-ingredient-form.tsx`
- `apps/web/components/inventory/custom-ingredient-panel.tsx`
- `apps/web/components/inventory/custom-ingredient-form.tsx`
- `apps/web/components/ingredients/ingredient-picker.tsx`
- `apps/web/components/inventory/inventory-price-input.tsx`
- `apps/web/app/(app)/app/ingredients/actions.ts`
- `apps/web/app/api/ingredients/custom/route.ts`
- `apps/web/features/ingredients/catalog-service.ts`
- `apps/web/features/ingredients/presentation.ts`
- `apps/web/features/inventory/contracts.ts`
- `apps/web/features/inventory/service.ts`

## 1. Общая модель flow

Текущий flow остается единым и не распадается на параллельные реализации:

- одна модалка `Добавить ингредиент`
- один верхний выбор категории
- один segmented switch `Из каталога / Свой ингредиент`
- один shared ingredient picker для unified catalog/custom search
- один server-side submit entry для выбранного ингредиента
- один custom runtime для пользовательских и derived ingredients

Ключевая доменная семантика:

- `catalog ingredient` и `user custom ingredient` - это разные ownership/runtime сущности
- при изменении batch-specific технических параметров catalog ingredient не мутируется
- если catalog ingredient добавляется без изменений параметров, используется прямой catalog path
- если catalog ingredient добавляется с изменением color/extract/alpha, используется derived custom path

## 2. Точки входа

В текущем runtime есть три основных entry point:

1. CTA `Добавить ингредиент` в хедере страницы `/app/ingredients`
2. Та же CTA из empty state склада
3. Deep-link/open-with-selection сценарий через query-параметры `addSource` и `addId`

Deep-link обрабатывается на сервере:

- страница читает `addSource` и `addId`
- если `addSource` равен `catalog` или `custom`, вызывается `getIngredientSuggestionByRef(...)`
- если элемент найден, `AddIngredientTrigger` получает `initialSelection`
- если `initialSelection` существует, модалка открывается сразу через `openOnMount`

Если deep-link не разрешился в реальный ingredient suggestion, модалка автоматически не откроется.

## 3. Как модалка устроена сейчас

Модалка рендерится как overlay:

- затемнение на весь viewport
- mobile-first нижний sheet, прибитый к низу
- на desktop - центрированная модалка шириной до `sm:max-w-2xl`
- контейнер модалки имеет `max-h-[92vh]` и собственный `overflow-y-auto`

Внутри всегда есть:

- заголовок `Добавить ингредиент`
- кнопка `Закрыть`
- сетка категорий с иконками
- segmented switch:
  - `Из каталога`
  - `Свой ингредиент`

Список категорий:

- `Солод`
- `Сбраживаемое сырье`
- `Хмель`
- `Дрожжи`
- `Водоподготовка`
- `Расходники`

Для fermentable в UI по-прежнему есть два отдельных entry point:

- `Солод`
- `Сбраживаемое сырье`

Но внутри taxonomy это одна категория `fermentable` с разными subtype:

- `malt`
- `fermentable`

## 4. Как определяется стартовое состояние

При каждом открытии модалки состояние заново синхронизируется из входных props:

- `mode` всегда сбрасывается в `catalog`
- `result` и `pending` очищаются
- `catalogCategory` и `customCategory` получают одно и то же стартовое значение
- `catalogSubtype` и `customSubtype` тоже синхронизируются

Стартовая категория определяется так:

1. Если есть `initialSelection`, берется его `category` и, при необходимости, subtype
2. Иначе берется `initialCategory`, которую страница передает из текущего фильтра `/app/ingredients`
3. Иначе берется последняя использованная категория из `localStorage`
4. Если сохраненного значения нет, fallback - `Солод`

Это значит:

- на "чистой" странице без фильтра и без deep-link модалка теперь открывается с мягким default `Солод`
- если пользователь уже отфильтровал склад по категории, модалка наследует эту категорию
- если модалка открыта из deep-link на конкретный ингредиент, категория и subtype берутся из выбранного ингредиента
- при успешном использовании flow и при ручном переключении категории модалка запоминает last used category для следующего открытия

Выбранная категория синхронизирована между вкладками `Из каталога` и `Свой ингредиент`.

## 5. Initial state и мягкий default категории

Если страница не передала стартовую категорию и у пользователя еще нет сохраненного выбора, модалка открывается на категории `Солод`.

Пользователь видит:

- хедер модалки
- grid категорий
- segmented switch
- catalog picker

Нижние inventory block'и по-прежнему не показываются до выбора конкретного ингредиента:

- количество
- единица
- optional details
- inline overrides

Если по какой-то причине category context все же отсутствует, placeholder поведения остается прежним:

- для вкладки `Из каталога`: `Выберите категорию, и после этого появится поиск.`
- для вкладки `Свой ингредиент`: `Выберите категорию, и после этого появится список своих ингредиентов.`

## 6. Catalog-flow: добавление через shared picker

### 6.1. Когда catalog form вообще появляется

`CatalogIngredientForm` рендерится только если:

- активна вкладка `Из каталога`
- выбрана категория

Если категория не выбрана, form вообще не монтируется.

### 6.2. Первый видимый блок catalog-flow

После выбора категории пользователь видит только stage выбора ингредиента:

- label `Ингредиент`
- shared `IngredientPicker`
- inline validation/error под picker, если selection отсутствует на submit

На этом этапе еще не показываются:

- количество
- единица
- дата покупки
- срок годности
- цена
- заметки

Если пользователь просто печатает query и переключает категорию:

- модалка не должна закрываться
- draft query сохраняется
- picker refocus'ится и продолжает искать в новой категории

Если в момент смены категории ingredient уже выбран:

- selected ingredient очищается
- picker query очищается тоже

## 7. Поведение shared picker в catalog-flow

Catalog-flow использует существующий shared picker, а не отдельный inventory-only поиск.

Что делает picker сейчас:

- начинает поиск только когда введено минимум 2 символа
- ищет в рамках выбранной категории
- для `fermentable` дополнительно учитывает subtype `malt` или `fermentable`
- по умолчанию включает и catalog, и existing custom items
- рендерит suggestions прямо в потоке формы под input, без отдельного portal-overlay

Поиск поддерживает:

- unified results по catalog + custom
- refinement по производителю, если совпадений слишком много
- кнопку `Показать все результаты`, если совпадений больше, чем свернутый лимит
- клавиатурную навигацию `ArrowUp` / `ArrowDown` / `Enter` / `Escape`

Когда включается refinement mode:

- picker показывает секцию `Уточнить производителя`
- пользователь выбирает производителя
- после этого поиск сужается
- активный фильтр производителя показывается отдельным chip над input

Если результатов нет, picker показывает CTA:

- `Не нашли? Добавить свой ингредиент`

Эта кнопка не создает ингредиент сразу.
Она просто переключает модалку на вкладку `Свой ингредиент`.

## 8. Что происходит после выбора ингредиента из picker

При выборе item из picker происходит следующее:

- selected ingredient сохраняется во внутреннем state формы
- текст input синхронизируется с `primaryName` выбранного ингредиента
- локальная ошибка выбора очищается
- batch overrides пересобираются из выбранного item
- mode уточнения параметров сбрасывается в `catalog`
- required unit profile пересчитывается по выбранному ingredient
- `enteredUnit` автоматически сбрасывается на default unit нового профиля

После этого в форме появляются следующие блоки:

1. Compact context summary, например `Солод · Из каталога` или `Хмель · Свой`
2. Карточка выбранного ингредиента
3. Required block `Количество * / Ед. изм. *`
4. Optional disclosure с row `Добавить цену, дату, срок или заметку`

При этом selection chrome больше не остается primary UI:

- category grid скрывается
- segmented switch `Из каталога / Свой ингредиент` тоже скрывается
- пользователь остается в selected state, а не в стадии поиска сущности

## 9. Карточка выбранного ингредиента

В add flow используется `IngredientSelectionCard` с label `Выбрано`.

Карточка показывает:

- primary name
- secondary name, если он есть
- brand рядом с названием в верхней строке карточки
- флаг страны рядом с брендом в той же верхней строке, а не отдельным нижним chip
- ownership badge для custom items:
  - `СВОЙ` для обычного user custom ingredient
  - `ИЗМЕНЕННЫЙ` для derived custom ingredient

В add flow для выбранного ингредиента специально скрыт generic typed summary:

- карточка не дублирует шумный summary вида `1.8 Lovibond • 81% extract`
- для fermentable summary теперь везде нормализован в EBC и русское `Экстракт`

После выбора ингредиента picker больше не остается на экране одновременно с карточкой.

Вместо отдельного `×` в selected state остается одно явное действие:

- `Изменить выбор`

В обычном catalog-flow оно:

- очищает текущий выбор
- снова показывает category grid и segmented switch
- скрывает selected card
- скрывает required/optional block'и
- возвращает пользователя к стадии выбора и снова показывает picker

В режиме выбора existing custom ingredient из вкладки `Свой ингредиент` то же действие возвращает пользователя обратно к списку своих ингредиентов.

Если у ингредиента есть pack equivalent, под карточкой выводится строка вида:

- `1 pack = ...`

## 10. Inline-уточнение технических параметров

### 10.1. Когда этот блок вообще есть

Inline-уточнение показывается только для selected catalog ingredient, у которого есть релевантные технические данные:

- `fermentable` / `malt`:
  - `Цвет`
  - `Экстрактивность`
- `hop`:
  - `Альфа-кислота`

Для других категорий отдельный блок уточнения не показывается:

- `yeast`
- `water_treatment`
- `consumable`

### 10.2. Где именно это находится

Уточнение параметров встроено не отдельным нижним section, а в `details` самой карточки выбранного ингредиента.

В закрытом состоянии внутри карточки показывается компактная строка с текущими значениями ингредиента и кнопкой:

- `Уточнить параметры`

Если overrides нет, эта строка совпадает с каталогом.
Если overrides есть, в этой строке уже показаны пользовательские значения, а каталожные остаются только muted-слоем ниже.

Когда редактор открыт, эта же кнопка меняется на:

- `Готово`

### 10.3. Какие значения считаются дефолтными

Для fermentable/malt значения для карточки и editor defaults собираются из catalog technical data:

- `malt`:
  - берется `colorEbcMin` / `colorEbcMax`, если они есть
  - если EBC нет, `colorLovibond` конвертируется в EBC
  - `extractPctDryBasis` используется как дефолт по экстрактивности
- `fermentable`:
  - `colorLovibond` конвертируется в EBC
  - `extractPctDryBasis` используется как дефолт по экстрактивности

Для hop:

- сначала берется `alphaAcidPctTypical`
- если его нет, используется `alphaAcidPctMax`
- если и его нет, используется `alphaAcidPctMin`

### 10.4. Как выглядит editor

Для fermentable/malt editor показывает два поля:

- `Цвет, EBC`
- `Экстрактивность, %`

Для hop editor показывает одно поле:

- `Альфа-кислота, %`

### 10.5. Что считается override

Если пользователь меняет значение так, что оно численно отличается от catalog defaults, форма считает это technical override.

В этом состоянии:

- в правом верхнем углу карточки появляется бейдж `ИЗМЕНЕННЫЙ`
- в закрытом состоянии карточка показывает именно текущие пользовательские значения
- значения показываются не в slash-формате, а как обычные подписанные текстовые пары:
  - `Цвет 3 EBC`
  - `Экстрактивность 81%`
  - или `Альфа-кислота 6.1% AA`
- кнопка `Уточнить параметры` находится в той же визуальной группе рядом с этими значениями
- каталожные значения остаются вторым muted-слоем ниже, в формате `В каталоге: ...`
- при реальном override под карточкой появляется muted note:
  `Сохранится как ваш измененный вариант ингредиента.`
- submit label тоже меняется с обычного `Добавить в запасы` на:
  `Добавить как свой вариант`
- при открытом editor дополнительно показывается helper:
  `Каталог не изменится.`

Важно: закрытие editor кнопкой `Готово` не удаляет введенные значения. Эти значения остаются в state формы и учитываются на submit.

Текущее поведение summary внутри карточки такое:

- и в открытом, и в закрытом состоянии primary summary показывает текущие пользовательские значения
- если overrides нет, current summary совпадает с каталогом
- если overrides есть, каталожные значения показываются только как muted reference-слой

## 11. Required block: что пользователь заполняет после выбора

После выбора ингредиента появляется обязательный inventory block:

- `Количество *`
- `Ед. изм. *`

Этот блок показывается только если ingredient уже выбран.

Поведение блока:

- `enteredUnit` берется из unit profile выбранного ингредиента
- список доступных единиц ограничен `allowedUnits`
- step у quantity зависит от единицы измерения
- при смене выбранного ингредиента default unit может измениться автоматически

Unit profile по-прежнему вычисляется через existing inventory/unit logic.
Для dry yeast и других категорий с особыми unit rules отдельная логика не дублируется в UI.

## 12. Optional disclosure

Optional section в catalog-flow рендерится как tappable row:

- `Добавить цену, дату, срок или заметку`
- вторичная подпись: `Необязательно`

Поведение:

- секция свернута по умолчанию
- открывается нажатием на всю строку
- при закрытом состоянии может показывать compact summary уже заполненных данных
- если сервер вернул ошибки по optional fields, секция открывается автоматически

Внутри находятся:

- `Дата покупки`
- `Годен до`
- price block
- `Заметки`

### 12.1. Дата покупки

`Дата покупки` больше не инициализируется сегодняшней датой по умолчанию.

Текущее поведение:

- initial value пустой
- пока optional section не была открыта, optional payload вообще не отправляется
- если пользователь открыл секцию, но не выбрал дату, в UI и в payload не возникает скрытого default date
- если секция была открыта хотя бы один раз, optional fields помечаются как touched и дальше участвуют в submit

У даты покупки есть отдельная кнопка очистки `×`.

### 12.2. Price block

Price block остается прежним по архитектуре и использует существующий `InventoryPriceInput`.

Поддерживаются режимы:

- `За всё`
- `За единицу`

Дополнительные детали:

- отдельного selector валюты в этом flow нет
- используется `preferredCurrency` пользователя
- helper/preview цены и нормализация по единице по-прежнему происходят внутри existing price runtime

## 13. Submit matrix для catalog-flow

Кнопка submit:

- `Добавить в запасы`
- если есть реальный technical override:
  `Добавить как свой вариант`
- в pending: `Сохранение...`

На submit form всегда вызывает `addSelectedIngredientAction`, а дальше сервер сам выбирает нужную ветку.

### 13.1. Выбран existing custom ingredient из shared picker

Если selected item пришел из picker с `source === "custom"`:

- в payload идет `userCustomIngredientId`
- action вызывает existing `addCustomIngredientToInventory(...)`
- сообщение успеха:
  `Ингредиент добавлен в запасы.`

### 13.2. Выбран catalog ingredient без overrides

Если в payload есть `ingredientCatalogItemId`, но override-полей нет:

- action делегирует в `addCatalogIngredientAction`
- дальше вызывается existing `addCatalogIngredientToInventory(...)`

### 13.3. Выбран catalog ingredient с override-полями

Если в payload есть `ingredientCatalogItemId` и переданы `fermentableColorEbc`, `fermentableExtractYieldPct` или `hopAlphaAcidPct`:

- action вызывает `resolveCatalogInventoryAdditionSource(...)`
- service проверяет, есть ли реальное отличие от catalog technical data

Дальше две подветки:

1. Отличия фактически нет
   - source остается `catalog`
   - используется обычный `addCatalogIngredientAction`

2. Отличие есть
   - service находит или создает derived custom ingredient
   - дальше inventory add идет через existing `addCustomIngredientToInventory(...)`
   - success message становится явным:
     `Свой вариант ингредиента добавлен в запасы.`

## 14. Как работает derived custom path

Derived custom path нужен для ownership-safe override-поведения.

Что он делает:

- не мутирует исходный catalog ingredient
- создает private user custom ingredient на базе catalog item
- записывает в него измененные технические параметры
- сохраняет linkage к оригиналу через:
  - `derivedFromIngredientId`
  - `derivedFromDisplayName`

Service сначала пытается найти уже существующий matching derived ingredient у пользователя.
Если такой вариант уже создан ранее, он переиспользуется.

Если подходящего варианта нет, создается новый custom ingredient.
Для имени используются candidate names на базе исходного названия и descriptor'а параметров, например:

- базовое имя
- имя + `(X EBC / Y%)`
- при конфликте - дополнительные варианты с суффиксом

Derived ingredient потом:

- участвует в add-to-inventory как обычный custom ingredient
- в lightweight карточках и списках получает badge `ИЗМЕНЕННЫЙ`
- виден в пользовательском каталоге и на складе как отдельная user-owned сущность

## 15. Custom-flow: вкладка `Свой ингредиент`

### 15.1. Когда custom panel появляется

`CustomIngredientPanel` рендерится только если:

- активна вкладка `Свой ингредиент`
- выбрана категория

Если категория еще не выбрана, пользователь видит только placeholder, без списка и без create form.

### 15.2. Что показывается по умолчанию

После выбора категории custom-flow не открывает create form сразу.

По умолчанию показывается browser своих ингредиентов:

- search input `Поиск среди своих ингредиентов`
- sort select
- кнопка `Добавить новый`
- список существующих user custom ingredients для выбранной категории

Это работает как browser-first flow:

- сначала выбрать уже существующий свой ингредиент
- если подходящего нет, только тогда создавать новый

### 15.3. Как загружается список своих ингредиентов

Список грузится через `GET /api/ingredients/custom`.

В запрос передаются:

- `category`
- `subtype`, если это `malt` или `fermentable`
- `q`
- `sort`
- `limit=30`

API route внутри использует existing ingredient catalog service для user-owned runtime:

- `listUserCatalogIngredients(user.id, { view: "mine", ... })`

То есть это не отдельная ad-hoc DB логика на уровне страницы.

### 15.4. Что видно в custom browser

В списке карточек для каждого item показываются:

- primary name
- secondary name, если есть
- badge:
  - `СВОЙ` для обычного custom ingredient
  - `ИЗМЕНЕННЫЙ` для derived custom ingredient
- brand / country / typed summary

Над списком показывается счетчик:

- `Загрузка...`
- либо `<n> шт.`

Если список пуст:

- без запроса:
  `В этой категории пока нет своих ингредиентов.`
- с запросом:
  `Ничего не найдено в ваших ингредиентах.`

В empty state также есть кнопка `Добавить новый`.

### 15.5. Выбор существующего custom ingredient

Если пользователь выбирает карточку из custom browser:

- `selectedItem` сохраняется в panel state
- browser скрывается
- вместо него открывается `CatalogIngredientForm` в режиме `hidePicker`

Это важный reuse существующей архитектуры:

- не создается отдельная форма add-to-inventory для existing custom ingredient
- используется тот же catalog inventory form shell
- просто без верхнего picker

В этом состоянии пользователь видит:

- кнопку `К списку своих ингредиентов`
- карточку выбранного ингредиента
- required block `Количество * / Ед. изм. *`
- optional row `Добавить цену, дату, срок или заметку`

Submit в этом сценарии идет через `onSubmitExisting -> addSelectedIngredientAction`.

### 15.6. Создание нового custom ingredient

Если пользователь нажимает `Добавить новый`:

- panel переключается в mode `create`
- сверху появляется кнопка `К списку своих ингредиентов`
- рендерится existing `CustomIngredientForm`

## 16. Структура `CustomIngredientForm`

Custom form сейчас разбита на три слоя:

1. `Параметры ингредиента`
2. `Количество и единица учета`
3. optional row `Добавить цену, дату, срок или заметку`

Это не новый отдельный wizard.
Это одна форма внутри той же модалки.

### 16.1. Блок `Параметры ингредиента`

Всегда есть:

- `Название ингредиента`
- `Бренд`

Для категорий с subtype selector:

- показывается поле `Тип ферментируемого` или `Подтип`

Категориальные технические поля:

- `fermentable`
  - `Цвет, EBC`
  - `Экстрактивность, %`
- `hop`
  - `Альфа-кислота, %`
  - `Год урожая`
- `yeast`
  - `Тип дрожжей`
  - `Аттенюация, %`

Для `water_treatment` и `consumable` forced technical fields не добавляются, остается taxonomy/subtype-ориентированный create flow.

### 16.2. Что в custom-flow обязательно на сервере

Server contract для `createUserCustomIngredientSchema` требует:

- общий `displayName`
- валидную `category`
- для `fermentable`:
  - `fermentableColorEbc`
  - `fermentableExtractYieldPct`
- для `hop`:
  - `hopAlphaAcidPct`
- для `yeast`:
  - `yeastForm`
  - `yeastAttenuationPct`

`Год урожая` для hop остается необязательным.

### 16.3. Блок `Количество и единица учета`

Ниже параметров ингредиента идет отдельный required block:

- `Количество *`
- `Ед. изм. *`

Unit profile для custom create path вычисляется через existing custom ingredient/unit logic.

### 16.4. Optional disclosure

В custom-flow optional section устроена так же, как в catalog-flow:

- по умолчанию свернута
- раскрывается нажатием на всю строку
- использует ту же предметную подпись `Добавить цену, дату, срок или заметку`
- автоматически открывается при server-side errors в optional fields
- по умолчанию не подставляет `Дату покупки`, пока пользователь сам ее не выберет

Внутри:

- `Дата покупки`
- `Годен до`
- тот же `InventoryPriceInput`
- `Заметки`

### 16.5. Submit create path

Кнопка submit:

- `Создать и добавить в запасы`
- в pending: `Сохранение...`

На submit вызывается `addCustomIngredientAction`, внутри которой происходят два шага:

1. `createUserCustomIngredient(...)`
2. `addCustomIngredientToInventory(...)`

То есть новый custom ingredient сразу создается и тут же добавляется в склад.

## 17. Успех, refresh и revalidation

После успешного add/create flow поведение одинаковое:

- action возвращает `ok: true`
- modal-side helper закрывает модалку
- вызывается `router.refresh()`
- server action делает:
  - `revalidatePath("/app/ingredients")`
  - `revalidatePath("/app/catalog")`

Текущие success messages:

- catalog/custom existing add:
  `Ингредиент добавлен в запасы.`
- catalog derived variant add:
  `Свой вариант ингредиента добавлен в запасы.`
- custom create + add:
  `Собственный ингредиент создан и добавлен в запасы.`

## 18. Ошибки и автоповедение формы

### 18.1. Catalog-flow

Локальная client-side ошибка selection:

- если submit сделан без выбранного ingredient, форма показывает:
  `Выберите ингредиент из каталога.`

Server-side mapped errors включают:

- `Ингредиент из каталога не найден или недоступен.`
- `Собственный ингредиент не найден или недоступен.`
- `Единица измерения не поддерживается.`
- `Эта единица измерения не подходит для выбранного ингредиента.`
- `Не удалось создать пользовательскую версию ингредиента. Попробуйте еще раз.`

Если сервер вернул ошибки по optional fields:

- optional disclosure открывается автоматически

Если сервер вернул ошибки по override fields:

- editor уточнения параметров автоматически открывается

### 18.2. Custom-flow

Server-side validation идет через `createUserCustomIngredientSchema` и `addCustomInventoryItemSchema`.

Типовые обязательные проверки:

- `displayName` минимум 2 символа
- `enteredQuantity > 0`
- валидная `enteredUnit`
- category-aware technical requirements для `fermentable`, `hop`, `yeast`

## 19. Deep-link / preselected сценарий

Если flow открыт с `initialSelection`, staged behavior не ломается:

- категория и subtype инициализируются из selection
- модалка открывается сразу
- category grid и mode switch по умолчанию тоже скрыты, потому что selection stage уже завершен
- catalog picker по умолчанию скрыт, потому что форма стартует сразу в selected state
- карточка selected ingredient сразу показана
- required block тоже сразу доступен
- optional disclosure работает как обычно и раскрывается только по явному действию или при server-side errors

При этом `pickerValue` внутренне все равно синхронизируется с `primaryName` selection, но пользователь этого input не видит, пока не нажмет `Изменить выбор`.

Это работает и для:

- `catalog` deep-link
- `custom` deep-link

Пока selection валиден для текущего category/subtype context, form его принимает.
Если selection конфликтует с context, он игнорируется.

## 20. Что важно помнить про текущий UX

Текущее staged поведение выглядит так:

1. Сначала выбрать категорию
2. Затем найти или выбрать ингредиент
3. После выбора заполнить количество и единицу
4. При необходимости уточнить технические параметры прямо в карточке выбранного ингредиента
5. Optional details открыть только если они реально нужны

При этом flow не превращен в отдельный multi-screen wizard:

- все остается внутри одной модалки
- category и mode всегда остаются сверху и доступны для быстрого переключения
- shared picker/search foundation сохраняется
- server actions и inventory services остаются source of truth

## 21. Какие тесты сейчас подтверждают поведение

Фокусное покрытие flow и регрессий:

- `apps/web/tests/inventory-add-flow.test.ts`
- `apps/web/tests/inventory-service.test.ts`
- `apps/web/tests/ingredient-picker.test.ts`
- `apps/web/tests/inventory-usability-components.test.ts`
- `apps/web/tests/user-catalog-ingredient-search.test.ts`
- `apps/web/tests/recipe-editor-components.test.ts`

Команды, которыми подтверждалось текущее состояние:

```bash
cd apps/web
npm run typecheck
npm test -- tests/inventory-add-flow.test.ts tests/inventory-service.test.ts tests/ingredient-picker.test.ts tests/inventory-usability-components.test.ts tests/user-catalog-ingredient-search.test.ts tests/recipe-editor-components.test.ts
```
