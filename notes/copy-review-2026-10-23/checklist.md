# Проверка русских текстов NB — 23 октября 2026

Всего 320 предложений: 209 по интерфейсу и 111 по описаниям для этикеток. Правки в приложение не внесены.

В каждом пункте отметьте один вариант: одобрить, отклонить или свой текст. Пустой пункт означает, что решение ещё не принято.

Проверка выполнена по исходникам текущей рабочей копии: названия, кнопки, подсказки, ошибки, пустые состояния, диалоги, подписи для программ чтения с экрана, системные описания. Автоматически собраны 8651 строковых фрагментов из 922 исходных файлов. Предложения сверены с контекстом компонентов. Все состояния приложения в браузере не проверялись. Сам интерактивный чек-лист проверен в Chromium на ширине 1000 и 390 пикселей. Это редакторская оценка; по стилю текста нельзя достоверно установить, использовался ли ИИ.

Авторские рецепты и статьи в базе данных не редактировались. Полные тексты справочника BJCP и юридические документы не проходили отдельную содержательную экспертизу. Технические формулы, числовые нормативы, названия брендов и профессиональные сокращения не заменяются автоматически. Раздел реальных приборов в production доступен только администраторам.

Системные описания этикеток предлагается заменить только в значениях по умолчанию; это не разрешение перезаписывать описания, сохранённые пользователями.


## Главная и навигация — 17

### R001. Главная: обещание бесплатного доступа

**Сейчас:** Весь функционал бесплатен

**Предлагаю:** Все возможности бесплатны

**Почему:** «Функционал» — профессиональный жаргон; здесь достаточно обычного слова.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/home/home-experience.tsx:49](</home/dopefish/projects/nb/apps/web/components/home/home-experience.tsx:49>).

### R002. Главная: описание сайта для поисковой выдачи

**Сейчас:** Весь функционал NB бесплатен: склад ингредиентов, рецепты сообщества, мастер рецептов, история партий, этикетки, каталог ингредиентов на русском и калькуляторы пивовара.

**Предлагаю:** NB — бесплатный помощник домашнего пивовара: склад ингредиентов, рецепты, журнал партий, этикетки и калькуляторы. Каталог ингредиентов — на русском.

**Почему:** Перегруженное перечисление и «весь функционал». Сохраняется конкретный перечень возможностей.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(public)/page.tsx:21](</home/dopefish/projects/nb/apps/web/app/(public)/page.tsx:21>).

### R003. Подвал сайта

**Сейчас:** Платформа для домашних пивоваров: каталог ингредиентов, склад, рецепты и BJCP в одном месте.

**Предлагаю:** Рецепты, склад ингредиентов и расчёты для домашнего пивоварения.

**Почему:** «Платформа … в одном месте» — шаблонная рекламная формулировка.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/shared/site-footer.tsx:20](</home/dopefish/projects/nb/apps/web/components/shared/site-footer.tsx:20>).

### R004. Подвал сайта: подпись NB

**Сейчас:** NB — платформа для домашних пивоваров

**Предлагаю:** NB — помощник домашнего пивовара

**Почему:** Более предметное описание вместо общего слова «платформа».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/shared/site-footer.tsx:63](</home/dopefish/projects/nb/apps/web/components/shared/site-footer.tsx:63>).

### R005. Главная: редактор рецептов

**Сейчас:** Мастер рецептов

**Предлагаю:** Редактор рецептов

**Почему:** Это редактор с разделами, а слово «мастер» обещает пошаговую процедуру. В других экранах уже используется «редактор».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/home/home-experience.tsx:80](</home/dopefish/projects/nb/apps/web/components/home/home-experience.tsx:80>).

### R006. Главная: кнопка редактора

**Сейчас:** Открыть мастер

**Предлагаю:** Открыть редактор

**Почему:** Согласовать с названием «Редактор рецептов».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/home/home-experience.tsx:101](</home/dopefish/projects/nb/apps/web/components/home/home-experience.tsx:101>).

### R007. Главная: подпись примера рецепта

**Сейчас:** Рецепт в мастере

**Предлагаю:** Пример рецепта

**Почему:** «Рецепт в мастере» звучит как служебное пояснение к макету.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/home/home-experience.tsx:81](</home/dopefish/projects/nb/apps/web/components/home/home-experience.tsx:81>).

### R008. Главная: переключатели редактора

**Сейчас:** Возможности мастера

**Предлагаю:** Разделы редактора

**Почему:** Вкладки показывают разделы рецепта, а не перечень возможностей.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/home/home-experience.tsx:85](</home/dopefish/projects/nb/apps/web/components/home/home-experience.tsx:85>).

### R009. Главная: ссылка настройки воды

**Сейчас:** Настроить воду в мастере ↗

**Предлагаю:** Настроить воду в редакторе ↗

**Почему:** Согласовать название с редактором рецептов.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/home/home-experience.tsx:163](</home/dopefish/projects/nb/apps/web/components/home/home-experience.tsx:163>).

### R010. Демо: заголовок

**Сейчас:** Мастерская пивовара — изнутри

**Предлагаю:** Попробуйте NB без регистрации

**Почему:** «Мастерская пивовара — изнутри» — рекламная метафора; в приложении мастерская также означает витрину изготовителя.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(public)/demo/page.tsx:119](</home/dopefish/projects/nb/apps/web/app/(public)/demo/page.tsx:119>).

### R011. Демо: описание для поисковой выдачи

**Сейчас:** Мастерская пивовара изнутри: рецепты, склад, варочный день с автоматикой BrewForge и брожение — на реалистичных примерах, без регистрации.

**Предлагаю:** Попробуйте рецепты, склад, помощник варки, управление BrewForge и журнал брожения на примерах. Регистрация не нужна.

**Почему:** Убирается метафора «мастерская изнутри», остаётся содержание демо.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(public)/demo/page.tsx:46](</home/dopefish/projects/nb/apps/web/app/(public)/demo/page.tsx:46>).

### R012. Демо: управление контроллером

**Сейчас:** Или на автомате: BrewForge

**Предлагаю:** Варка с BrewForge

**Почему:** «Или на автомате» двусмысленно и выбивается из названий соседних разделов.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(public)/demo/page.tsx:169](</home/dopefish/projects/nb/apps/web/app/(public)/demo/page.tsx:169>).

### R013. Демо: доступные разделы

**Сейчас:** Уже открыто без входа

**Предлагаю:** Доступно без регистрации

**Почему:** «Уже открыто без входа» — неестественная конструкция для названия раздела.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(public)/demo/page.tsx:204](</home/dopefish/projects/nb/apps/web/app/(public)/demo/page.tsx:204>).

### R014. BrewForge: главный заголовок

**Сейчас:** Автоматика варочного дня

**Предлагаю:** Автоматика для пивоварни

**Почему:** «Автоматика варочного дня» звучит как буквальная калька с brew day automation.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(public)/brewforge/page.tsx:62](</home/dopefish/projects/nb/apps/web/app/(public)/brewforge/page.tsx:62>).

### R015. BrewForge: возможности

**Сейчас:** Затирание по профилю

**Предлагаю:** Затирание по рецепту

**Почему:** «Профиль» здесь обозначает заданные в рецепте паузы; прямое название понятнее.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(public)/brewforge/page.tsx:39](</home/dopefish/projects/nb/apps/web/app/(public)/brewforge/page.tsx:39>).

### R016. Обзор и подбор рецептов по запасам

**Сейчас:** Рецепты под ваш склад

**Предлагаю:** Рецепты из ваших запасов

**Почему:** «Рецепты под ваш склад» звучит как внутренняя формулировка разработчика.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(app)/app/page.tsx:664](</home/dopefish/projects/nb/apps/web/app/(app)/app/page.tsx:664>).
Источник: [apps/web/components/recipes/brewable-recipes-section.tsx:129](</home/dopefish/projects/nb/apps/web/components/recipes/brewable-recipes-section.tsx:129>).

### R017. Обзор: пустой список покупок

**Сейчас:** Считается по запланированным партиям: чего не хватает — попадёт сюда.

**Предлагаю:** Здесь появятся ингредиенты, которых не хватает для запланированных партий.

**Почему:** Убраны безличное «считается» и повтор «чего не хватает».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(app)/app/page.tsx:386](</home/dopefish/projects/nb/apps/web/app/(app)/app/page.tsx:386>).

## Каталог и склад — 25

### R018. Каталог: описание для вошедшего пользователя

**Сейчас:** Общий каталог и ваши ингредиенты — в одном разделе.

**Предлагаю:** Ингредиенты из общего каталога и добавленные вами.

**Почему:** Убрана универсальная рекламная концовка «в одном разделе».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(public)/catalog/content.tsx:182](</home/dopefish/projects/nb/apps/web/app/(public)/catalog/content.tsx:182>).

### R019. Каталог: пустой список своих ингредиентов

**Сейчас:** У вас пока нет пользовательских ингредиентов

**Предлагаю:** Вы ещё не добавили свои ингредиенты

**Почему:** «Пользовательские ингредиенты» — название сущности в программе.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(public)/catalog/content.tsx:210](</home/dopefish/projects/nb/apps/web/app/(public)/catalog/content.tsx:210>).
Источник: [apps/web/app/(public)/catalog/content.tsx:445](</home/dopefish/projects/nb/apps/web/app/(public)/catalog/content.tsx:445>).

### R020. Каталог: поиск без результатов

**Сейчас:** По текущим условиям ничего не найдено

**Предлагаю:** Ничего не найдено

**Почему:** «По текущим условиям» звучит канцелярски и ничего не уточняет.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(public)/catalog/content.tsx:210](</home/dopefish/projects/nb/apps/web/app/(public)/catalog/content.tsx:210>).
Источник: [apps/web/app/(public)/catalog/content.tsx:445](</home/dopefish/projects/nb/apps/web/app/(public)/catalog/content.tsx:445>).

### R021. Каталог: подсказка после поиска

**Сейчас:** Попробуйте изменить запрос, фильтр категории или сортировку.

**Предлагаю:** Попробуйте другое название или измените фильтры.

**Почему:** Сортировка не меняет число найденных ингредиентов, поэтому совет её менять здесь не помогает.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(public)/catalog/content.tsx:215](</home/dopefish/projects/nb/apps/web/app/(public)/catalog/content.tsx:215>).
Источник: [apps/web/app/(public)/catalog/content.tsx:450](</home/dopefish/projects/nb/apps/web/app/(public)/catalog/content.tsx:450>).

### R022. Каталог: карточка ингредиента

**Сейчас:** Без ключевых параметров

**Предлагаю:** Параметры не указаны

**Почему:** «Без ключевых параметров» звучит как оценка качества внутренней карточки.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/ingredients/catalog-items-list.tsx:372](</home/dopefish/projects/nb/apps/web/components/ingredients/catalog-items-list.tsx:372>).

### R023. Склад: ошибка в уведомлении

**Сейчас:** Карточка ингредиента обновлёна.

**Предлагаю:** Карточка ингредиента обновлена.

**Почему:** В краткой форме женского рода пишется «обновлена», без ё.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(app)/app/ingredients/actions.ts:425](</home/dopefish/projects/nb/apps/web/app/(app)/app/ingredients/actions.ts:425>).

### R024. Склад: подсказка к экстрактивности

**Сейчас:** Экстракт не указан

**Предлагаю:** Экстрактивность не указана

**Почему:** Экстракт — вещество; поле содержит значение экстрактивности.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/inventory/catalog-ingredient-form.tsx:523](</home/dopefish/projects/nb/apps/web/components/inventory/catalog-ingredient-form.tsx:523>).
Источник: [apps/web/components/inventory/catalog-ingredient-form.tsx:525](</home/dopefish/projects/nb/apps/web/components/inventory/catalog-ingredient-form.tsx:525>).

### R025. Каталог: краткая подпись параметра солода

**Сейчас:** Экстракт

**Предлагаю:** Экстрактивность

**Почему:** Подписывает величину, а не вещество.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/ingredients/catalog-items-list.tsx:109](</home/dopefish/projects/nb/apps/web/components/ingredients/catalog-items-list.tsx:109>).

### R026. Склад: добавление своего ингредиента

**Сейчас:** Количество и единица учёта

**Предлагаю:** Количество и единица измерения

**Почему:** «Единица учёта» — язык учётной системы; рядом используются единицы измерения.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/inventory/custom-ingredient-form.tsx:856](</home/dopefish/projects/nb/apps/web/components/inventory/custom-ingredient-form.tsx:856>).

### R027. Склад: стоимость ингредиента

**Сейчас:** Режим цены

**Предлагаю:** Как указана цена

**Почему:** «Режим цены» звучит как буквальный перевод price mode. Это выбор между ценой за единицу и общей стоимостью.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/inventory/inventory-price-input.tsx:171](</home/dopefish/projects/nb/apps/web/components/inventory/inventory-price-input.tsx:171>).

### R028. Склад: общая стоимость

**Сейчас:** За всё

**Предлагаю:** За всё количество

**Почему:** «За всё» без контекста выглядит обрывком; здесь важно отличить общую стоимость от цены за единицу.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/inventory/inventory-price-input.tsx:181](</home/dopefish/projects/nb/apps/web/components/inventory/inventory-price-input.tsx:181>).

### R029. Склад: пояснение к стоимости

**Сейчас:** Цена относится ко всему количеству в карточке.

**Предлагаю:** Стоимость всего указанного количества.

**Почему:** «Цена относится ко всему количеству в карточке» — тяжёлая служебная конструкция.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/inventory/inventory-price-input.tsx:160](</home/dopefish/projects/nb/apps/web/components/inventory/inventory-price-input.tsx:160>).

### R030. Склад: пометка своего значения альфа-кислотности

**Сейчас:** % (пользовательская)

**Предлагаю:** % (ваше значение)

**Почему:** «Пользовательская» описывает тип данных и плохо сочетается с процентным значением.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/inventory/inventory-list-item.tsx:125](</home/dopefish/projects/nb/apps/web/components/inventory/inventory-list-item.tsx:125>).

### R031. Каталог и склад: пометки изменённых параметров

**Сейчас:** (пользовательская)

**Предлагаю:** (ваше значение)

**Почему:** Вместо технического «пользовательская» — объяснение, откуда взялось значение.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/ingredients/derived-ingredient-presentation.ts:101](</home/dopefish/projects/nb/apps/web/features/ingredients/derived-ingredient-presentation.ts:101>).
Источник: [apps/web/features/ingredients/derived-ingredient-presentation.ts:109](</home/dopefish/projects/nb/apps/web/features/ingredients/derived-ingredient-presentation.ts:109>).
Источник: [apps/web/features/ingredients/derived-ingredient-presentation.ts:117](</home/dopefish/projects/nb/apps/web/features/ingredients/derived-ingredient-presentation.ts:117>).

### R032. Склад: сортировка

**Сейчас:** По обновлению

**Предлагаю:** По дате изменения

**Почему:** «По обновлению» не называет признак сортировки.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/inventory/page-model.ts:67](</home/dopefish/projects/nb/apps/web/features/inventory/page-model.ts:67>).

### R033. Каталог: сортировка

**Сейчас:** По обновлению

**Предлагаю:** По дате изменения

**Почему:** Согласовать с понятным названием сортировки на складе.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/ingredients/ingredient-catalog-toolbar.tsx:63](</home/dopefish/projects/nb/apps/web/components/ingredients/ingredient-catalog-toolbar.tsx:63>).

### R034. Каталог: предложение ингредиента

**Сейчас:** Предложение отправлено в очередь модерации.

**Предлагаю:** Ингредиент отправлен на проверку.

**Почему:** «В очередь модерации» описывает внутреннюю обработку заявки.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/ingredients/ingredient-picker.tsx:2226](</home/dopefish/projects/nb/apps/web/components/ingredients/ingredient-picker.tsx:2226>).

### R035. Каталог: ссылка на добавление собственного ингредиента

**Сейчас:** Не нашли? Предложить / создать свой ингредиент

**Предлагаю:** Не нашли ингредиент? Предложите его в каталог или создайте свой.

**Почему:** Два инфинитива через косую черту выглядят как черновая подпись.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/ingredients/moderation-queue.tsx:134](</home/dopefish/projects/nb/apps/web/components/ingredients/moderation-queue.tsx:134>).

### R036. Водоподготовка: группа ингредиентов

**Сейчас:** База воды

**Предлагаю:** Исходная вода

**Почему:** «База воды» — неестественное название категории, похожее на кальку.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/ingredients/picker-quick-start.ts:275](</home/dopefish/projects/nb/apps/web/features/ingredients/picker-quick-start.ts:275>).

### R037. Каталог: категория средств

**Сейчас:** Санитайзеры

**Предлагаю:** Дезинфицирующие средства

**Почему:** «Санитайзеры» — прямое заимствование; русское название точнее объясняет назначение.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/ingredients/consumables.ts:312](</home/dopefish/projects/nb/apps/web/features/ingredients/consumables.ts:312>).

### R038. Каталог: этап использования

**Сейчас:** Санитация

**Предлагаю:** Дезинфекция

**Почему:** Для обработки оборудования привычнее и понятнее «дезинфекция», чем калька «санитация».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/ingredients/consumables.ts:410](</home/dopefish/projects/nb/apps/web/features/ingredients/consumables.ts:410>).

### R039. Каталог: описание средств

**Сейчас:** No-rinse, йодофор и CIP-санитайзеры

**Предлагаю:** Средства без смывания, йодофоры и средства для дезинфекции без разборки оборудования (CIP)

**Почему:** Смешаны английское No-rinse и транслитерация. Сокращение CIP сохраняется с расшифровкой.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/ingredients/consumables.ts:328](</home/dopefish/projects/nb/apps/web/features/ingredients/consumables.ts:328>).

### R040. Каталог: описание тары

**Сейчас:** Тара, крышки, пробки и расходка для розлива

**Предлагаю:** Тара, крышки, пробки и расходные материалы для розлива

**Почему:** «Расходка» — разговорный профессиональный жаргон, выбивающийся из соседних описаний.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/ingredients/consumables.ts:330](</home/dopefish/projects/nb/apps/web/features/ingredients/consumables.ts:330>).

### R041. Каталог: описание газов

**Сейчас:** CO2 и газовая расходка

**Предлагаю:** CO₂ и расходные материалы для газового оборудования

**Почему:** «Газовая расходка» звучит небрежно и мало что объясняет.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/ingredients/consumables.ts:331](</home/dopefish/projects/nb/apps/web/features/ingredients/consumables.ts:331>).

### R042. Каталог: создание своего ингредиента

**Сейчас:** Специи, травы, осветлители, санитайзеры, тара

**Предлагаю:** Специи, травы, осветлители, дезинфицирующие средства и тара

**Почему:** Согласовать замену «санитайзеров» с названием категории.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/ingredients/custom-catalog-ingredient-form.tsx:154](</home/dopefish/projects/nb/apps/web/components/ingredients/custom-catalog-ingredient-form.tsx:154>).

## Покупки — 5

### R043. Скопированный список покупок

**Сейчас:** Своё

**Предлагаю:** Добавлено вручную

**Почему:** В интерфейсе группа уже переименована, а в копируемом тексте осталось неясное «Своё».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/shopping/copy-text.ts:11](</home/dopefish/projects/nb/apps/web/features/shopping/copy-text.ts:11>).

### R044. Покупки: проверка полей

**Сейчас:** Количество и единица указываются вместе.

**Предлагаю:** Укажите и количество, и единицу измерения.

**Почему:** Вместо формального описания правила — понятное действие.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/shopping/manual-item-form.tsx:72](</home/dopefish/projects/nb/apps/web/components/shopping/manual-item-form.tsx:72>).
Источник: [apps/web/components/shopping/manual-item-row.tsx:108](</home/dopefish/projects/nb/apps/web/components/shopping/manual-item-row.tsx:108>).
Источник: [apps/web/features/shopping/contracts.ts:231](</home/dopefish/projects/nb/apps/web/features/shopping/contracts.ts:231>).

### R045. Покупки: подсказка планирования

**Сейчас:** Запланируйте варку — соберём точный список

**Предлагаю:** Запланируйте варку, чтобы составить список покупок

**Почему:** «Соберём точный список» — рекламное обещание вместо объяснения действия.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/shopping/shopping-list-view.tsx:361](</home/dopefish/projects/nb/apps/web/components/shopping/shopping-list-view.tsx:361>).

### R046. Покупки: повторный перенос на склад

**Сейчас:** Нечего переносить — отметки устарели, обновите список.

**Предлагаю:** Список покупок изменился. Обновите его и снова выберите, что перенести на склад.

**Почему:** «Нечего переносить — отметки устарели» не объясняет, что нужно сделать.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/shopping/actions.ts:204](</home/dopefish/projects/nb/apps/web/features/shopping/actions.ts:204>).

### R047. Покупки: частичный перенос

**Сейчас:** — отметки устарели.

**Предлагаю:** — список покупок изменился. Обновите его и проверьте выбранные позиции.

**Почему:** «Отметки устарели» — служебная формулировка. Сохраняется перечисление неперенесённых позиций перед сообщением.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/shopping/transfer-dialog.tsx:223](</home/dopefish/projects/nb/apps/web/components/shopping/transfer-dialog.tsx:223>).

## Рецепты — 37

### R048. Мои рецепты: фильтр доступа

**Сейчас:** Приватные

**Предлагаю:** Только мне

**Почему:** «Приватные» — калька; в редакторе уже используется «Только мне».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/my-recipes-gallery.tsx:272](</home/dopefish/projects/nb/apps/web/components/recipes/my-recipes-gallery.tsx:272>).

### R049. Мои рецепты: фильтр публикации

**Сейчас:** Публичные

**Предлагаю:** Опубликованные

**Почему:** Называет фактический статус рецепта и совпадает с редактором.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/my-recipes-gallery.tsx:273](</home/dopefish/projects/nb/apps/web/components/recipes/my-recipes-gallery.tsx:273>).

### R050. Карточка своего рецепта: ссылка

**Сейчас:** Публичная страница

**Предлагаю:** Посмотреть публикацию

**Почему:** «Публичная страница» — техническое название; действие совпадает с уже используемым в редакторе.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/owner-recipe-card.tsx:301](</home/dopefish/projects/nb/apps/web/components/recipes/owner-recipe-card.tsx:301>).
Источник: [apps/web/components/recipes/owner-recipe-card.tsx:379](</home/dopefish/projects/nb/apps/web/components/recipes/owner-recipe-card.tsx:379>).

### R051. Общие статусы рецепта

**Сейчас:** Приватный

**Предлагаю:** Только мне

**Почему:** Убрать «Приватный» из общего словаря статусов, чтобы он не возвращался в отдельных формах.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/recipes/contracts.ts:63](</home/dopefish/projects/nb/apps/web/features/recipes/contracts.ts:63>).

### R052. Общие статусы рецепта

**Сейчас:** Публичный

**Предлагаю:** Опубликован

**Почему:** Согласовать общий словарь с редактором.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/recipes/contracts.ts:64](</home/dopefish/projects/nb/apps/web/features/recipes/contracts.ts:64>).

### R053. Рецепты сообщества: пустой список

**Сейчас:** Публичных рецептов пока нет

**Предлагаю:** Пока нет опубликованных рецептов

**Почему:** «Публичные рецепты» — буквальное описание уровня доступа вместо привычного статуса публикации.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipes-empty-state.tsx:35](</home/dopefish/projects/nb/apps/web/components/recipes/recipes-empty-state.tsx:35>).

### R054. Рецепты сообщества: ошибка загрузки

**Сейчас:** Не удалось загрузить публичный рецепт

**Предлагаю:** Не удалось загрузить рецепт

**Почему:** Слово «публичный» пользователю в этом сообщении не нужно.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(public)/recipes/[slug]/error.tsx:10](</home/dopefish/projects/nb/apps/web/app/(public)/recipes/[slug]/error.tsx:10>).
Источник: [apps/web/app/(public)/recipes/id/[id]/error.tsx:10](</home/dopefish/projects/nb/apps/web/app/(public)/recipes/id/[id]/error.tsx:10>).

### R055. Рецепты сообщества: ошибка списка

**Сейчас:** Не удалось загрузить публичные рецепты

**Предлагаю:** Не удалось загрузить рецепты сообщества

**Почему:** Название раздела понятнее технического «публичные рецепты».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(public)/recipes/error.tsx:10](</home/dopefish/projects/nb/apps/web/app/(public)/recipes/error.tsx:10>).

### R056. Редактор: подпись описания

**Сейчас:** публично

**Предлагаю:** видно всем

**Почему:** «Публично» менее ясно объясняет, кто увидит текст.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-designer/recipe-designer.tsx:1878](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/recipe-designer.tsx:1878>).

### R057. Редактор: подсказка к описанию

**Сейчас:** Публичное описание рецепта — что это за пиво, вдохновение, особенности…

**Предлагаю:** Расскажите, какое пиво получится и что учесть при варке.

**Почему:** «Что это за пиво, вдохновение, особенности…» — шаблонный набор тем с неестественным словом «вдохновение» в перечислении.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-designer/recipe-designer.tsx:1886](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/recipe-designer.tsx:1886>).

### R058. Редактор: подпись личных заметок

**Сейчас:** приватно

**Предлагаю:** только вам

**Почему:** Согласовать с уровнем доступа и убрать кальку «приватно».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-designer/recipe-designer.tsx:1899](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/recipe-designer.tsx:1899>).

### R059. Редактор: подтверждение публикации

**Сейчас:** После публикации он станет доступен по публичной ссылке.

**Предлагаю:** Рецепт станет доступен всем по ссылке.

**Почему:** Убирается техническое сочетание «публичная ссылка» без изменения смысла.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-designer/recipe-designer.tsx:1918](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/recipe-designer.tsx:1918>).

### R060. Редактор: скрытие публикации

**Сейчас:** После этого публичная страница перестанет быть доступна.

**Предлагаю:** Рецепт больше не будет доступен другим пользователям по ссылке.

**Почему:** Объясняет последствия действия обычными словами.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-designer/recipe-designer.tsx:1934](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/recipe-designer.tsx:1934>).

### R061. Рецепты: ошибка в уведомлении

**Сейчас:** Фото удалёно.

**Предлагаю:** Фото удалено.

**Почему:** В форме среднего рода пишется «удалено», без ё.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(app)/app/recipes/actions.ts:788](</home/dopefish/projects/nb/apps/web/app/(app)/app/recipes/actions.ts:788>).

### R062. Рецепты: ошибка в уведомлении

**Сейчас:** Обложка обновлёна.

**Предлагаю:** Обложка обновлена.

**Почему:** В форме женского рода пишется «обновлена», без ё.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(app)/app/recipes/actions.ts:817](</home/dopefish/projects/nb/apps/web/app/(app)/app/recipes/actions.ts:817>).

### R063. Показатели рецепта

**Сейчас:** Ключевые показатели

**Предлагаю:** Параметры рецепта

**Почему:** «Ключевые показатели» — универсальный заголовок аналитической панели.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-stats-summary.tsx:170](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-stats-summary.tsx:170>).

### R064. Сравнение числовых показателей со стилем

**Сейчас:** В стиле

**Предлагаю:** В диапазоне стиля

**Почему:** Проверяются числовые диапазоны, а «В стиле» обещает соответствие рецепта стилю в целом.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/owner-recipe-card.tsx:99](</home/dopefish/projects/nb/apps/web/components/recipes/owner-recipe-card.tsx:99>).
Источник: [apps/web/components/recipes/recipe-designer/helpers.ts:1924](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/helpers.ts:1924>).
Источник: [apps/web/components/recipes/recipe-designer/recipe-style-stats-block.tsx:117](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/recipe-style-stats-block.tsx:117>).
Источник: [apps/web/components/recipes/recipe-stats-summary.tsx:190](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-stats-summary.tsx:190>).

### R065. Редактор: сравнение со стилем

**Сейчас:** Попадание в стиль

**Предлагаю:** Сравнение со стилем

**Почему:** «Попадание в стиль» звучит механически и сильнее фактического сравнения показателей.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-designer/recipe-style-stats-block.tsx:112](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/recipe-style-stats-block.tsx:112>).

### R066. Подготовка варки

**Сейчас:** Цели варки:

**Предлагаю:** Расчётные параметры:

**Почему:** «Цели варки» похоже на перевод brew targets; здесь показаны рассчитанные значения.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/brew-preparation-summary.tsx:10](</home/dopefish/projects/nb/apps/web/components/recipes/brew-preparation-summary.tsx:10>).

### R067. Выбор объёма: учёт эффективности

**Сейчас:** Засыпь — под вашу эффективность

**Предлагаю:** Засыпь пересчитана с учётом вашей эффективности

**Почему:** Обрывок «Засыпь — под вашу эффективность» требует достраивать действие.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/brew-volume-choice.tsx:206](</home/dopefish/projects/nb/apps/web/components/recipes/brew-volume-choice.tsx:206>).

### R068. Редактор: новый ингредиент

**Сейчас:** Новая соль для воды

**Предлагаю:** Добавить соль в воду

**Почему:** «Новая соль для воды» звучит как создание нового вещества.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-designer/ingredient-editor.tsx:369](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/ingredient-editor.tsx:369>).

### R069. Редактор: окно ингредиента

**Сейчас:** Редактор позиции

**Предлагаю:** Редактировать ингредиент

**Почему:** «Редактор позиции» — служебное имя компонента.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-designer/ingredient-editor.tsx:369](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/ingredient-editor.tsx:369>).

### R070. Редактор: окно нового ингредиента

**Сейчас:** Новая позиция

**Предлагаю:** Добавить ингредиент

**Почему:** «Новая позиция» не называет предмет действия.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-designer/ingredient-editor.tsx:369](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/ingredient-editor.tsx:369>).

### R071. Редактор: пустой раздел дрожжей

**Сейчас:** Добавьте дрожжи для публикации рецепта.

**Предлагаю:** Укажите дрожжи, которые используются в рецепте. Это нужно для публикации.

**Почему:** Исходная фраза предлагает добавлять дрожжи «для публикации», а не описывать состав пива.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-designer/recipe-designer.tsx:870](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/recipe-designer.tsx:870>).

### R072. Редактор: сохранение ингредиента

**Сейчас:** Сохранить позицию

**Предлагаю:** Сохранить ингредиент

**Почему:** Предметное название вместо абстрактной «позиции».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-designer/recipe-designer.tsx:944](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/recipe-designer.tsx:944>).

### R073. Редактор: добавление ингредиента

**Сейчас:** Добавить позицию

**Предлагаю:** Добавить ингредиент

**Почему:** Согласовать с остальными действиями добавления.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-designer/recipe-designer.tsx:944](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/recipe-designer.tsx:944>).

### R074. Редактор: параметры основной ферментации

**Сейчас:** Осн. температура, °C

**Предлагаю:** Температура основного брожения, °C

**Почему:** Сокращение «Осн.» мешает понять название поля с первого взгляда.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-designer/recipe-profiles.tsx:135](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/recipe-profiles.tsx:135>).

### R075. Редактор: параметры основного брожения

**Сейчас:** Осн. длительность, дн

**Предлагаю:** Длительность основного брожения, дни

**Почему:** Раскрыть обрывочные сокращения.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-designer/recipe-profiles.tsx:152](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/recipe-profiles.tsx:152>).

### R076. Импорт: повреждённый BeerXML

**Сейчас:** BeerXML повреждён или не содержит корректных блоков RECIPE.

**Предлагаю:** Не удалось найти рецепты в файле BeerXML. Проверьте файл или экспортируйте его заново.

**Почему:** «Корректные блоки RECIPE» — подробность структуры файла вместо помощи пользователю.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(app)/app/recipes/actions.ts:188](</home/dopefish/projects/nb/apps/web/app/(app)/app/recipes/actions.ts:188>).
Источник: [apps/web/components/recipes/import-export-modal.tsx:166](</home/dopefish/projects/nb/apps/web/components/recipes/import-export-modal.tsx:166>).

### R077. Импорт: формат Brewfather

**Сейчас:** Brewfather JSON не распознан: проверьте, что выбран экспорт рецепта из Brewfather.

**Предлагаю:** Не удалось прочитать рецепт Brewfather. Загрузите JSON-файл, экспортированный из Brewfather.

**Почему:** «Brewfather JSON не распознан» звучит как сообщение парсера.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(app)/app/recipes/actions.ts:192](</home/dopefish/projects/nb/apps/web/app/(app)/app/recipes/actions.ts:192>).
Источник: [apps/web/components/recipes/import-export-modal.tsx:170](</home/dopefish/projects/nb/apps/web/components/recipes/import-export-modal.tsx:170>).

### R078. Водоподготовка: поиск профиля

**Сейчас:** IPA, lager, blanche, стаут...

**Предлагаю:** IPA, лагер, бланш, стаут…

**Почему:** Беспричинное смешение латиницы и кириллицы в примерах стилей.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/water-setup-wizard.tsx:2509](</home/dopefish/projects/nb/apps/web/components/recipes/water-setup-wizard.tsx:2509>).
Источник: [apps/web/components/recipes/water-setup-wizard.tsx:2510](</home/dopefish/projects/nb/apps/web/components/recipes/water-setup-wizard.tsx:2510>).

### R079. Водоподготовка: кнопка сброса

**Сейчас:** Сбросить воду

**Предлагаю:** Сбросить настройки воды

**Почему:** «Сбросить воду» обычно означает слить воду, а здесь очищаются настройки.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/recipe-designer/recipe-designer.tsx:1790](</home/dopefish/projects/nb/apps/web/components/recipes/recipe-designer/recipe-designer.tsx:1790>).
Источник: [apps/web/components/recipes/water-setup-wizard.tsx:2188](</home/dopefish/projects/nb/apps/web/components/recipes/water-setup-wizard.tsx:2188>).

### R080. Водоподготовка: ввод состава

**Сейчас:** Ионы вручную

**Предлагаю:** Ввести состав вручную

**Почему:** «Ионы вручную» — неестественная подпись действия.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/water-setup-wizard.tsx:2458](</home/dopefish/projects/nb/apps/web/components/recipes/water-setup-wizard.tsx:2458>).

### R081. Рецепт: ошибка списка запасов

**Сейчас:** Не удалось загрузить складские позиции для рецепта.

**Предлагаю:** Не удалось загрузить ингредиенты со склада.

**Почему:** «Складские позиции для рецепта» — язык внутренних объектов.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/stock-ingredient-list.tsx:83](</home/dopefish/projects/nb/apps/web/components/recipes/stock-ingredient-list.tsx:83>).

### R082. Описание рецепта: внесения хмеля

**Сейчас:** Внесений на кипячении нет.

**Предлагаю:** Во время кипячения ингредиенты не добавляются.

**Почему:** «Внесений на кипячении нет» — неестественное управление и отглагольная конструкция.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/public-recipe-process-section.tsx:226](</home/dopefish/projects/nb/apps/web/components/recipes/public-recipe-process-section.tsx:226>).

### R083. Импорт: инструкция BeerXML

**Сейчас:** Поддерживается один рецепт или коллекция RECIPES: до 100 рецептов, до 8 МБ.

**Предлагаю:** Можно загрузить один рецепт или несколько рецептов в одном файле: до 100 рецептов и до 8 МБ.

**Почему:** «Коллекция RECIPES» описывает устройство файла вместо доступного действия.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/import-export-modal.tsx:525](</home/dopefish/projects/nb/apps/web/components/recipes/import-export-modal.tsx:525>).

### R084. Импорт Brewfather: инструкция

**Сейчас:** В Brewfather экспортируйте рецепт в JSON или используйте резервную копию из Settings → Data → Export. Поддерживаются один рецепт, массив и раздел recipes резервной копии. Переносится до 100 рецептов за раз, размер файла — до 8 МБ. Склад и история варок не импортируются. Исходный JSON рецепта сохраняется для владельца.

**Предлагаю:** В Brewfather экспортируйте рецепт в JSON или скачайте резервную копию: Settings → Data → Export. Можно загрузить один или несколько рецептов, в том числе из резервной копии: до 100 рецептов и до 8 МБ. Склад и история варок не переносятся. Исходный файл рецепта сохранится и будет доступен только вам.

**Почему:** Убирает технические «массив» и «раздел recipes», сохраняя форматы, ограничения и путь в чужом интерфейсе.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/import-export-modal.tsx:525](</home/dopefish/projects/nb/apps/web/components/recipes/import-export-modal.tsx:525>).

## Калькуляторы — 29

### R085. Раздел калькуляторов: описание

**Сейчас:** Автономные пивоваренные расчёты для варки, брожения и розлива.

**Предлагаю:** Расчёты для варки, брожения и розлива.

**Почему:** «Автономные пивоваренные расчёты» звучит неестественно и может восприниматься как обещание работы без интернета.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(public)/calculators/page.tsx:12](</home/dopefish/projects/nb/apps/web/app/(public)/calculators/page.tsx:12>).
Источник: [apps/web/app/(public)/calculators/page.tsx:24](</home/dopefish/projects/nb/apps/web/app/(public)/calculators/page.tsx:24>).

### R086. Калькуляторы: ошибка ввода

**Сейчас:** Проверьте входные значения.

**Предлагаю:** Проверьте введённые значения.

**Почему:** «Входные значения» — техническая калька с input values.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/calculators/calculator-page-client.tsx:1138](</home/dopefish/projects/nb/apps/web/components/calculators/calculator-page-client.tsx:1138>).
Источник: [apps/web/components/calculators/calculator-page-client.tsx:1352](</home/dopefish/projects/nb/apps/web/components/calculators/calculator-page-client.tsx:1352>).
Источник: [apps/web/components/calculators/calculator-page-client.tsx:1537](</home/dopefish/projects/nb/apps/web/components/calculators/calculator-page-client.tsx:1537>).
Источник: [apps/web/components/calculators/calculator-page-client.tsx:1808](</home/dopefish/projects/nb/apps/web/components/calculators/calculator-page-client.tsx:1808>).
Источник: [apps/web/components/calculators/calculator-page-client.tsx:2101](</home/dopefish/projects/nb/apps/web/components/calculators/calculator-page-client.tsx:2101>).

### R087. Крепость и рефрактометр: пояснение к сбраживанию

**Сейчас:** Выше 80% — сухой профиль (лагеры, сэзоны, дикие дрожжи).

**Предлагаю:** Выше 80% — пиво обычно получается сухим; такое сбраживание встречается у лагеров, сэзонов и пива на диких дрожжах.

**Почему:** «Сухой профиль» — неполная калька; речь о характере пива. Технический смысл исходной подсказки сохранён.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/calculators/calculator-page-client.tsx:1160](</home/dopefish/projects/nb/apps/web/components/calculators/calculator-page-client.tsx:1160>).
Источник: [apps/web/components/calculators/calculator-page-client.tsx:1361](</home/dopefish/projects/nb/apps/web/components/calculators/calculator-page-client.tsx:1361>).

### R088. Рефрактометр: результат

**Сейчас:** Оценка ABV

**Предлагаю:** Расчётная крепость

**Почему:** Русская подпись понятнее «оценки ABV». Сокращение остаётся у формул, где оно нужно.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/calculators/calculator-page-client.tsx:1183](</home/dopefish/projects/nb/apps/web/components/calculators/calculator-page-client.tsx:1183>).
Источник: [apps/web/features/calculators/definitions.ts:1556](</home/dopefish/projects/nb/apps/web/features/calculators/definitions.ts:1556>).

### R089. Рефрактометр: калибровка

**Сейчас:** Калибровка коэффициента

**Предлагаю:** Настроить поправочный коэффициент

**Почему:** Калибруют прибор, а коэффициент определяют или настраивают.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/calculators/calculator-page-client.tsx:1111](</home/dopefish/projects/nb/apps/web/components/calculators/calculator-page-client.tsx:1111>).

### R090. Рефрактометр: единицы начальной плотности

**Сейчас:** Шкала OG

**Предлагаю:** Шкала начальной плотности

**Почему:** Смешанная подпись «Шкала OG» требует переводить сокращение в уме.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/calculators/calculator-page-client.tsx:1085](</home/dopefish/projects/nb/apps/web/components/calculators/calculator-page-client.tsx:1085>).
Источник: [apps/web/components/calculators/calculator-page-client.tsx:1088](</home/dopefish/projects/nb/apps/web/components/calculators/calculator-page-client.tsx:1088>).

### R091. Рефрактометр: коэффициент

**Сейчас:** Коэффициент = показание рефрактометра ÷ Brix по ареометру

**Предлагаю:** Коэффициент = показание рефрактометра ÷ показание ареометра в °Bx

**Почему:** «Brix по ареометру» звучит как техническая пометка; обозначение шкалы сохраняется.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/calculators/calculator-page-client.tsx:968](</home/dopefish/projects/nb/apps/web/components/calculators/calculator-page-client.tsx:968>).

### R092. Справка о крепости

**Сейчас:** ABV, ABW, степень сбраживания и калорийность по OG и FG.

**Предлагаю:** Крепость, степень сбраживания и калорийность по начальной и конечной плотности.

**Почему:** Короткое описание почти целиком состоит из аббревиатур.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/catalog.ts:105](</home/dopefish/projects/nb/apps/web/features/calculators/catalog.ts:105>).

### R093. Справка об ареометре

**Сейчас:** Температурная поправка SG/Plato относительно калибровки прибора.

**Предлагаю:** Поправка плотности с учётом температуры пробы и калибровки ареометра.

**Почему:** «Поправка SG/Plato относительно калибровки» звучит как перевод технической спецификации.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/catalog.ts:151](</home/dopefish/projects/nb/apps/web/features/calculators/catalog.ts:151>).

### R094. Инфузионное затирание: краткое описание

**Сейчас:** Температура заторной воды на старте, долив на следующую паузу (кипятком или холодной водой) и лестница ступенчатого затора целиком.

**Предлагаю:** Температура воды в начале затирания и объёмы долива для перехода между паузами.

**Почему:** «Лестница ступенчатого затора целиком» громоздко описывает обычную последовательность пауз.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/catalog.ts:243](</home/dopefish/projects/nb/apps/web/features/calculators/catalog.ts:243>).

### R095. Инфузионное затирание: описание

**Сейчас:** Считает температуру заторной воды по гидромодулю и целевой температуре, долив на следующую ступень — кипятком вверх или холодной водой вниз — и лестницу пауз ступенчатого затора по тепловому балансу зерна и воды.

**Предлагаю:** Рассчитывает температуру воды в начале затирания и объём долива для следующей паузы. Можно рассчитать одну паузу или всю последовательность с учётом теплового баланса зерна и воды.

**Почему:** Убраны «кипятком вверх», «водой вниз» и нагромождение ступеней и лестниц.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/catalog.ts:244](</home/dopefish/projects/nb/apps/web/features/calculators/catalog.ts:244>).

### R096. Инфузионное затирание: подсказка

**Сейчас:** Перед засыпью — какой температуры взять воду на старт; дальше — сколько долить на следующую паузу (кипятка, а перегрели — холодной воды) или сразу вся лестница пауз ступенчатого затора.

**Предлагаю:** Перед засыпью рассчитайте температуру воды. Затем определите, сколько горячей или холодной воды долить для следующей паузы.

**Почему:** Исходная фраза несколько раз меняет конструкцию и заканчивается обрывком.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/catalog.ts:245](</home/dopefish/projects/nb/apps/web/features/calculators/catalog.ts:245>).

### R097. Цвет пива: действие после расчёта

**Сейчас:** Сопоставьте цвет и IBU для баланса рецепта.

**Предлагаю:** Сравните рассчитанный цвет с диапазоном выбранного стиля.

**Почему:** Совет «сопоставьте цвет и IBU для баланса» не объясняет, что делать; замена связана с задачей калькулятора.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/catalog.ts:422](</home/dopefish/projects/nb/apps/web/features/calculators/catalog.ts:422>).

### R098. Свежесть хмеля: краткое описание

**Сейчас:** Оценка текущей альфа-кислоты, коэффициента свежести и новой навески.

**Предлагаю:** Оценка остаточного содержания альфа-кислот и массы хмеля для той же горечи.

**Почему:** «Текущая альфа-кислота» — неточное название величины; «новая навеска» не поясняет цель пересчёта.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/catalog.ts:453](</home/dopefish/projects/nb/apps/web/features/calculators/catalog.ts:453>).

### R099. Свежесть хмеля: пояснение

**Сейчас:** Помогает не завысить расчёт IBU старым или вскрытым хмелем.

**Предлагаю:** Помогает учесть потерю альфа-кислот при хранении хмеля в расчёте горечи.

**Почему:** «Завысить расчёт … хмелем» — неестественная связка слов.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/catalog.ts:455](</home/dopefish/projects/nb/apps/web/features/calculators/catalog.ts:455>).

### R100. Свежесть хмеля: действие после расчёта

**Сейчас:** Передайте расчётный AA% в IBU.

**Предлагаю:** Используйте рассчитанное содержание альфа-кислот в калькуляторе горечи.

**Почему:** «Передайте AA% в IBU» — язык обмена данными между программами.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/catalog.ts:467](</home/dopefish/projects/nb/apps/web/features/calculators/catalog.ts:467>).

### R101. Свежесть хмеля: предупреждение

**Сейчас:** Хмель на пределе модели — расчёту не стоит доверять.

**Предлагаю:** Условия хранения выходят за пределы этой модели. Результат расчёта ненадёжен.

**Почему:** «Хмель на пределе модели» приписывает ингредиенту свойство расчётной модели.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/definitions.ts:285](</home/dopefish/projects/nb/apps/web/features/calculators/definitions.ts:285>).

### R102. Дрожжи: статус расчёта

**Сейчас:** Перебор

**Предлагаю:** Избыток

**Почему:** «Перебор» разговорно и не согласуется с соседними статусами.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/definitions.ts:470](</home/dopefish/projects/nb/apps/web/features/calculators/definitions.ts:470>).

### R103. Дрожжи: подпись статуса

**Сейчас:** Статус внесения

**Предлагаю:** Количество дрожжей

**Почему:** «Статус внесения» можно понять как отметку о том, внесены ли уже дрожжи.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/definitions.ts:2323](</home/dopefish/projects/nb/apps/web/features/calculators/definitions.ts:2323>).

### R104. Дрожжи: результат без стартера

**Сейчас:** Без стартера по расчёту

**Предлагаю:** Стартер не нужен по расчёту

**Почему:** «Без стартера по расчёту» — обрывочная фраза.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/definitions.ts:2305](</home/dopefish/projects/nb/apps/web/features/calculators/definitions.ts:2305>).

### R105. Карбонизация сахаром: результат

**Сейчас:** Крепость сиропа

**Предлагаю:** Концентрация сиропа

**Почему:** «Крепость» в пивоваренном приложении прежде всего означает содержание алкоголя. Здесь показана масса сахара на объём.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/definitions.ts:1937](</home/dopefish/projects/nb/apps/web/features/calculators/definitions.ts:1937>).

### R106. Карбонизация суслом: результат

**Сейчас:** Финальный объём

**Предлагаю:** Итоговый объём

**Почему:** «Финальный» — необязательная калька; в остальных расчётах используется «итоговый».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/definitions.ts:3239](</home/dopefish/projects/nb/apps/web/features/calculators/definitions.ts:3239>).

### R107. Карбонизация суслом: результат

**Сейчас:** Изменение ABV

**Предлагаю:** Изменение крепости

**Почему:** Согласовать с русскими подписями остальных результатов.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/definitions.ts:3241](</home/dopefish/projects/nb/apps/web/features/calculators/definitions.ts:3241>).

### R108. Вода на варку: тип оборудования

**Сейчас:** Система All-in-one

**Предлагаю:** Автоматическая пивоварня (all-in-one)

**Почему:** Русская подпись объясняет назначение варианта; распространённое обозначение оставлено в скобках.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/definitions.ts:2424](</home/dopefish/projects/nb/apps/web/features/calculators/definitions.ts:2424>).

### R109. Затирание: результат расчёта

**Сейчас:** Затёрли — переключитесь на «Ступенчатый затор», объём воды и температура затора перенесутся.

**Предлагаю:** Начали затирание? Переключитесь на «Ступенчатый затор»: объём воды и температура сохранятся.

**Почему:** «Затёрли» можно принять за завершение процесса; здесь речь о переходе к следующему расчёту.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/definitions.ts:2690](</home/dopefish/projects/nb/apps/web/features/calculators/definitions.ts:2690>).

### R110. Затирание: результат охлаждения

**Сейчас:** Долить холодной

**Предлагаю:** Долить холодной воды

**Почему:** В подписи потеряно существительное.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/definitions.ts:2698](</home/dopefish/projects/nb/apps/web/features/calculators/definitions.ts:2698>).

### R111. Свежесть хмеля: кнопка

**Сейчас:** Использовать новый AA% в IBU

**Предлагаю:** Использовать в расчёте горечи

**Почему:** «Использовать новый AA% в IBU» — смешение русских слов и сокращений вместо понятного действия.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/definitions.ts:3311](</home/dopefish/projects/nb/apps/web/features/calculators/definitions.ts:3311>).

### R112. Свежесть хмеля: исходная величина

**Сейчас:** Исходный AA

**Предлагаю:** Исходное содержание альфа-кислот, %

**Почему:** AA без расшифровки оставляет пользователю только английское сокращение.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/definitions.ts:3261](</home/dopefish/projects/nb/apps/web/features/calculators/definitions.ts:3261>).

### R113. Свежесть хмеля: результат

**Сейчас:** Текущий AA

**Предлагаю:** Остаточное содержание альфа-кислот, %

**Почему:** Называет рассчитанную величину, а не «текущий AA».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/calculators/definitions.ts:3303](</home/dopefish/projects/nb/apps/web/features/calculators/definitions.ts:3303>).

## Варка и брожение — 25

### R114. Журнал партии: уведомление о конечной плотности

**Сейчас:** Финальный замер (FG) добавлен.

**Предлагаю:** Замер конечной плотности (КП) добавлен.

**Почему:** «Финальный замер» — буквальный перевод; в пивоварении измеряют конечную плотность.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(app)/app/brew-batches/[id]/actions.ts:117](</home/dopefish/projects/nb/apps/web/app/(app)/app/brew-batches/[id]/actions.ts:117>).

### R115. Журнал партии: отметка замера

**Сейчас:** Замер отмечен как финальный (FG).

**Предлагаю:** Замер отмечен как конечная плотность (КП).

**Почему:** Убирает смешение русской подписи и FG.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(app)/app/brew-batches/[id]/actions.ts:161](</home/dopefish/projects/nb/apps/web/app/(app)/app/brew-batches/[id]/actions.ts:161>).

### R116. Журнал партии: уведомление

**Сейчас:** Отметка FG снята.

**Предлагаю:** Отметка конечной плотности снята.

**Почему:** Без расшифровки FG сообщение трудно понять новичку.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(app)/app/brew-batches/[id]/actions.ts:161](</home/dopefish/projects/nb/apps/web/app/(app)/app/brew-batches/[id]/actions.ts:161>).

### R117. Журнал партии: флажок

**Сейчас:** Это финальный замер (FG)

**Предлагаю:** Это замер конечной плотности (КП)

**Почему:** Называет измеряемый параметр, а не абстрактный «финальный замер».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-batches/components/brew-journal.tsx:279](</home/dopefish/projects/nb/apps/web/features/brew-batches/components/brew-journal.tsx:279>).

### R118. Журнал партии: действие

**Сейчас:** Отметить финальным (FG)

**Предлагаю:** Отметить как конечную плотность

**Почему:** Согласовать с названием параметра.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-batches/components/brew-journal.tsx:309](</home/dopefish/projects/nb/apps/web/features/brew-batches/components/brew-journal.tsx:309>).
Источник: [apps/web/features/brew-batches/components/brew-journal.tsx:310](</home/dopefish/projects/nb/apps/web/features/brew-batches/components/brew-journal.tsx:310>).

### R119. Журнал партии: действие

**Сейчас:** Снять отметку FG

**Предлагаю:** Снять отметку конечной плотности

**Почему:** Согласовать с названием параметра.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-batches/components/brew-journal.tsx:309](</home/dopefish/projects/nb/apps/web/features/brew-batches/components/brew-journal.tsx:309>).
Источник: [apps/web/features/brew-batches/components/brew-journal.tsx:310](</home/dopefish/projects/nb/apps/web/features/brew-batches/components/brew-journal.tsx:310>).

### R120. Журнал партии: пустое состояние

**Сейчас:** Пока нет замеров. Внесите начальную плотность (OG), затем финальную (FG) — посчитаем ABV и сбраживание.

**Предлагаю:** Замеров пока нет. Запишите начальную и конечную плотность, чтобы рассчитать крепость и степень сбраживания.

**Почему:** В короткой инструкции три английских сокращения, которые можно заменить понятными словами.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-batches/components/brew-journal.tsx:287](</home/dopefish/projects/nb/apps/web/features/brew-batches/components/brew-journal.tsx:287>).

### R121. Журнал партии: дата замера

**Сейчас:** Когда (по умолч. — сейчас)

**Предлагаю:** Дата и время замера

**Почему:** «Когда (по умолч. — сейчас)» — черновая подпись. Текущее время уже можно показать значением поля.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-batches/components/brew-journal.tsx:242](</home/dopefish/projects/nb/apps/web/features/brew-batches/components/brew-journal.tsx:242>).

### R122. Помощник варки: завершённые шаги

**Сейчас:** Варочный день пройден

**Предлагаю:** Варка завершена

**Почему:** День не «проходят» как уровень; здесь завершены шаги варки.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-batches/components/brew-day-board.tsx:88](</home/dopefish/projects/nb/apps/web/features/brew-batches/components/brew-day-board.tsx:88>).

### R123. Помощник варки: отмена отметки

**Сейчас:** Вернуть шаг

**Предлагаю:** Отметить невыполненным

**Почему:** «Вернуть шаг» не объясняет, что меняется его отметка выполнения.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-batches/components/brew-day-board.tsx:110](</home/dopefish/projects/nb/apps/web/features/brew-batches/components/brew-day-board.tsx:110>).
Источник: [apps/web/features/brew-batches/components/brew-day-board.tsx:188](</home/dopefish/projects/nb/apps/web/features/brew-batches/components/brew-day-board.tsx:188>).
Источник: [apps/web/features/brew-batches/components/brew-day-board.tsx:191](</home/dopefish/projects/nb/apps/web/features/brew-batches/components/brew-day-board.tsx:191>).

### R124. Партия: итог

**Сейчас:** Итог партии

**Предлагаю:** Итоги партии

**Почему:** В значении сводки результатов естественнее множественное число.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-batches/components/brew-completion-summary.tsx:71](</home/dopefish/projects/nb/apps/web/features/brew-batches/components/brew-completion-summary.tsx:71>).

### R125. Брожение: показания

**Сейчас:** Телеметрии с прибора пока нет.

**Предлагаю:** Показаний с прибора пока нет.

**Почему:** «Телеметрия» уместна в технических настройках, но для обычного журнала избыточна.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-batches/components/fermenter-panel.tsx:73](</home/dopefish/projects/nb/apps/web/features/brew-batches/components/fermenter-panel.tsx:73>).

### R126. Брожение: расчёт крепости

**Сейчас:** ABV, оценка

**Предлагаю:** Расчётная крепость

**Почему:** Русская подпись вместо «ABV, оценка».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/components/batch-ferment-block.tsx:123](</home/dopefish/projects/nb/apps/web/features/device-streams/components/batch-ferment-block.tsx:123>).

### R127. График брожения: пустой период

**Сейчас:** Нет точек в выбранном периоде.

**Предлагаю:** За выбранный период нет показаний.

**Почему:** «Точки» описывают представление данных на графике, а пользователь ищет показания.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/components/ferment-chart.tsx:419](</home/dopefish/projects/nb/apps/web/features/device-streams/components/ferment-chart.tsx:419>).

### R128. Брожение: подпись диапазона

**Сейчас:** Температурный коридор

**Предлагаю:** Допустимый диапазон температуры

**Почему:** «Температурный коридор» — менее естественное название ограничения.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/components/session-temp-corridor-control.tsx:141](</home/dopefish/projects/nb/apps/web/features/device-streams/components/session-temp-corridor-control.tsx:141>).

### R129. Брожение: подсказка диапазона

**Сейчас:** Уведомим, если температура выйдет за коридор дольше получаса. Оставьте поля пустыми, чтобы снять коридор.

**Предлагаю:** Уведомим, если температура будет вне заданного диапазона дольше получаса. Чтобы убрать ограничение, очистите оба поля.

**Почему:** «Выйдет за коридор» и «снять коридор» звучат не по-русски.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/components/session-temp-corridor-control.tsx:176](</home/dopefish/projects/nb/apps/web/features/device-streams/components/session-temp-corridor-control.tsx:176>).

### R130. Брожение: подпись ограничения

**Сейчас:** Коридор:

**Предлагаю:** Диапазон:

**Почему:** Согласовать термин с названием поля.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/components/session-temp-corridor-control.tsx:50](</home/dopefish/projects/nb/apps/web/features/device-streams/components/session-temp-corridor-control.tsx:50>).

### R131. Брожение: диапазон не задан

**Сейчас:** Коридор не задан

**Предлагаю:** Диапазон не задан

**Почему:** Согласовать термин с названием поля.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/components/session-temp-corridor-control.tsx:51](</home/dopefish/projects/nb/apps/web/features/device-streams/components/session-temp-corridor-control.tsx:51>).

### R132. Брожение: диапазон сохранён

**Сейчас:** Коридор обновлён

**Предлагаю:** Диапазон обновлён

**Почему:** Согласовать термин с названием поля.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/components/session-temp-corridor-control.tsx:69](</home/dopefish/projects/nb/apps/web/features/device-streams/components/session-temp-corridor-control.tsx:69>).

### R133. Брожение: диапазон удалён

**Сейчас:** Коридор снят

**Предлагаю:** Ограничение температуры снято

**Почему:** Вместо неестественного «Коридор снят».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/components/session-temp-corridor-control.tsx:69](</home/dopefish/projects/nb/apps/web/features/device-streams/components/session-temp-corridor-control.tsx:69>).

### R134. Брожение: проверка диапазона

**Сейчас:** Заполните обе границы коридора (или обе очистите).

**Предлагаю:** Заполните обе границы диапазона или очистите оба поля.

**Почему:** Согласовать термин и прямо назвать поля.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/actions.ts:218](</home/dopefish/projects/nb/apps/web/features/device-streams/actions.ts:218>).
Источник: [apps/web/features/device-streams/components/session-temp-corridor-control.tsx:87](</home/dopefish/projects/nb/apps/web/features/device-streams/components/session-temp-corridor-control.tsx:87>).

### R135. Брожение: проверка границ

**Сейчас:** Нижняя граница коридора должна быть меньше верхней.

**Предлагаю:** Минимальная температура должна быть ниже максимальной.

**Почему:** Объясняет ошибку без внутреннего названия ограничения.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/actions.ts:219](</home/dopefish/projects/nb/apps/web/features/device-streams/actions.ts:219>).
Источник: [apps/web/features/device-streams/components/session-temp-corridor-control.tsx:98](</home/dopefish/projects/nb/apps/web/features/device-streams/components/session-temp-corridor-control.tsx:98>).

### R136. Уведомление о температуре

**Сейчас:** Температура вне коридора:

**Предлагаю:** Температура вне заданного диапазона:

**Почему:** Согласовать термин с настройкой.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/alerts.ts:209](</home/dopefish/projects/nb/apps/web/features/device-streams/alerts.ts:209>).

### R137. Текст уведомления о температуре

**Сейчас:** °C вне коридора

**Предлагаю:** °C вне заданного диапазона

**Почему:** Согласовать термин с настройкой; числовые значения сохраняются.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/alerts.ts:210](</home/dopefish/projects/nb/apps/web/features/device-streams/alerts.ts:210>).

### R138. Обзор: напоминание о плотности

**Сейчас:** без замера — проверьте FG

**Предлагаю:** без замера — проверьте конечную плотность

**Почему:** Убрать нерасшифрованное FG из пользовательского напоминания.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-batches/dashboard.ts:77](</home/dopefish/projects/nb/apps/web/features/brew-batches/dashboard.ts:77>).

## Приборы и уведомления — 26

### R139. BrewForge: режим устройства

**Сейчас:** Ферментация

**Предлагаю:** Брожение

**Почему:** В остальных разделах этот процесс называется «Брожение»; «Ферментация» создаёт ненужное второе название.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-controller/device-mode.ts:20](</home/dopefish/projects/nb/apps/web/features/brew-controller/device-mode.ts:20>).
Источник: [apps/web/features/brew-controller/stage-labels.ts:34](</home/dopefish/projects/nb/apps/web/features/brew-controller/stage-labels.ts:34>).
Источник: [apps/web/features/brew-controller/telemetry-annotations.ts:51](</home/dopefish/projects/nb/apps/web/features/brew-controller/telemetry-annotations.ts:51>).

### R140. Подключение RAPT: пояснение

**Сейчас:** Pill, камера ферментации, BrewZilla

**Предлагаю:** Pill, камера брожения, BrewZilla

**Почему:** Согласовать термин с остальным интерфейсом.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/devices/components/devices-manager.tsx:397](</home/dopefish/projects/nb/apps/web/features/devices/components/devices-manager.tsx:397>).

### R141. Приборы: ожидание данных

**Сейчас:** Ждём первый пакет…

**Предлагаю:** Ждём первые показания…

**Почему:** «Первый пакет» — сетевой термин; пользователь ждёт показания прибора.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/devices/components/device-tile.tsx:162](</home/dopefish/projects/nb/apps/web/features/devices/components/device-tile.tsx:162>).
Источник: [apps/web/features/device-streams/components/rapt-connect-screen.tsx:257](</home/dopefish/projects/nb/apps/web/features/device-streams/components/rapt-connect-screen.tsx:257>).
Источник: [apps/web/features/device-streams/components/stream-device-console.tsx:322](</home/dopefish/projects/nb/apps/web/features/device-streams/components/stream-device-console.tsx:322>).

### R142. Приборы: отсутствие данных

**Сейчас:** Нет телеметрии — откройте пульт.

**Предлагаю:** Показаний пока нет. Откройте пульт.

**Почему:** «Нет телеметрии» заменено понятным описанием.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/devices/components/device-tile.tsx:274](</home/dopefish/projects/nb/apps/web/features/devices/components/device-tile.tsx:274>).

### R143. Пульт: состояние связи

**Сейчас:** Офлайн

**Предлагаю:** Не в сети

**Почему:** В списке приборов это состояние уже называется «Не в сети».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-controller/components/status-pill.tsx:36](</home/dopefish/projects/nb/apps/web/features/brew-controller/components/status-pill.tsx:36>).

### R144. Пульт: состояние прибора

**Сейчас:** Прибор офлайн

**Предлагаю:** Прибор не в сети

**Почему:** Согласовать с остальными состояниями связи.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-controller/kiosk-status.ts:47](</home/dopefish/projects/nb/apps/web/features/brew-controller/kiosk-status.ts:47>).

### R145. Пульт: управление из другого окна

**Сейчас:** Управляет другой сеанс

**Предлагаю:** Управление открыто в другом окне или на другом устройстве

**Почему:** «Управляет другой сеанс» — буквальное описание внутренней блокировки.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-controller/components/control-lease-badge.tsx:57](</home/dopefish/projects/nb/apps/web/features/brew-controller/components/control-lease-badge.tsx:57>).

### R146. Пульт: подсказка при занятом управлении

**Сейчас:** Устройством управляют из другого сеанса. Запросите передачу управления.

**Предлагаю:** Управление уже открыто в другом окне или на другом устройстве. Запросите передачу управления.

**Почему:** Заменяет технический «сеанс» понятной причиной.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-controller/components/control-dock.tsx:99](</home/dopefish/projects/nb/apps/web/features/brew-controller/components/control-dock.tsx:99>).

### R147. Пульт: ручной нагрев

**Сейчас:** Держите для включения…

**Предлагаю:** Удерживайте для включения…

**Почему:** У «держите» пропущено дополнение; соседние кнопки используют «удерживайте».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-controller/components/manual-control-card.tsx:208](</home/dopefish/projects/nb/apps/web/features/brew-controller/components/manual-control-card.tsx:208>).

### R148. Пульт: память рецептов

**Сейчас:** Пивоварня заполнена — что заменить

**Предлагаю:** Память рецептов заполнена. Выберите рецепт для замены.

**Почему:** «Пивоварня заполнена» может означать, что она заполнена суслом.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-controller/components/onboard-recipes-panel.tsx:247](</home/dopefish/projects/nb/apps/web/features/brew-controller/components/onboard-recipes-panel.tsx:247>).

### R149. Пульт: облачная связь

**Сейчас:** Недоступно по облаку

**Предлагаю:** Недоступно через облако

**Почему:** «По облаку» — неестественное управление.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-controller/components/onboard-recipes-panel.tsx:166](</home/dopefish/projects/nb/apps/web/features/brew-controller/components/onboard-recipes-panel.tsx:166>).

### R150. Пульт: облачная связь

**Сейчас:** Список рецептов пивоварни недоступен по облаку

**Предлагаю:** Список рецептов пивоварни недоступен через облако

**Почему:** Та же неестественная конструкция «по облаку».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-controller/components/onboard-recipes-panel.tsx:93](</home/dopefish/projects/nb/apps/web/features/brew-controller/components/onboard-recipes-panel.tsx:93>).

### R151. Настройки прибора: сохранение

**Сейчас:** Сохранить на устройство

**Предлагаю:** Сохранить на устройстве

**Почему:** Для сохранения настроек естественнее «на устройстве»; «на устройство» здесь звучит как калька.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/devices/components/device-config-form.tsx:418](</home/dopefish/projects/nb/apps/web/features/devices/components/device-config-form.tsx:418>).

### R152. Уведомления: настройка на iPhone

**Сейчас:** Пуши на iPhone приходят только в установленное приложение: в Safari — «Поделиться» → «На экран „Домой“».

**Предлагаю:** На iPhone уведомления доступны только после установки приложения. В Safari нажмите «Поделиться» → «На экран „Домой“».

**Почему:** «Пуши» — профессиональное сокращение, которое не нужно в пользовательской инструкции.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/notifications/components/notification-opt-in.tsx:53](</home/dopefish/projects/nb/apps/web/features/notifications/components/notification-opt-in.tsx:53>).

### R153. Уведомления: напоминание после затирания

**Сейчас:** Удалите солод

**Предлагаю:** Извлеките дробину

**Почему:** Согласовать с тем же шагом на пульте. «Удалите солод» неточно называет уже использованное сырьё.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/push/src/notification.ts:27](</home/dopefish/projects/nb/packages/push/src/notification.ts:27>).

### R154. Уведомление о пропавшей связи

**Сейчас:** Прибор молчит

**Предлагаю:** Нет связи с прибором

**Почему:** «Прибор молчит» — разговорная метафора вместо состояния.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/push/src/notification.ts:141](</home/dopefish/projects/nb/packages/push/src/notification.ts:141>).

### R155. Уведомление об ареометре

**Сейчас:** Ареометр молчит:

**Предлагаю:** Нет данных от ареометра:

**Почему:** «Ареометр молчит» не различает отсутствие данных и состояние устройства.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/push/src/notification.ts:191](</home/dopefish/projects/nb/packages/push/src/notification.ts:191>).

### R156. RAPT: подтверждение нового адреса

**Сейчас:** URL перевыпущен. Старый больше не работает

**Предлагаю:** Создан новый адрес подключения. Старый больше не работает.

**Почему:** URL не «перевыпускают» в обычной речи; название адреса объясняет, что изменилось.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/components/rapt-connect-screen.tsx:162](</home/dopefish/projects/nb/apps/web/features/device-streams/components/rapt-connect-screen.tsx:162>).
Источник: [apps/web/features/device-streams/components/rapt-integration-card.tsx:59](</home/dopefish/projects/nb/apps/web/features/device-streams/components/rapt-integration-card.tsx:59>).
Источник: [apps/web/features/device-streams/components/stream-device-console.tsx:262](</home/dopefish/projects/nb/apps/web/features/device-streams/components/stream-device-console.tsx:262>).

### R157. RAPT: кнопка нового адреса

**Сейчас:** Перевыпустить URL

**Предлагаю:** Создать новый адрес

**Почему:** Убрать буквальное «Перевыпустить URL».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/components/rapt-connect-screen.tsx:205](</home/dopefish/projects/nb/apps/web/features/device-streams/components/rapt-connect-screen.tsx:205>).
Источник: [apps/web/features/device-streams/components/rapt-integration-card.tsx:98](</home/dopefish/projects/nb/apps/web/features/device-streams/components/rapt-integration-card.tsx:98>).
Источник: [apps/web/features/device-streams/components/stream-device-console.tsx:392](</home/dopefish/projects/nb/apps/web/features/device-streams/components/stream-device-console.tsx:392>).
Источник: [apps/web/features/device-streams/components/stream-device-console.tsx:408](</home/dopefish/projects/nb/apps/web/features/device-streams/components/stream-device-console.tsx:408>).

### R158. RAPT: подтверждение нового адреса

**Сейчас:** Перевыпустить URL?

**Предлагаю:** Создать новый адрес подключения?

**Почему:** Согласовать с кнопкой и сообщением результата.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/components/rapt-connect-screen.tsx:276](</home/dopefish/projects/nb/apps/web/features/device-streams/components/rapt-connect-screen.tsx:276>).
Источник: [apps/web/features/device-streams/components/rapt-integration-card.tsx:107](</home/dopefish/projects/nb/apps/web/features/device-streams/components/rapt-integration-card.tsx:107>).
Источник: [apps/web/features/device-streams/components/stream-device-console.tsx:478](</home/dopefish/projects/nb/apps/web/features/device-streams/components/stream-device-console.tsx:478>).

### R159. RAPT: показ адреса

**Сейчас:** URL показывается один раз. Перевыпустите, чтобы получить новый.

**Предлагаю:** Адрес подключения показывается только один раз. Если вы его не сохранили, создайте новый.

**Почему:** Объясняет действие вместо повторения технического «перевыпустите URL».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/device-streams/components/rapt-connect-screen.tsx:199](</home/dopefish/projects/nb/apps/web/features/device-streams/components/rapt-connect-screen.tsx:199>).
Источник: [apps/web/features/device-streams/components/rapt-integration-card.tsx:88](</home/dopefish/projects/nb/apps/web/features/device-streams/components/rapt-integration-card.tsx:88>).
Источник: [apps/web/features/device-streams/components/stream-device-console.tsx:386](</home/dopefish/projects/nb/apps/web/features/device-streams/components/stream-device-console.tsx:386>).

### R160. Приборы: служебная ошибка привязки

**Сейчас:** Для прямой привязки укажите hardware ID устройства.

**Предлагаю:** Для прямого подключения укажите аппаратный идентификатор устройства.

**Почему:** Смешение русского предложения и hardware ID без необходимости.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/devices/pairing-error-text.ts:21](</home/dopefish/projects/nb/apps/web/features/devices/pairing-error-text.ts:21>).

### R161. Приборы: недоступное демо

**Сейчас:** Демо-пивоварня недоступна в этом окружении.

**Предлагаю:** Демо-пивоварня здесь недоступна.

**Почему:** «В этом окружении» — термин среды выполнения, который не нужен пользователю.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/devices/pairing-error-text.ts:26](</home/dopefish/projects/nb/apps/web/features/devices/pairing-error-text.ts:26>).

### R162. Прибор: кнопка полноэкранного пульта

**Сейчас:** Киоск

**Предлагаю:** Полноэкранный пульт

**Почему:** «Киоск» — техническое название режима, непонятное без контекста.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/devices/components/device-header.tsx:94](</home/dopefish/projects/nb/apps/web/features/devices/components/device-header.tsx:94>).

### R163. Прибор: выход из полноэкранного режима

**Сейчас:** Выйти из киоска

**Предлагаю:** Выйти из полноэкранного режима

**Почему:** Согласовать с понятным названием режима.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-controller/components/kiosk-shell.tsx:140](</home/dopefish/projects/nb/apps/web/features/brew-controller/components/kiosk-shell.tsx:140>).

### R164. Прибор: подсказка полноэкранного режима

**Сейчас:** Экран не будет гаснуть, пока открыт киоск

**Предлагаю:** Экран не будет гаснуть, пока открыт полноэкранный пульт

**Почему:** Согласовать с названием режима.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/brew-controller/kiosk-status.ts:58](</home/dopefish/projects/nb/apps/web/features/brew-controller/kiosk-status.ts:58>).

## Этикетки, статьи и оформление — 25

### R165. Редактор этикетки: просмотр

**Сейчас:** Превью

**Предлагаю:** Предпросмотр

**Почему:** В пользовательском интерфейсе есть понятный русский вариант слова «превью».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/labels/label-studio.tsx:753](</home/dopefish/projects/nb/apps/web/components/recipes/labels/label-studio.tsx:753>).

### R166. Редактор этикетки: полноэкранный просмотр

**Сейчас:** Открыть превью во весь экран

**Предлагаю:** Открыть предпросмотр во весь экран

**Почему:** Согласовать с названием блока.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/labels/label-studio.tsx:770](</home/dopefish/projects/nb/apps/web/components/recipes/labels/label-studio.tsx:770>).

### R167. Редактор этикетки: ошибка

**Сейчас:** Не удалось обновить превью.

**Предлагаю:** Не удалось обновить предпросмотр.

**Почему:** Согласовать с названием блока.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/labels/label-studio.tsx:799](</home/dopefish/projects/nb/apps/web/components/recipes/labels/label-studio.tsx:799>).

### R168. Редактор этикетки: доступное название

**Сейчас:** Превью наклейки

**Предлагаю:** Предпросмотр этикетки

**Почему:** Согласовать название объекта и блока.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/labels/label-studio.tsx:859](</home/dopefish/projects/nb/apps/web/components/recipes/labels/label-studio.tsx:859>).

### R169. Редактор этикетки: отображение качества

**Сейчас:** Показать чётко

**Предлагаю:** Показать со сглаживанием

**Почему:** Кнопка переключает сглаженный просмотр и реальный растр печати. «Чётко» неточно описывает различие.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/labels/label-studio.tsx:759](</home/dopefish/projects/nb/apps/web/components/recipes/labels/label-studio.tsx:759>).

### R170. Редактор этикетки: вид для печати

**Сейчас:** Как напечатается

**Предлагаю:** Показать как при печати

**Почему:** «Как напечатается» — неестественная безличная форма.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/labels/label-studio.tsx:759](</home/dopefish/projects/nb/apps/web/components/recipes/labels/label-studio.tsx:759>).

### R171. Редактор этикетки: подпись автора

**Сейчас:** Марка внизу

**Предлагаю:** Подпись внизу этикетки

**Почему:** «Марка внизу» двусмысленно: непонятно, имеется в виду бренд, эмблема или подпись.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/labels/label-studio.tsx:1010](</home/dopefish/projects/nb/apps/web/components/recipes/labels/label-studio.tsx:1010>).

### R172. Статьи: заголовок в редакторе

**Сейчас:** Название гайда или обзора

**Предлагаю:** Название инструкции или обзора

**Почему:** «Гайд» — необязательное заимствование, выбивающееся из русских названий разделов.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/content/article-editor-form.tsx:117](</home/dopefish/projects/nb/apps/web/components/content/article-editor-form.tsx:117>).

### R173. Статьи: поле текста

**Сейчас:** Напишите гайд или обзор…

**Предлагаю:** Напишите инструкцию или обзор…

**Почему:** Согласовать с полем заголовка.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/content/content-body-editor.tsx:85](</home/dopefish/projects/nb/apps/web/components/content/content-body-editor.tsx:85>).

### R174. Статьи: вставка изображения

**Сейчас:** Фото — слот

**Предлагаю:** Место для фото

**Почему:** «Фото — слот» — служебное название заготовки.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/content/content-body-editor.tsx:38](</home/dopefish/projects/nb/apps/web/components/content/content-body-editor.tsx:38>).

### R175. Статьи: аннотация

**Сейчас:** Аннотация (необязательно — иначе соберём из текста)

**Предлагаю:** Аннотация (если оставить пустой, она будет составлена из текста статьи)

**Почему:** «Иначе соберём из текста» — черновая фраза с неясным объектом.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/content/article-editor-form.tsx:130](</home/dopefish/projects/nb/apps/web/components/content/article-editor-form.tsx:130>).

### R176. BJCP: мобильные фильтры

**Сейчас:** Уточнить каталог

**Предлагаю:** Фильтры стилей

**Почему:** «Уточнить каталог» — неестественное сочетание; пользователь выбирает фильтры.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/content/bjcp-filter-sheet.tsx:36](</home/dopefish/projects/nb/apps/web/components/content/bjcp-filter-sheet.tsx:36>).

### R177. BJCP: краткие подписи параметров

**Сейчас:** как база

**Предлагаю:** как у базового стиля

**Почему:** «Как база» — калька и непонятное сокращение.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/content/bjcp-card-stats.ts:21](</home/dopefish/projects/nb/apps/web/features/content/bjcp-card-stats.ts:21>).

### R178. BJCP: краткие подписи параметров

**Сейчас:** по базе

**Предлагаю:** по базовому стилю

**Почему:** «По базе» звучит как ссылка на базу данных.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/content/bjcp-card-stats.ts:22](</home/dopefish/projects/nb/apps/web/features/content/bjcp-card-stats.ts:22>).

### R179. BJCP: краткие подписи параметров

**Сейчас:** крепче базы

**Предлагаю:** крепче базового стиля

**Почему:** «Крепче базы» — внутреннее сокращение.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/content/bjcp-card-stats.ts:23](</home/dopefish/projects/nb/apps/web/features/content/bjcp-card-stats.ts:23>).

### R180. BJCP: краткие подписи параметров

**Сейчас:** темнее базы

**Предлагаю:** темнее базового стиля

**Почему:** «Темнее базы» — внутреннее сокращение.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/content/bjcp-card-stats.ts:24](</home/dopefish/projects/nb/apps/web/features/content/bjcp-card-stats.ts:24>).

### R181. Оформление: доступная подпись переключателя

**Сейчас:** Скин «Хмель»: включён

**Предлагаю:** Оформление «Хмель» включено

**Почему:** «Скин» — англицизм, для которого здесь есть обычное русское слово.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/theme/theme-toggle.tsx:35](</home/dopefish/projects/nb/apps/web/components/theme/theme-toggle.tsx:35>).

### R182. Оформление: доступная подпись переключателя

**Сейчас:** Скин «Хмель»: выключен

**Предлагаю:** Оформление «Хмель» выключено

**Почему:** Согласовать с включённым состоянием.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/theme/theme-toggle.tsx:35](</home/dopefish/projects/nb/apps/web/components/theme/theme-toggle.tsx:35>).

### R183. Витрины мастеров: описание для поиска

**Сейчас:** Пивоварное оборудование ручной работы: ЦКТ и ёмкости, автоматика для варки, чиллеры, мельницы — от мастеров из комьюнити. Контакты и фото — напрямую, без посредников.

**Предлагаю:** Пивоварное оборудование от мастеров сообщества: ЦКТ и другие ёмкости, автоматика, чиллеры и мельницы. Фотографии и контакты мастеров.

**Почему:** «Комьюнити», «контакты и фото — напрямую» — смешение жаргона и рекламных обрывков.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/masters/seo.ts:40](</home/dopefish/projects/nb/apps/web/features/masters/seo.ts:40>).

### R184. Редактор этикетки: подпись изображения

**Сейчас:** Превью наклейки «

**Предлагаю:** Предпросмотр этикетки «

**Почему:** Согласовать подпись изображения с названием блока; название пива подставляется после кавычки.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/labels/label-studio.tsx:775](</home/dopefish/projects/nb/apps/web/components/recipes/labels/label-studio.tsx:775>).
Источник: [apps/web/components/recipes/labels/label-studio.tsx:865](</home/dopefish/projects/nb/apps/web/components/recipes/labels/label-studio.tsx:865>).

### R185. Редактор этикетки: поле крепости

**Сейчас:** ABV

**Предлагаю:** Крепость, % об.

**Почему:** Название поля по-русски; обозначения на самой этикетке согласовываются отдельно.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/labels/label-studio.tsx:943](</home/dopefish/projects/nb/apps/web/components/recipes/labels/label-studio.tsx:943>).

### R186. Редактор этикетки: поле горечи

**Сейчас:** IBU

**Предлагаю:** Горечь, IBU

**Почему:** Сохранить профессиональную шкалу и пояснить, что она измеряет.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/labels/label-studio.tsx:944](</home/dopefish/projects/nb/apps/web/components/recipes/labels/label-studio.tsx:944>).

### R187. Редактор этикетки: поле цвета

**Сейчас:** EBC

**Предлагаю:** Цвет, EBC

**Почему:** Сохранить шкалу и пояснить величину.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/labels/label-studio.tsx:945](</home/dopefish/projects/nb/apps/web/components/recipes/labels/label-studio.tsx:945>).

### R188. Редактор этикетки: начальная плотность

**Сейчас:** OG

**Предлагаю:** Начальная плотность

**Почему:** Русская подпись соответствует уже выбранной шкале плотности.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/labels/label-studio.tsx:972](</home/dopefish/projects/nb/apps/web/components/recipes/labels/label-studio.tsx:972>).

### R189. Редактор этикетки: конечная плотность

**Сейчас:** FG

**Предлагаю:** Конечная плотность

**Почему:** Согласовать с начальной плотностью.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/recipes/labels/label-studio.tsx:973](</home/dopefish/projects/nb/apps/web/components/recipes/labels/label-studio.tsx:973>).

## Администрирование — 20

### R190. Каталог: альтернативные названия

**Сейчас:** Алиасы:

**Предлагаю:** Другие названия:

**Почему:** «Алиасы» — термин разработчиков, а здесь имеются в виду названия ингредиента.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/ingredients/admin-catalog-list.tsx:245](</home/dopefish/projects/nb/apps/web/components/ingredients/admin-catalog-list.tsx:245>).

### R191. Каталог: поле альтернативного названия

**Сейчас:** Алиас

**Предлагаю:** Другое название

**Почему:** Согласовать термин с публичной карточкой ингредиента.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/ingredients/admin-ingredient-form.tsx:164](</home/dopefish/projects/nb/apps/web/components/ingredients/admin-ingredient-form.tsx:164>).

### R192. Каталог: язык названия

**Сейчас:** Язык алиаса

**Предлагаю:** Язык названия

**Почему:** Согласовать с заменой «алиаса».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/ingredients/admin-ingredient-form.tsx:172](</home/dopefish/projects/nb/apps/web/components/ingredients/admin-ingredient-form.tsx:172>).

### R193. Каталог: добавить название

**Сейчас:** Добавить алиас

**Предлагаю:** Добавить название

**Почему:** Согласовать с заменой «алиаса».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/ingredients/admin-ingredient-form.tsx:207](</home/dopefish/projects/nb/apps/web/components/ingredients/admin-ingredient-form.tsx:207>).

### R194. Каталог: удалить название

**Сейчас:** Удалить алиас

**Предлагаю:** Удалить название

**Почему:** Согласовать с заменой «алиаса».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/ingredients/admin-ingredient-form.tsx:196](</home/dopefish/projects/nb/apps/web/components/ingredients/admin-ingredient-form.tsx:196>).

### R195. Каталог: пустой список названий

**Сейчас:** Алиасов нет.

**Предлагаю:** Другие названия не указаны.

**Почему:** Согласовать с заменой «алиаса».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/ingredients/admin-ingredient-form.tsx:157](</home/dopefish/projects/nb/apps/web/components/ingredients/admin-ingredient-form.tsx:157>).

### R196. Каталог: раздел названий

**Сейчас:** Алиасы

**Предлагаю:** Другие названия

**Почему:** Согласовать с заменой «алиаса».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/ingredients/admin-ingredient-form.tsx:612](</home/dopefish/projects/nb/apps/web/components/ingredients/admin-ingredient-form.tsx:612>).

### R197. Каталог: поиск

**Сейчас:** Название, бренд, производитель, алиас

**Предлагаю:** Название, бренд, производитель или другое название

**Почему:** Убирает «алиас» из поисковой подсказки.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/ingredients/admin-catalog-toolbar.tsx:96](</home/dopefish/projects/nb/apps/web/components/ingredients/admin-catalog-toolbar.tsx:96>).

### R198. Обратная связь: решение

**Сейчас:** Резолюция:

**Предлагаю:** Решение:

**Почему:** «Резолюция» — избыточно канцелярское слово.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/feedback/feedback-queue.tsx:76](</home/dopefish/projects/nb/apps/web/components/feedback/feedback-queue.tsx:76>).

### R199. Обратная связь: комментарий

**Сейчас:** Заметка к резолюции

**Предлагаю:** Комментарий к решению

**Почему:** Согласовать с названием решения.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/feedback/feedback-queue.tsx:82](</home/dopefish/projects/nb/apps/web/components/feedback/feedback-queue.tsx:82>).

### R200. Массовые действия: ошибки

**Сейчас:** Не прошло:

**Предлагаю:** Не удалось обработать:

**Почему:** «Не прошло» не поясняет, что произошло с выбранными записями.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/admin/admin-bulk-failures.tsx:33](</home/dopefish/projects/nb/apps/web/components/admin/admin-bulk-failures.tsx:33>).
Источник: [apps/web/components/admin/recipes/admin-recipes-list.tsx:73](</home/dopefish/projects/nb/apps/web/components/admin/recipes/admin-recipes-list.tsx:73>).
Источник: [apps/web/components/ingredients/admin-catalog-list.tsx:134](</home/dopefish/projects/nb/apps/web/components/ingredients/admin-catalog-list.tsx:134>).

### R201. Статьи: пустой список

**Сейчас:** Пока нет статей. Создайте первый гайд или обзор.

**Предлагаю:** Статей пока нет. Создайте инструкцию или обзор.

**Почему:** Согласовать с русским названием типа материала.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(admin)/admin/articles/page.tsx:167](</home/dopefish/projects/nb/apps/web/app/(admin)/admin/articles/page.tsx:167>).

### R202. Мастера: просмотр изменений

**Сейчас:** Превью черновика

**Предлагаю:** Предпросмотр черновика

**Почему:** Согласовать с другими блоками предпросмотра.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/app/(admin)/admin/masters/[id]/page.tsx:48](</home/dopefish/projects/nb/apps/web/app/(admin)/admin/masters/[id]/page.tsx:48>).

### R203. Мастера: галерея

**Сейчас:** Фото вне товаров нет.

**Предлагаю:** В общей галерее пока нет фото.

**Почему:** «Фото вне товаров» — буквальное описание связи объектов в базе.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/masters/admin/master-content-moderation.tsx:220](</home/dopefish/projects/nb/apps/web/components/masters/admin/master-content-moderation.tsx:220>).

### R204. Мастера: скрытие страницы

**Сейчас:** Публичная страница мастера станет недоступна. Контент сохранится — вернуть видимость можно в любой момент.

**Предлагаю:** Страница мастера станет недоступна посетителям. Все материалы сохранятся — страницу можно будет вернуть на витрину.

**Почему:** Убирает «контент» и «вернуть видимость», объясняет результат действия.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/masters/admin/master-moderation-panel.tsx:191](</home/dopefish/projects/nb/apps/web/components/masters/admin/master-moderation-panel.tsx:191>).

### R205. Уведомления: удаление подписки

**Сейчас:** перестанет получать пуши. Подписаться заново можно из браузера.

**Предлагаю:** перестанет получать уведомления. Включить их снова можно в браузере.

**Почему:** «Получать пуши» — жаргон; сохраняется подлежащее из предшествующего фрагмента.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/components/admin/push/push-subscriptions-table.tsx:131](</home/dopefish/projects/nb/apps/web/components/admin/push/push-subscriptions-table.tsx:131>).

### R206. Рецепты: статусы доступа

**Сейчас:** Приватный

**Предлагаю:** Только автору

**Почему:** В административном интерфейсе «Только мне» было бы неверно: речь о рецептах других людей.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/recipes/admin-page-model.ts:30](</home/dopefish/projects/nb/apps/web/features/recipes/admin-page-model.ts:30>).

### R207. Рецепты: фильтр доступа

**Сейчас:** Приватные

**Предлагаю:** Доступные только автору

**Почему:** Согласовать с названием статуса, сохранив смысл для модератора.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/recipes/admin-page-model.ts:38](</home/dopefish/projects/nb/apps/web/features/recipes/admin-page-model.ts:38>).

### R208. Рецепты: сортировка

**Сейчас:** По обновлению

**Предлагаю:** По дате изменения

**Почему:** Убрать неясное «По обновлению».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/recipes/admin-page-model.ts:54](</home/dopefish/projects/nb/apps/web/features/recipes/admin-page-model.ts:54>).

### R209. Каталог: сортировка

**Сейчас:** По обновлению

**Предлагаю:** По дате изменения

**Почему:** Согласовать название сортировки между разделами.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [apps/web/features/ingredients/admin-page-model.ts:35](</home/dopefish/projects/nb/apps/web/features/ingredients/admin-page-model.ts:35>).

## Описания для этикеток · лагеры и пшеничное — 27

### R210. Описание по умолчанию · 1A · Американский лёгкий лагер

**Сейчас:** Ледяной, лёгкий до прозрачности лагер почти без вкусовых акцентов: сплошная свежесть, газ и жажда, которой он не оставляет ни шанса.

**Предлагаю:** Лёгкий лагер с мягким вкусом и выраженной карбонизацией.

**Почему:** «Лёгкий до прозрачности» и «жажда без шанса» — натянутые рекламные образы.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:12](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:12>).

### R211. Описание по умолчанию · 1B · Американский лагер

**Сейчас:** Светлый, звонко газированный лагер с чистым зерновым тоном и едва заметной горчинкой. Пиво без претензий: его пьют холодным и большими глотками.

**Предлагаю:** Светлый лагер с зерновыми нотами, слабой горечью и выраженной карбонизацией.

**Почему:** «Звонко газированный» и «пиво без претензий» заменены описанием вкуса.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:13](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:13>).

### R212. Описание по умолчанию · 1C · Крим-эль

**Сейчас:** Золотистый эль, сваренный с лагерной аккуратностью: мягкое зерно, чистый вкус, шелковистая текстура. Характера больше, чем у светлого лагера, лёгкости — не меньше.

**Предлагаю:** Золотистый эль с мягким зерновым вкусом и шелковистой текстурой.

**Почему:** «Лагерная аккуратность» и сравнение количества «характера» звучат искусственно.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:14](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:14>).

### R213. Описание по умолчанию · 2A · Международный светлый лагер

**Сейчас:** Классический светлый лагер интернационального образца: ровный, чистый, хорошо газированный, с деликатной горчинкой. Универсальное пиво к любому столу.

**Предлагаю:** Светлый лагер с чистым вкусом, мягкой горечью и выраженной карбонизацией.

**Почему:** «Интернационального образца» и «универсальное к любому столу» — канцеляризм и рекламный штамп.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:17](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:17>).

### R214. Описание по умолчанию · 2B · Международный янтарный лагер

**Сейчас:** Янтарный лагер с карамельно-тостовой солодовой ноткой и мягкой горечью. Пьётся легко, а вкус теплее и круглее, чем у светлого собрата.

**Предлагаю:** Янтарный лагер с нотами карамели и поджаренного хлеба, мягкой горечью.

**Почему:** «Вкус теплее и круглее, чем у светлого собрата» — нагромождение образов.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:18](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:18>).

### R215. Описание по умолчанию · 2C · Международный тёмный лагер

**Сейчас:** Тёмный лагер с лёгкой карамельной сладостью и намёком на жареный солод. Мягкий, округлый, без горькой обжарки — тёмное пиво для тех, кто любит полегче.

**Предлагаю:** Тёмный лагер с лёгкой карамельной сладостью и мягкими нотами обжаренного солода.

**Почему:** Убрана рекламная концовка «для тех, кто любит полегче».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:19](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:19>).

### R216. Описание по умолчанию · 3A · Чешский светлый лагер

**Сейчас:** Лёгкий чешский лагер с хлебным солодом и травяным жатецким хмелем. Сессионное пиво, ради которого в Чехии заходят в пивную каждый вечер.

**Предлагаю:** Лёгкий чешский лагер с хлебными нотами солода и травяным ароматом жатецкого хмеля.

**Почему:** Убрана выдуманная бытовая сценка про ежедневные походы в пивную.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:21](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:21>).

### R217. Описание по умолчанию · 3B · Чешский премиальный светлый лагер

**Сейчас:** Золотой чешский лагер с густой пеной, богатым солодом и длинной благородной горечью жатецкого хмеля. Эталон, с которого начался весь пилснер.

**Предлагаю:** Золотистый чешский лагер с густой пеной, насыщенным солодовым вкусом и долгой хмелевой горечью.

**Почему:** «Богатый солод» и рекламное «эталон, с которого начался весь пилснер» заменены описанием пива.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:22](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:22>).

### R218. Описание по умолчанию · 3C · Чешский янтарный лагер

**Сейчас:** Янтарный чешский лагер: карамель, хлебная корочка и травяной хмель в спокойном равновесии. Пиво неторопливое и уютное.

**Предлагаю:** Янтарный чешский лагер с нотами карамели, хлебной корочки и травяного хмеля.

**Почему:** «Пиво неторопливое и уютное» — шаблонная эмоциональная концовка.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:23](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:23>).

### R219. Описание по умолчанию · 4A · Мюнхенский хеллес

**Сейчас:** Золотистый баварский лагер, где на первом плане мягкий хлебный солод, а хмель лишь подводит черту. Пиво, которое пьют литровыми кружками и не устают.

**Предлагаю:** Золотистый баварский лагер с мягким хлебным вкусом солода и сдержанной хмелевой горечью.

**Почему:** «Хмель подводит черту» и «пьют литровыми кружками и не устают» ничего не уточняют о вкусе.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:26](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:26>).

### R220. Описание по умолчанию · 4B · Фестбир

**Сейчас:** Праздничный лагер Октоберфеста: светлый, солодовый, крепче обычного — и при этом опасно питкий.

**Предлагаю:** Светлый солодовый лагер Октоберфеста, более крепкий, чем обычный светлый лагер.

**Почему:** «Опасно питкий» — рекламная бравада.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:27](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:27>).

### R221. Описание по умолчанию · 4C · Хеллес бок

**Сейчас:** Светлый бок: густой хлебный солод, заметная крепость и неожиданно сухой финиш, который зовёт к следующему глотку.

**Предлагаю:** Крепкий светлый бок с насыщенным хлебным вкусом и сухим послевкусием.

**Почему:** «Финиш зовёт к следующему глотку» — калька и шаблонный оборот.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:28](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:28>).

### R222. Описание по умолчанию · 5A · Немецкий ляйхтбир

**Сейчас:** Облегчённый немецкий лагер: алкоголя мало, а солод и травяной хмель на месте. Пиво для долгого разговора.

**Предлагаю:** Немецкий лагер невысокой крепости с солодовым вкусом и травяными нотами хмеля.

**Почему:** «Солод и хмель на месте» и «пиво для долгого разговора» — расплывчатые формулы.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:30](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:30>).

### R223. Описание по умолчанию · 5B · Кёльш

**Сейчас:** Кёльнский эль, сваренный с лагерной чистотой: блестяще-светлый, тонкий, с лёгкой фруктовой ноткой и сухим финишем. Пьётся быстрее, чем успеваешь заметить.

**Предлагаю:** Светлый кёльнский эль с чистым вкусом, лёгкими фруктовыми нотами и сухим послевкусием.

**Почему:** «Лагерная чистота», «блестяще-светлый» и «пьётся быстрее, чем заметишь» звучат искусственно.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:31](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:31>).

### R224. Описание по умолчанию · 5C · Немецкий хеллес экспортбир

**Сейчас:** Золотистый экспортный лагер: солоднее пилса, горче хеллеса. Крепкое, уверенное пиво в дортмундской манере.

**Предлагаю:** Золотистый дортмундский лагер: более солодовый, чем пилс, и более горький, чем хеллес.

**Почему:** «Уверенное пиво в дортмундской манере» — рекламная оценка без дополнительного смысла.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:32](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:32>).

### R225. Описание по умолчанию · 5D · Немецкий пилс

**Сейчас:** Освежающий светлый лагер с сухим финишем и звонкой хмелевой горечью. Немецкая классика: строго, чисто и очень освежающе.

**Предлагаю:** Светлый немецкий лагер с выраженной хмелевой горечью и сухим послевкусием.

**Почему:** Повтор «освежающий / освежающе», «звонкая горечь» и рубленая рекламная концовка.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:33](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:33>).

### R226. Описание по умолчанию · 6A · Мэрцен

**Сейчас:** Янтарный лагер с тостовым, почти хлебным солодом и чистым сухим финишем. Мартовское пиво, дозревшее к осенним праздникам.

**Предлагаю:** Янтарный лагер с нотами поджаренного хлеба и чистым сухим послевкусием.

**Почему:** «Тостовый солод» и «финиш» заменены более естественным описанием.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:35](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:35>).

### R227. Описание по умолчанию · 6B · Раухбир

**Сейчас:** Копчёный лагер из Бамберга: буковый дым и костёр, а за ними — спокойный тостовый солод. Пиво, которое не спутать ни с чем.

**Предлагаю:** Копчёный лагер из Бамберга с ароматом букового дыма и вкусом поджаренного хлеба.

**Почему:** «Спокойный солод» и «не спутать ни с чем» — шаблонные украшения.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:36](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:36>).

### R228. Описание по умолчанию · 6C · Дунклес бок

**Сейчас:** Тёмный бок: густой хлебно-тостовый солод, тёмные фрукты и мягкое алкогольное тепло. Пиво для холодного вечера.

**Предлагаю:** Тёмный бок с насыщенным хлебным вкусом, нотами тёмных фруктов и согревающим послевкусием.

**Почему:** «Пиво для холодного вечера» повторяется по смыслу во множестве описаний.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:37](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:37>).

### R229. Описание по умолчанию · 7A · Венский лагер

**Сейчас:** Медно-янтарный лагер венской школы: гладкий тостовый солод, спокойная горечь, суховатый финиш. Элегантность без излишеств.

**Предлагаю:** Медно-янтарный венский лагер с нотами поджаренного хлеба, мягкой горечью и суховатым послевкусием.

**Почему:** «Гладкий солод» и «элегантность без излишеств» звучат как перевод рекламного текста.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:39](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:39>).

### R230. Описание по умолчанию · 7B · Альтбир

**Сейчас:** Дюссельдорфский эль, вызревший на холоде: тёмно-янтарный, чистый, с богатым солодом и уверенной горечью. Эль с повадками лагера.

**Предлагаю:** Тёмно-янтарный дюссельдорфский эль с насыщенным солодовым вкусом и выраженной горечью. Выдерживается на холоде.

**Почему:** «Эль с повадками лагера» — декоративная метафора вместо ясного описания.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:40](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:40>).

### R231. Описание по умолчанию · 8B · Шварцбир

**Сейчас:** Чёрный лагер: лёгкий, сухой, с тонкой ноткой кофе и шоколада. Тёмное пиво, которое пьётся как светлое.

**Предлагаю:** Чёрный лагер с лёгким телом, сухим вкусом и тонкими нотами кофе и шоколада.

**Почему:** «Тёмное пиво, которое пьётся как светлое» — рекламное противопоставление.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:43](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:43>).

### R232. Описание по умолчанию · 9A · Доппельбок

**Сейчас:** Монастырский «жидкий хлеб»: густая карамель, тёмные фрукты, изюм и согревающий финиш. Пиво, которым можно поститься.

**Предлагаю:** Крепкий солодовый лагер с нотами карамели, тёмных фруктов и изюма, согревающим послевкусием.

**Почему:** «Жидкий хлеб» и «пиво, которым можно поститься» отвлекают от описания вкуса.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:45](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:45>).

### R233. Описание по умолчанию · 9B · Айсбок

**Сейчас:** Бок, вымороженный до концентрата: плотный, тягучий, с тёмными фруктами и бархатным алкогольным теплом. Пьётся малыми глотками.

**Предлагаю:** Крепкий бок, полученный вымораживанием: плотный, с нотами тёмных фруктов и выраженным алкогольным теплом.

**Почему:** Убраны «до концентрата», «бархатное тепло» и инструкция о размере глотков.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:46](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:46>).

### R234. Описание по умолчанию · 9C · Балтийский портер

**Сейчас:** Тёмный портер, сваренный по-лагерному: сливовое варенье, шоколад, лёгкая обжарка и мягкая крепость. Балтийская классика для долгих зим.

**Предлагаю:** Тёмный портер низового брожения с нотами сливы, шоколада и обжаренного солода.

**Почему:** «По-лагерному», «мягкая крепость» и «классика для долгих зим» звучат неестественно.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:47](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:47>).

### R235. Описание по умолчанию · 10A · Вайсбир

**Сейчас:** Баварское пшеничное: мутное, пышное, с ароматом банана и гвоздики. Живая шапка пены и жажда, снятая с первого глотка.

**Предлагаю:** Мутное баварское пшеничное пиво с ароматом банана и гвоздики, пышной пеной.

**Почему:** «Живая шапка» и «жажда, снятая с первого глотка» — рекламные штампы.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:49](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:49>).

### R236. Описание по умолчанию · 10C · Вайценбок

**Сейчас:** Крепкое пшеничное с характером бока: банан, гвоздика, изюм и хлебная сладость. Мощно, ароматно и обманчиво мягко.

**Предлагаю:** Крепкое пшеничное пиво с хлебной сладостью и нотами банана, гвоздики и изюма.

**Почему:** «Мощно, ароматно и обманчиво мягко» — шаблонная трёхчастная концовка.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:51](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:51>).

## Описания для этикеток · эли, портеры и стауты — 28

### R237. Описание по умолчанию · 11A · Ординари биттер

**Сейчас:** Британский биттер в самой скромной своей форме: медный, лёгкий, с бисквитным солодом и травяной горечью. Пиво паба, а не бутылки.

**Предлагаю:** Лёгкий медный биттер с бисквитными нотами солода и травяной хмелевой горечью.

**Почему:** «В самой скромной форме» и «пиво паба, а не бутылки» — лишняя оценочность.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:53](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:53>).

### R238. Описание по умолчанию · 11B · Бест биттер

**Сейчас:** Английский биттер покрепче: карамельный солод, фруктовые эфиры и суховатая горечь. Пинта, за которой идёт вторая.

**Предлагаю:** Английский биттер с карамельным солодом, фруктовыми нотами и суховатой горечью.

**Почему:** «Пинта, за которой идёт вторая» — рекламный штамп.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:54](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:54>).

### R239. Описание по умолчанию · 11C · Стронг биттер

**Сейчас:** Плотный английский биттер: карамель, тёмные фрукты и уверенная хмелевая горечь. Пиво для неспешного вечера у барной стойки.

**Предлагаю:** Плотный английский биттер с нотами карамели и тёмных фруктов, выраженной хмелевой горечью.

**Почему:** Убрана типовая сценка «для неспешного вечера у барной стойки».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:55](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:55>).

### R240. Описание по умолчанию · 12A · Британский golden ale

**Сейчас:** Британский ответ лагеру: светлый, сухой, с цитрусово-травяным хмелем. Летняя пинта, лёгкая и звонкая.

**Предлагаю:** Светлый британский эль с сухим вкусом и цитрусово-травяным ароматом хмеля.

**Почему:** «Ответ лагеру» и «летняя пинта, лёгкая и звонкая» — рекламные образы.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:57](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:57>).

### R241. Описание по умолчанию · 12C · Английский IPA

**Сейчас:** Британский IPA: землистый и травяной хмель, бисквитный солод и сухая, отчётливая горечь. Тот самый эль, что когда-то плыл в Индию.

**Предлагаю:** Британский IPA с бисквитными нотами солода, землистым и травяным хмелевым ароматом, отчётливой горечью.

**Почему:** Убрана шаблонная историческая концовка «тот самый эль».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:59](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:59>).

### R242. Описание по умолчанию · 13A · Тёмный mild

**Сейчас:** Тёмный эль, слабый по алкоголю и щедрый на вкус: карамель, орех, лёгкий шоколад. Пиво рабочего дня.

**Предлагаю:** Тёмный эль невысокой крепости с нотами карамели, орехов и лёгкого шоколада.

**Почему:** «Слабый по алкоголю», «щедрый на вкус» и «пиво рабочего дня» звучат неестественно.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:61](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:61>).

### R243. Описание по умолчанию · 13B · Британский brown ale

**Сейчас:** Коричневый английский эль: орех, карамель, тост — мягко, округло, без обжарки. Уютное пиво без затей.

**Предлагаю:** Коричневый английский эль с мягким вкусом орехов, карамели и поджаренного хлеба.

**Почему:** «Тост» — буквальное заимствование, «уютное пиво без затей» — общая рекламная концовка.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:62](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:62>).

### R244. Описание по умолчанию · 13C · Английский портер

**Сейчас:** Английский портер: шоколад, карамель, лёгкая обжарка и мягкая горечь. Лондонская классика в тёмном стекле.

**Предлагаю:** Английский портер с нотами шоколада, карамели и обжаренного солода, мягкой горечью.

**Почему:** Убрано декоративное «лондонская классика в тёмном стекле».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:63](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:63>).

### R245. Описание по умолчанию · 14A · Шотландский light

**Сейчас:** Лёгкий шотландский эль: солодовая сладость, карамель и ирис при совсем небольшой крепости. Тихое, домашнее пиво.

**Предлагаю:** Шотландский эль невысокой крепости с солодовой сладостью, нотами карамели и ириса.

**Почему:** «Тихое, домашнее пиво» не описывает свойства стиля.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:65](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:65>).

### R246. Описание по умолчанию · 14B · Шотландский heavy

**Сейчас:** Шотландский эль умеренной крепости: карамель, ирис, лёгкая фруктовость и суховатый финиш. Солод здесь правит балом.

**Предлагаю:** Шотландский эль умеренной крепости с нотами карамели, ириса и фруктов, суховатым послевкусием.

**Почему:** Калька «финиш» и штамп «солод правит балом».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:66](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:66>).

### R247. Описание по умолчанию · 15A · Ирландский red ale

**Сейчас:** Красноватый ирландский эль: карамель, бисквит и сухой поджаристый финиш. Питкое пиво, простое и честное.

**Предлагаю:** Красноватый ирландский эль с нотами карамели, бисквита и поджаренного хлеба, сухим послевкусием.

**Почему:** «Простое и честное» — универсальная рекламная характеристика; «финиш» — калька.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:69](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:69>).

### R248. Описание по умолчанию · 15B · Ирландский stout

**Сейчас:** Чёрный сухой стаут: кофе, жареный ячмень, кремовая пена и горькая сухая точка в финише. Пинта из Дублина.

**Предлагаю:** Чёрный сухой стаут с нотами кофе и жареного ячменя, кремовой пеной и горьким послевкусием.

**Почему:** «Горькая сухая точка в финише» — искусственное сочетание.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:70](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:70>).

### R249. Описание по умолчанию · 15C · Ирландский extra stout

**Сейчас:** Плотный чёрный стаут: эспрессо, горький шоколад и сухая обжаренная горечь. Гуще и крепче привычной пинты.

**Предлагаю:** Плотный крепкий стаут с нотами эспрессо, горького шоколада и выраженной горечью обжаренного солода.

**Почему:** «Гуще и крепче привычной пинты» сравнивает пиво с неопределённым ориентиром.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:71](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:71>).

### R250. Описание по умолчанию · 16A · Сладкий стаут

**Сейчас:** Молочный стаут: кофе со сливками, тёмный шоколад и мягкая молочная сладость. Бархат в бокале.

**Предлагаю:** Молочный стаут с нотами кофе со сливками и тёмного шоколада, мягкой сладостью.

**Почему:** «Бархат в бокале» — один из самых узнаваемых рекламных штампов.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:73](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:73>).

### R251. Описание по умолчанию · 16B · Овсяный стаут

**Сейчас:** Овсяный стаут: шелковистое тело, кофе и тёмный шоколад, ни капли резкости. Тёмное пиво, гладкое, как сливки.

**Предлагаю:** Овсяный стаут с мягкой шелковистой текстурой и нотами кофе и тёмного шоколада.

**Почему:** «Ни капли резкости» и «гладкое, как сливки» заменены спокойным описанием текстуры.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:74](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:74>).

### R252. Описание по умолчанию · 16C · Тропический стаут

**Сейчас:** Сладкий тропический стаут: тёмный солод, спелые фрукты и патока. Много вкуса и никакой жжёной горечи — пиво жарких стран.

**Предлагаю:** Сладкий тропический стаут с нотами тёмного солода, спелых фруктов и патоки.

**Почему:** «Много вкуса и никакой горечи» — категоричное рекламное упрощение.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:75](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:75>).

### R253. Описание по умолчанию · 16D · Иностранный экстра-стаут

**Сейчас:** Крепкий экспортный стаут: густая обжарка, чёрный кофе, лакрица и сухой финиш. Сварен с запасом крепости для дальней дороги.

**Предлагаю:** Крепкий экспортный стаут с выраженным вкусом обжаренного солода, нотами кофе и лакрицы, сухим послевкусием.

**Почему:** «Густая обжарка» и «сварен с запасом для дальней дороги» звучат искусственно.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:76](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:76>).

### R254. Описание по умолчанию · 17A · Крепкий британский эль

**Сейчас:** Крепкий английский эль: карамель, сухофрукты, эфиры и мягкое алкогольное тепло. Пиво из погреба, к которому возвращаются годами.

**Предлагаю:** Крепкий английский эль с нотами карамели и сухофруктов, мягким алкогольным теплом.

**Почему:** Убрана типовая концовка про погреб и возвращение к пиву годами.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:78](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:78>).

### R255. Описание по умолчанию · 17B · Старый эль

**Сейчас:** Выдержанный английский эль: изюм, патока, лёгкая кожа и древесная нотка времени. Пиво, которому идёт возраст.

**Предлагаю:** Выдержанный английский эль с нотами изюма, патоки, кожи и древесины.

**Почему:** «Древесная нотка времени» и «пиву идёт возраст» — персонификация вместо вкусового описания.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:79](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:79>).

### R256. Описание по умолчанию · 17C · Уи-хеви

**Сейчас:** Шотландский тяжеловес: густая карамель, ирис, сухофрукты и плотное согревающее тело. Пиво к камину.

**Предлагаю:** Крепкий плотный шотландский эль с нотами карамели, ириса и сухофруктов, согревающим послевкусием.

**Почему:** «Тяжеловес», «согревающее тело» и «пиво к камину» — повторяющийся рекламный шаблон.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:80](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:80>).

### R257. Описание по умолчанию · 18A · Блонд эль

**Сейчас:** Золотистый эль без острых углов: мягкий солод, тонкий хмель, чистый вкус. С него удобно начинать знакомство с крафтом.

**Предлагаю:** Золотистый эль с мягким солодовым вкусом, тонким хмелевым ароматом и чистым послевкусием.

**Почему:** «Без острых углов» и «знакомство с крафтом» — общие рекламные фразы.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:83](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:83>).

### R258. Описание по умолчанию · 18B · Американский пейл-эль

**Сейчас:** Светлый американский эль: цитрус, хвоя и косточковые фрукты от американского хмеля на мягкой солодовой основе. Свежесть и бодрая горчинка.

**Предлагаю:** Светлый американский эль с мягкой солодовой основой и хмелевыми нотами цитрусов, хвои и косточковых фруктов.

**Почему:** Убрана бессодержательная концовка «свежесть и бодрая горчинка».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:84](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:84>).

### R259. Описание по умолчанию · 19A · Американский янтарный эль

**Сейчас:** Янтарный американский эль: карамельный солод и цитрусовый хмель тянут одеяло каждый на себя — в этом весь смысл.

**Предлагаю:** Янтарный американский эль с карамельным солодом и цитрусовым хмелевым ароматом.

**Почему:** «Тянут одеяло каждый на себя — в этом весь смысл» звучит нарочито.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:86](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:86>).

### R260. Описание по умолчанию · 19B · Калифорнийский коммон

**Сейчас:** Пиво калифорнийских старателей: лагерные дрожжи бродят в тепле — отсюда лёгкая фруктовость поверх поджаристого солода и смолистого хмеля.

**Предлагаю:** Калифорнийское пиво на лагерных дрожжах при тёплом брожении. Во вкусе — поджаренный солод, смолистый хмель и лёгкие фруктовые ноты.

**Почему:** Убрана декоративная история про старателей; сохранено объяснение особенностей брожения.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:87](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:87>).

### R261. Описание по умолчанию · 19C · Американский браун-эль

**Сейчас:** Коричневый американский эль: шоколад и карамель солода, а поверх — цитрусовый хмель. Тёмное пиво с крафтовым акцентом.

**Предлагаю:** Коричневый американский эль с шоколадно-карамельными нотами солода и цитрусовым хмелевым ароматом.

**Почему:** «Крафтовый акцент» ничего конкретного не сообщает о пиве.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:88](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:88>).

### R262. Описание по умолчанию · 20A · Американский портер

**Сейчас:** Американский портер: тёмный шоколад, кофе, обжарка — и хмелевая горечь, которой не бывает у британцев.

**Предлагаю:** Американский портер с нотами тёмного шоколада, кофе и обжаренного солода, выраженной хмелевой горечью.

**Почему:** Убрано категоричное сравнение «горечь, которой не бывает у британцев».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:90](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:90>).

### R263. Описание по умолчанию · 20B · Американский стаут

**Сейчас:** Чёрный американский стаут: жжёный кофе, тёмный шоколад и смолистый хмель. Крепко, горько, без компромиссов.

**Предлагаю:** Американский стаут с нотами жжёного кофе, тёмного шоколада и смолистого хмеля.

**Почему:** «Крепко, горько, без компромиссов» — рекламный штамп.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:91](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:91>).

### R264. Описание по умолчанию · 20C · Имперский стаут

**Сейчас:** Имперский стаут: густой, как патока, с эспрессо, чёрным шоколадом, изюмом и долгим алкогольным теплом. Пиво для маленького бокала и длинного вечера.

**Предлагаю:** Плотный имперский стаут с нотами эспрессо, тёмного шоколада и изюма, долгим согревающим послевкусием.

**Почему:** «Маленький бокал и длинный вечер» — повторяющаяся рекламная конструкция.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:92](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:92>).

## Описания для этикеток · IPA и крепкое пиво — 12

### R265. Описание по умолчанию · 21A · Американский IPA

**Сейчас:** Американский IPA: цитрус, хвоя, тропические фрукты — и сухая горечь, которая держит весь этот хмелевой напор.

**Предлагаю:** Американский IPA с выраженной хмелевой горечью, ароматами цитрусов, хвои и тропических фруктов.

**Почему:** «Горечь держит хмелевой напор» — неестественная метафора.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:94](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:94>).

### R266. Описание по умолчанию · 21B · Специальный IPA

**Сейчас:** IPA со сдвигом: узнаваемая хмелевая горечь и сухой финиш, но собранные вокруг собственной идеи — своего солода, своих дрожжей, своего цвета.

**Предлагаю:** IPA с выраженной хмелевой горечью и сухим послевкусием. Характер зависит от выбранного солода, дрожжей и других особенностей рецепта.

**Почему:** «IPA со сдвигом» и «собранные вокруг собственной идеи» похожи на буквальный перевод.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:95](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:95>).

### R267. Описание по умолчанию · 21B-belgian-ipa

**Сейчас:** Бельгийский IPA: американский хмель встречает бельгийские дрожжи — цитрус и хвоя поверх перечной пряности и сухого финиша.

**Предлагаю:** Бельгийский IPA с цитрусово-хвойным хмелевым ароматом, перечной пряностью дрожжей и сухим послевкусием.

**Почему:** «Хмель встречает дрожжи» — рекламный шаблон; «финиш» заменён русским словом.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:96](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:96>).

### R268. Описание по умолчанию · 21B-black-ipa

**Сейчас:** Чёрный IPA: цвет и лёгкая обжарка от тёмного солода, аромат и вкус — от хмеля. Тёмное пиво, которое ведёт себя как IPA.

**Предлагаю:** Чёрный IPA с выраженным хмелевым ароматом и лёгкими нотами обжаренного солода.

**Почему:** «Пиво, которое ведёт себя как IPA» — искусственное олицетворение.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:97](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:97>).

### R269. Описание по умолчанию · 21B-brown-ipa

**Сейчас:** Коричневый IPA: ореховый и карамельный солод под плотным слоем цитрусового хмеля. Браун-эль, выросший в IPA.

**Предлагаю:** Коричневый IPA с орехово-карамельными нотами солода и выраженным цитрусовым хмелевым ароматом.

**Почему:** «Под плотным слоем хмеля» и «браун-эль, выросший в IPA» — декоративные метафоры.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:98](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:98>).

### R270. Описание по умолчанию · 21B-brut-ipa

**Сейчас:** Брют IPA: выброжен досуха, как игристое, — почти без сладости, с колючей газацией и ярким хмелевым ароматом.

**Предлагаю:** Очень сухой IPA с выраженной карбонизацией и ярким хмелевым ароматом, почти без сладости.

**Почему:** «Колючая газация» и сравнение с игристым заменены прямыми характеристиками.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:99](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:99>).

### R271. Описание по умолчанию · 21B-red-ipa

**Сейчас:** Красный IPA: карамельный солод и рубиновый цвет держат удар смолистого американского хмеля.

**Предлагаю:** Красный IPA рубинового цвета с карамельным солодом и смолистыми нотами американского хмеля.

**Почему:** «Цвет держит удар хмеля» — метафора, которую трудно представить буквально.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:100](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:100>).

### R272. Описание по умолчанию · 21B-white-ipa

**Сейчас:** Белый IPA: витбир и IPA в одном бокале — кориандр, цитрусовая цедра и пшеничная мягкость под хмелевым напором.

**Предлагаю:** Белый IPA сочетает пшеничную мягкость витбира, кориандр и цитрусовую цедру с выраженным хмелевым ароматом.

**Почему:** Убраны рекламные «в одном бокале» и «под хмелевым напором».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:102](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:102>).

### R273. Описание по умолчанию · 21C · Хейзи IPA

**Сейчас:** Мутный IPA новой волны: сок манго и цитруса, мягкая бархатная текстура и почти незаметная горечь. Хмель без единой колючки.

**Предлагаю:** Мутный IPA с ароматом манго и цитрусов, мягкой текстурой и сдержанной горечью.

**Почему:** «Хмель без единой колючки» — искусственная метафора, «сок» может восприниматься как ингредиент.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:103](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:103>).

### R274. Описание по умолчанию · 22A · Двойной IPA

**Сейчас:** Двойной IPA: концентрированный хмель — смола, цитрус, тропики — на сухом крепком теле. Мощно, но всё ещё пьётся.

**Предлагаю:** Крепкий двойной IPA с сухим вкусом и насыщенным хмелевым ароматом: смола, цитрусы и тропические фрукты.

**Почему:** «На сухом крепком теле» — калька; «мощно, но всё ещё пьётся» — рекламная оценка.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:105](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:105>).

### R275. Описание по умолчанию · 22B · Американский крепкий эль

**Сейчас:** Крепкий американский эль: карамельный солод и щедрый хмель в тяжёлом весе. Пиво с характером и градусом.

**Предлагаю:** Крепкий американский эль с насыщенным карамельным вкусом и выраженной хмелевой горечью.

**Почему:** «Тяжёлый вес», «характер и градус» — универсальные рекламные штампы.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:106](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:106>).

### R276. Описание по умолчанию · 22C · Американский барли вайн

**Сейчас:** Американское ячменное вино: густая карамель, сухофрукты и мощная хмелевая горечь, сглаженная алкогольным теплом. Взрослеет в подвале годами.

**Предлагаю:** Американское ячменное вино с нотами карамели и сухофруктов, выраженной хмелевой горечью и алкогольным теплом.

**Почему:** «Взрослеет в подвале» — олицетворение, не нужное краткому описанию вкуса.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:107](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:107>).

## Описания для этикеток · кислое и бельгийское — 12

### R277. Описание по умолчанию · 23A · Берлинер вайссе

**Сейчас:** Берлинское белое: почти невесомое, колюче-кислое и предельно освежающее. Летнее пиво, которое в Берлине разбавляли сиропом.

**Предлагаю:** Лёгкое берлинское пшеничное пиво с выраженной кислинкой.

**Почему:** «Почти невесомое, колюче-кислое и предельно освежающее» — нагромождение усилителей.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:110](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:110>).

### R278. Описание по умолчанию · 23C · Оуд браун

**Сейчас:** Старый бурый фламандец: изюм, карамель, вишнёвая кислинка и мягкая солодовая глубина. Кислое пиво без резкости.

**Предлагаю:** Фламандский коричневый эль с нотами изюма и карамели, мягкой вишнёвой кислинкой.

**Почему:** «Старый бурый фламандец» и «солодовая глубина» звучат как кальки.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:112](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:112>).

### R279. Описание по умолчанию · 23D · Ламбик

**Сейчас:** Дикое брюссельское пиво, сброжённое тем, что прилетело из воздуха. Кислое, землистое, фермерское — и совершенно живое.

**Предлагаю:** Ламбик спонтанного брожения с кислым вкусом и землистыми нотами.

**Почему:** «Сброжённое тем, что прилетело» и «совершенно живое» — нарочитые, неточные образы.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:113](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:113>).

### R280. Описание по умолчанию · 23E · Гёз

**Сейчас:** Купаж молодого и выдержанного ламбика: шампанская газация, лимонная кислинка и сложный характер дикого брожения. Пиво, которое открывают как игристое.

**Предлагаю:** Купаж молодого и выдержанного ламбика с выраженной карбонизацией, лимонной кислинкой и сложным ароматом дикого брожения.

**Почему:** «Шампанская газация» и повторное сравнение с игристым перегружают описание.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:114](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:114>).

### R281. Описание по умолчанию · 23F · Фруктовый ламбик

**Сейчас:** Ламбик, настоянный на ягодах: вишня или малина ложатся на дикую кислоту и придают ей сочность. Сухо, кисло, ароматно.

**Предлагаю:** Фруктовый ламбик с сухим кислым вкусом и ароматом вишни, малины или других ягод.

**Почему:** «Ягоды ложатся на дикую кислоту» — неестественное сочетание.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:115](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:115>).

### R282. Описание по умолчанию · 23G · Гозе

**Сейчас:** Солоноватое пшеничное с кориандром: лёгкая молочная кислинка, щепотка соли и звонкая свежесть. Жажду снимает мгновенно.

**Предлагаю:** Лёгкое пшеничное пиво с кориандром, мягкой молочной кислинкой и солоноватым вкусом.

**Почему:** Убраны «звонкая свежесть» и рекламное «жажду снимает мгновенно».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:116](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:116>).

### R283. Описание по умолчанию · 24B · Бельгийский светлый эль

**Сейчас:** Медный бельгийский эль на каждый день: тостовый солод, груша и лёгкая пряность дрожжей при спокойной горечи.

**Предлагаю:** Медный бельгийский эль с нотами поджаренного хлеба, груши и лёгких пряностей, мягкой горечью.

**Почему:** «На каждый день» и «спокойная горечь» — рекламные обороты; «тостовый» раскрыт.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:119](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:119>).

### R284. Описание по умолчанию · 25B · Сэзон

**Сейчас:** Фермерский эль Валлонии: сухой, искристый, с перцем, цитрусом и травами. Варили его для полевых работ, а пьют круглый год.

**Предлагаю:** Сухой валлонский эль с выраженной карбонизацией, нотами перца, цитрусов и трав.

**Почему:** История «для полевых работ, а пьют круглый год» заменена свойствами пива.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:123](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:123>).

### R285. Описание по умолчанию · 25C · Бельгийский крепкий золотой эль

**Сейчас:** Светлый бельгийский тяжеловес: обманчиво лёгкий на вид, фруктовый и пряный, с сухим финишем, за которым прячутся градусы.

**Предлагаю:** Крепкий светлый бельгийский эль с фруктово-пряным ароматом и сухим послевкусием.

**Почему:** «Тяжеловес» и «финиш, за которым прячутся градусы» — шаблонные метафоры.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:124](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:124>).

### R286. Описание по умолчанию · 26B · Бельгийский дуббель

**Сейчас:** Траппистский дуббель: тёмная карамель, изюм, слива и пряность дрожжей на сухом финише. Тёплое и глубокое пиво.

**Предлагаю:** Бельгийский дуббель с нотами тёмной карамели, изюма, сливы и пряностей, сухим послевкусием.

**Почему:** «Тёплое и глубокое пиво» — расплывчатая оценка; «финиш» заменён русским словом.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:127](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:127>).

### R287. Описание по умолчанию · 26C · Бельгийский трипель

**Сейчас:** Траппистский трипель: золотой, пряный, с грушей и перцем, шампанской газацией и сухим финишем. Крепость прячется до последнего.

**Предлагаю:** Крепкий золотистый трипель с нотами груши и перца, выраженной карбонизацией и сухим послевкусием.

**Почему:** «Крепость прячется до последнего» и «шампанская газация» — рекламный штамп и калька.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:128](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:128>).

### R288. Описание по умолчанию · 26D · Бельгийский крепкий тёмный эль

**Сейчас:** Тёмный бельгийский тяжеловес: сушёные фрукты, карамель, пряность и бархатное тепло. Сложное пиво для медленного вечера.

**Предлагаю:** Крепкий тёмный бельгийский эль с нотами сухофруктов, карамели и пряностей, согревающим послевкусием.

**Почему:** «Тяжеловес», «бархатное тепло» и «медленный вечер» — набор повторяющихся образов.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:129](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:129>).

## Описания для этикеток · другие стили — 32

### R289. Описание по умолчанию · 27-kentucky-common

**Сейчас:** Тёмное пиво старого Луисвилла: кукуруза, лёгкая обжарка и едва уловимая кислинка. Быстрое пиво американских салунов.

**Предлагаю:** Тёмное пиво из Луисвилла с нотами кукурузы, обжаренного солода и едва заметной кислинкой.

**Почему:** «Быстрое пиво американских салунов» — неясная рекламная концовка.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:132](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:132>).

### R290. Описание по умолчанию · 27-lichtenhainer

**Сейчас:** Копчёно-кислое пшеничное из Тюрингии: дым и молочная кислинка в лёгком освежающем теле. Забытая редкость.

**Предлагаю:** Лёгкое пшеничное пиво из Тюрингии с копчёным ароматом и молочной кислинкой.

**Почему:** «Кислинка в освежающем теле» — калька, «забытая редкость» — шаблон.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:133](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:133>).

### R291. Описание по умолчанию · 27-london-brown-ale

**Сейчас:** Лондонский браун: тёмный и сладковатый, с орехом и карамелью, при совсем небольшой крепости. Мягкое пиво без всякой горечи.

**Предлагаю:** Тёмный лондонский браун-эль невысокой крепости с орехово-карамельным вкусом и слабой горечью.

**Почему:** «Без всякой горечи» — излишне категоричная рекламная фраза.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:134](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:134>).

### R292. Описание по умолчанию · 27-piwo-grodziskie

**Сейчас:** Гродзиское: пшеничное пиво на дубовом дыме — лёгкое, сильно газированное, сухое. Польская гордость, воскрешённая из небытия.

**Предлагаю:** Гродзиское: лёгкое сухое пшеничное пиво с выраженной карбонизацией и ароматом дубового дыма.

**Почему:** «Польская гордость, воскрешённая из небытия» — чрезмерно торжественная концовка.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:135](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:135>).

### R293. Описание по умолчанию · 27-pre-prohibition-lager

**Сейчас:** Американский лагер эпохи до Сухого закона: кукурузная сладость, зерновая основа и настоящая хмелевая горечь, о которой потом забыли.

**Предлагаю:** Американский лагер в стиле до сухого закона: зерновой вкус, кукурузная сладость и выраженная хмелевая горечь.

**Почему:** «Настоящая горечь, о которой потом забыли» — рекламное противопоставление.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:136](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:136>).

### R294. Описание по умолчанию · 27-pre-prohibition-porter

**Сейчас:** Портер старой Америки: тёмный, с зерновым вкусом, с патокой и мягкой обжаркой. Вкус XIX века.

**Предлагаю:** Американский портер старого образца с зерновым вкусом, нотами патоки и обжаренного солода.

**Почему:** «Вкус XIX века» — ничего не объясняющий штамп.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:137](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:137>).

### R295. Описание по умолчанию · 27-roggenbier

**Сейчас:** Ржаное баварское: пряная рожь, хлебная корка и дрожжевой банан с гвоздикой. Пиво со вкусом чёрного хлеба.

**Предлагаю:** Баварское ржаное пиво с хлебными и пряными нотами, ароматом банана и гвоздики.

**Почему:** «Дрожжевой банан» — неестественное сокращение; перечисление сделано однородным.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:138](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:138>).

### R296. Описание по умолчанию · 27-sahti

**Сейчас:** Финский сахти: сусло цедят через можжевельник, варки нет вовсе, брожение — на хлебных дрожжах. Банан, специи и смолистая хвоя.

**Предлагаю:** Финский сахти с можжевеловым ароматом, нотами банана, пряностей и хвои.

**Почему:** «Варки нет вовсе» звучит как отрицание приготовления пива; краткая подпись сосредоточена на вкусе.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:139](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:139>).

### R297. Описание по умолчанию · 28A · Бретт-пиво

**Сейчас:** Пиво на бретте: дикие дрожжи вытягивают из базового стиля сухость, тропическую фруктовость и лёгкий сарайный оттенок.

**Предлагаю:** Пиво с дрожжами Brettanomyces: сухое, с тропическими фруктовыми нотами.

**Почему:** «Дрожжи вытягивают сухость» и «сарайный оттенок» звучат как буквальный перевод.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:141](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:141>).

### R298. Описание по умолчанию · 28B · Кислое пиво смешанного брожения

**Сейчас:** Смешанное брожение в дубе: кислота, фанк и фруктовая глубина, которых не получить обычными дрожжами. Пиву нужны годы, чтобы дозреть.

**Предлагаю:** Пиво смешанного брожения, выдержанное в дубе, с кислым вкусом и сложным фруктовым ароматом.

**Почему:** «Фруктовая глубина» и «фанк» без пояснения затрудняют понимание описания.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:142](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:142>).

### R299. Описание по умолчанию · 28C · Специальное дикое пиво

**Сейчас:** Дикое брожение плюс фрукты, дерево или специи: кислота и фанк сплетаются с добавками в многослойный живой вкус.

**Предлагаю:** Пиво дикого брожения с фруктами, древесными нотами или пряностями. Вкус кислый, с характерными нотами дикого брожения.

**Почему:** «Фанк сплетается в многослойный живой вкус» — типичное нагромождение метафор.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:143](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:143>).

### R300. Описание по умолчанию · 28D · Чисто кислое пиво

**Сейчас:** Чистая молочная кислинка без всякого фанка: светлое, лёгкое, звонко-кислое и очень освежающее.

**Предлагаю:** Лёгкое светлое пиво с чистой молочной кислинкой.

**Почему:** «Без всякого фанка», «звонко-кислое» и усилители заменены прямым описанием.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:144](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:144>).

### R301. Описание по умолчанию · 29A · Фруктовое пиво

**Сейчас:** Пиво с настоящими фруктами: ягодный или цитрусовый тон вплетён во вкус, но пиво остаётся пивом.

**Предлагаю:** Фруктовое пиво с выраженными ягодными или цитрусовыми нотами и узнаваемой солодовой основой.

**Почему:** «Но пиво остаётся пивом» — бессодержательная концовка.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:146](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:146>).

### R302. Описание по умолчанию · 29B · Фруктово-пряное пиво

**Сейчас:** Фрукты и специи в одном бокале: сочность и пряность усиливают друг друга, не заглушая пивную основу.

**Предлагаю:** Пиво с фруктами и специями, сочетающее фруктовый аромат, пряность и вкус базового пива.

**Почему:** «В одном бокале», «усиливают друг друга» — универсальные рекламные обороты.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:147](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:147>).

### R303. Описание по умолчанию · 29C · Специальное фруктовое пиво

**Сейчас:** Фруктовое пиво с добавкой характера: мёд, особый сахар или необычная технология делают фруктовый профиль глубже.

**Предлагаю:** Фруктовое пиво с дополнительными ингредиентами или особенностями приготовления: например, с мёдом или специальными сахарами.

**Почему:** «Добавка характера» и «профиль глубже» не объясняют особенность категории.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:148](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:148>).

### R304. Описание по умолчанию · 29D · Виноградный эль

**Сейчас:** Пиво с виноградом: винная кислотность и ягодный аромат сусла срастаются с пивной основой. На стыке бокала и пинты.

**Предлагаю:** Пиво с виноградом, винной кислинкой и ягодным ароматом.

**Почему:** «Срастаются с основой» и «на стыке бокала и пинты» — натянутые образы.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:149](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:149>).

### R305. Описание по умолчанию · 30A · Пиво со специями, травами или овощами

**Сейчас:** Пиво со специями, травами или овощами: добавка ведёт аромат и вкус, но пиво под ней по-прежнему узнаётся.

**Предлагаю:** Пиво со специями, травами или овощами, которые дополняют аромат и вкус базового пива.

**Почему:** «Добавка ведёт аромат» — неестественная калька.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:151](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:151>).

### R306. Описание по умолчанию · 30B · Осеннее сезонное пиво

**Сейчас:** Осеннее пиво: тыква, корица, мускат и имбирь на тёплой солодовой основе. Вкус урожая и первых холодов.

**Предлагаю:** Осеннее пиво с солодовым вкусом и нотами тыквы, корицы, мускатного ореха и имбиря.

**Почему:** «Вкус урожая и первых холодов» — сезонный рекламный штамп.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:152](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:152>).

### R307. Описание по умолчанию · 30C · Зимнее сезонное пиво

**Сейчас:** Зимнее пиво: тёмное, крепкое, с пряностями, сухофруктами и согревающим финишем. Праздничный бокал в холодный вечер.

**Предлагаю:** Крепкое тёмное зимнее пиво с нотами пряностей и сухофруктов, согревающим послевкусием.

**Почему:** «Праздничный бокал в холодный вечер» — шаблонная сценка.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:153](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:153>).

### R308. Описание по умолчанию · 30D · Специальное пиво со специями, травами или овощами

**Сейчас:** Специи, травы или овощи плюс ещё один приём — дым, дерево, фрукты. Всё это должно звучать вместе, не заглушая друг друга.

**Предлагаю:** Пиво со специями, травами или овощами и дополнительными особенностями: копчёными, древесными или фруктовыми нотами.

**Почему:** «Ещё один приём» и «всё должно звучать вместе» заменены конкретным перечислением.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:154](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:154>).

### R309. Описание по умолчанию · 31A · Пиво с альтернативными зерновыми

**Сейчас:** Пиво на нестандартном зерне: рожь, овёс, спельта или гречка вносят свою фактуру и хлебный характер.

**Предлагаю:** Пиво с рожью, овсом, спельтой, гречкой или другим нетипичным для базового стиля зерном.

**Почему:** «Вносят свою фактуру» — неестественный перенос слова из другой области.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:156](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:156>).

### R310. Описание по умолчанию · 31B · Пиво с альтернативными сахарами

**Сейчас:** Пиво на особых сахарах: мёд, кленовый сироп, патока или пальмовый сахар добавляют аромат и сухость. Но это по-прежнему пиво.

**Предлагаю:** Пиво с мёдом, кленовым сиропом, патокой или пальмовым сахаром, которые добавляют свои оттенки аромата и вкуса.

**Почему:** «Но это по-прежнему пиво» — бессодержательная рекламная концовка.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:157](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:157>).

### R311. Описание по умолчанию · 32A · Копчёная версия классического стиля

**Сейчас:** Классический стиль под дымом: копчёный солод добавляет костра и копчёностей, не ломая узнаваемый профиль.

**Предлагаю:** Пиво классического стиля с копчёным солодом, ароматом дыма и копчёностей.

**Почему:** «Стиль под дымом» и «не ломая профиль» — искусственные метафоры.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:159](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:159>).

### R312. Описание по умолчанию · 32B · Специальное копчёное пиво

**Сейчас:** Дым и что-то ещё — фрукты, специи, бочка. Сложное копчёное пиво, которое держится на балансе.

**Предлагаю:** Копчёное пиво с дополнительными фруктовыми, пряными или бочковыми нотами.

**Почему:** «Дым и что-то ещё» и «держится на балансе» — расплывчатые формулы.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:160](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:160>).

### R313. Описание по умолчанию · 33B · Специальное пиво с древесной выдержкой

**Сейчас:** Пиво, выдержанное в бочке из-под бурбона, рома или вина: к дубу добавляется дух того, что жило в бочке раньше, — ваниль, карамель, алкогольное тепло.

**Предлагаю:** Пиво, выдержанное в бочке из-под бурбона, рома или вина, с древесными нотами и ароматом напитка, который был в бочке раньше.

**Почему:** «Дух того, что жило в бочке» — чрезмерное олицетворение.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:163](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:163>).

### R314. Описание по умолчанию · 34A · Специальное пиво по коммерческому образцу

**Сейчас:** Домашняя версия конкретного коммерческого сорта — того, что не укладывается ни в один стиль гайдлайна.

**Предлагаю:** Домашняя версия конкретного коммерческого пива, которое не укладывается в категории справочника BJCP.

**Почему:** «Стиль гайдлайна» — буквальная калька.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:165](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:165>).

### R315. Описание по умолчанию · 34B · Пиво смешанного стилевого типа

**Сейчас:** Два стиля в одном бокале: гибрид берёт лучшее от каждого и не притворяется ни одним из них.

**Предлагаю:** Пиво, сочетающее характерные признаки двух стилей.

**Почему:** «Берёт лучшее» и «не притворяется» — рекламная оценка и олицетворение.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:166](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:166>).

### R316. Описание по умолчанию · 34C · Экспериментальное пиво

**Сейчас:** Пиво вне правил: своя идея, свои ингредиенты, свой процесс. Стиля для него ещё не придумали.

**Предлагаю:** Экспериментальное пиво с необычными ингредиентами или способом приготовления, не относящееся к установленным стилям.

**Почему:** «Пиво вне правил: своя идея, свои ингредиенты» — рекламный шаблон.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:167](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:167>).

### R317. Описание по умолчанию · X1 · Дорада пампеана

**Сейчас:** Аргентинский золотистый эль: мягкий солод, деликатная фруктовость и лёгкая горчинка. Пиво, созданное, чтобы пить его много.

**Предлагаю:** Аргентинский золотистый эль с мягким солодовым вкусом, лёгкими фруктовыми нотами и слабой горечью.

**Почему:** Убрана рекламная концовка «созданное, чтобы пить его много».

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:169](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:169>).

### R318. Описание по умолчанию · X2 · IPA Аргента

**Сейчас:** Аргентинский IPA: местный хмель даёт цитрус и травы, горечь уверенная, но не жёсткая. Южноамериканское прочтение жанра.

**Предлагаю:** Аргентинский IPA с цитрусовыми и травяными нотами местного хмеля, выраженной, но мягкой горечью.

**Почему:** «Южноамериканское прочтение жанра» — штамп культурной рецензии.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:170](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:170>).

### R319. Описание по умолчанию · X3 · Итальянский виноградный эль

**Сейчас:** Итальянский эль с виноградом: сусло местных лоз приносит винную кислинку и ягодный аромат. Пиво с виноградника.

**Предлагаю:** Итальянский эль с виноградным суслом, винной кислинкой и ягодным ароматом.

**Почему:** «Сусло местных лоз» и «пиво с виноградника» — декоративные формулы.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:171](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:171>).

### R320. Описание по умолчанию · X4 · Катарина сауэр

**Сейчас:** Бразильский кислый: свежие тропические фрукты и чистая молочная кислинка в лёгком пшеничном теле. Пиво пляжной жары.

**Предлагаю:** Лёгкое бразильское кислое пиво с тропическими фруктами и чистой молочной кислинкой.

**Почему:** «Пиво пляжной жары» звучит искусственно, «в пшеничном теле» — калька.

- [ ] Одобрить
- [ ] Отклонить
- [ ] Свой вариант: 

Источник: [packages/brewing-core/src/styles/taglines.ts:172](</home/dopefish/projects/nb/packages/brewing-core/src/styles/taglines.ts:172>).
