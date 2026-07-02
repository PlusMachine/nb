# Командный центр пивоварни — дизайн (BrewForge ↔ nb)

> Источник: мультиагентная разведка (лучшие автоматики индустрии) + аудит нашего кода, 2026-07-01.
> Референсы: CraftBeerPi 4, Brewblox/BrewPi, esp-brew-engine, BrewManiac EX, Brautomat32, Brewfather,
> Grainfather, BierBot Bricks, RAPT, PicoBrew, Home Assistant, Node-RED, Grafana, High-Performance HMI/ISA-101,
> ISA-18.2 (alarms), IEC 60204/ISO 13850 (E-stop), watchdog/heartbeat/dead-man.

## Видение

Единый адаптивный веб-командный центр поверх **готового device-scoped провайдера** BrewForge — без
параллельной архитектуры. Две зоны, один transport-агностичный дашборд (различие — лишь источник
телеметрии: `deviceId` vs `batchId`):

- **Зона B — командный центр (device-first):** `/app/devices/[id]` — подключился к пивоварне, видишь
  живой нагрев всех контуров БЕЗ привязки к партии, читаешь что лежит на плате и пушишь рецепты НА плату,
  рулишь авто/ручным/конфигом/графиками. С планшета/телефона/ПК.
- **Зона A — варка партии (batch-first):** `/app/brew-batches/[id]` — управление варкой конкретного
  рецепта как гайдед brew-day (рецепт + журнал + инвентарь + заметки). Это зона B, отфильтрованная по партии.

Иерархия ISA-101: **L1** `/app/devices` (грид пивоварен) → **L2** `/app/devices/[id]` (пульт, зона B) →
**L3** `/app/brew-batches/[id]` (зона A).

## Безопасность удалённого нагрева — 4 жёстких слоя (НЕ дисклеймеры)

Главный вывод критика. «Варка откуда угодно» безопасна только при всех четырёх:

1. **Firmware dead-man** — в Manual нагрев на ПЛАТЕ гаснет по TTL потери heartbeat командного источника
   (30–60с) и по max-длительности `MANUAL_HEAT` (напр. 30 мин → auto-OFF + EXIT_MANUAL). Не зависит от облака.
   Сейчас ни sim, ни контракт прошивки этого не гарантируют. **Блокер для удалённого Manual (Phase 3/6).**
2. **Single-writer control-lease** — одно активное управляющее соединение на устройство; остальные read-only
   с бейджем «управляет другой сеанс» + «Запросить перехват». Тот же heartbeat продлевает lease И кормит
   dead-man. Закрывает last-write-wins между телефоном и планшетом.
3. **Серверный freshness-гейт** — роут команд читает `lastSeen`/телеметрию и control-lease и САМ отклоняет
   опасные команды (`MANUAL_HEAT`/`PWM`-вверх/`START_BREW`/`AUTOTUNE`) при stale или чужом lease (409).
   `ESTOP`/graceful `STOP`/`PWM`-вниз/`CLEAR_FAULT` — всегда (fail-safe). Клиентский `controlsDisabled` —
   UX-подсказка, НЕ граница (обходится прямым POST/фоновым табом).
4. **Heartbeat = одно** — один сигнал продлевает lease И кормит firmware dead-man: ушёл оператор → lease
   истёк И нагрев OFF на плате.

Доп.: интерлоки §5 на плате (OVERHEAT/DRY/SENSOR) защищают от датчиков/перегрева, но НЕ от «включил и ушёл» —
это закрывает именно dead-man. ESTOP в вебе подписан «Аварийный останов (запрос)» + дисклеймер: soft-кнопка
≠ аппаратный E-stop (IEC 60947-5-1); реальная защита — watchdog + dead-man на плате.

## Архитектура телеметрии

**ОДИН общий серверный поллер/кеш на устройство** с фан-аутом на всех подписчиков (L2-стримы, зона A).
L1-плитки берут last-known из `brew_telemetry`/`lastSeenAt` + лёгкий health-пинг — **БЕЗ SSE-петли на плитку**.
Иначе N плиток × M клиентов = N×M poll к слабому ESP32 + запиненные serverless-инстансы.

## Упрощённый control-UX

- **TransportBar** в стиле медиаплеера (Пауза/Продолжить/Пропустить/Стоп) — один тап, optimistic +
  «команда в полёте» + подтверждение по телеметрии + undo-тост + откат при nack.
- **Политика подтверждений:**
  - **Один тап (без модалки):** PAUSE, RESUME, SELECT_RECIPE, MANUAL_SETPOINT, MANUAL_PWM-вниз,
    EXIT_MANUAL, ACK_PROMPT. (Снять текущие ConfirmActionDialog с Паузы/Продолжить.)
  - **Один тап + undo-тост:** SKIP_STAGE.
  - **Hold-to-confirm / крышка:** MANUAL_HEAT(on), ESTOP.
  - **Модалка/двухшаг:** START_BREW, graceful STOP, CLEAR_FAULT, START_AUTOTUNE, SAVE_SETTINGS,
    factory reset, отзыв устройства.
  - **Серверный гейт** дополняет (не заменяет) подтверждение.
- **Conditional visibility** (Home Assistant): контролы видны только когда релевантны (слайдеры — лишь в
  Manual у держателя lease; STOP — лишь во время варки; CLEAR_FAULT — лишь при faultMask; и т.д.) — вместо
  disabled-кладбища.
- **High-Performance HMI / ISA-101:** серо-нейтральный фон, цвет ТОЛЬКО для аномалий/действий; карточка
  «статус → причина → действие»; sparkline в плитке. Mobile-first, dark, keep-screen-awake; thumb-zone для
  частых действий, деструктивные — в труднодоступную зону, tap ≥44px.
- **Графики живого нагрева — ядро:** вторая ось Y (heatDuty%/PWM), линия уставки поверх actual, вертикальные
  аннотации событий (смена стадии, ADD_HOP, авария). **StageTimeline** — интерактивная полоса стадий.
- **Аварии по ISA-18.2:** приоритет по риску, дедбенды против дребезга, state-based suppression штатных
  всплесков при смене стадий, баннер активных + журнал с acknowledge/clear, текст «что + что делать».

## Демо-режим

- **Что симулировать на автоматике (device-sim):** портировать тепловую модель прошивки
  (`dT/dt = K_HEAT·duty/100 − K_LOSS·(T−amb)`, плато кипения, охлаждение) — сейчас темп тянется к уставке
  «волшебно», не реагируя на `heatDutyPct`. Воспроизвести firmware dead-man (потеря heartbeat / max-MANUAL_HEAT
  → heat OFF). Инжект аварий на лету. Round-trip конфига §6.3. Снапшот слота N → DeviceRecipe. Мульти-устройство.
- **Что на сайте:** `createDemoDevice` одним кликом в `/app/devices`. **DEV:** providerId=brewforge +
  localUrl=loopback→локальный device-sim (loopback разрешён вне prod / `BREWFORGE_ALLOW_LOOPBACK_DEVICE`).
  **PROD:** providerId=brewforge-demo → синтетический стаб-провайдер (требует per-device provider dispatch,
  Phase 4.5). Бейдж DEMO + пресет-сценарии (Idle/Mash/Авария/Промпт/«потеря heartbeat → нагрев гаснет»).
- **Альтернатива:** firmware sim-режим уже на плате (`bf_sim.c`, силовые GPIO физически OFF) — малой правкой
  (`SIM_*` в CMD_MAP + `simOn/sim*` в телеметрию) можно гонять реальную FSM/нагрев БЕЗ DS18B20.

## Рецепты «с устройства» (честно)

`DeviceRecipe` (mash/boil-hops/hopStand/cooling) кратно беднее модели nb (нет засыпи/дрожжей/воды/эффективности),
translator односторонний. Поэтому: **pull = read-only снапшот «что на плате»** (+ опц. сидер brew-log);
двусторонний обмен — через привязку слот↔исходный `recipeId` nb (`device_recipe_slots`), НЕ реверс-маппинг.
Полноценный «импорт чужого слота в каталог» не обещаем.

> **ОБНОВЛЕНИЕ 2026-07-01 (решение владельца, UI-редизайн):** «слоты» — деталь прошивки/БД, из UI их убираем
> (явные номера слотов пользователю непонятны). Главный путь — **«Сварить рецепт» → авто-флоу устройства с
> подставленными данными рецепта** (пуш на лету, без ручного «сохранить в слот N»). `device_recipe_slots`/
> `putRecipe(slot)`/`listSlots` остаются как внутренний механизм привязки. Ограничение числа рецептов —
> допустимо, но не называть слотами. Экран управления загруженными рецептами — вторичный «Рецепты пивоварни»,
> без номеров слотов. Подробности — `brewery-command-center-l2-redesign.md` §7–8.

## Пуши/фон — жёсткая зависимость от облака (Phase 6)

Web-push на ADD_MALT/SPARGE/faults и фоновая безопасность работают ТОЛЬКО через always-on консьюмер моста
(`apps/bridge`) + service worker. Браузерная SSE-петля умирает при сворачивании вкладки, Wake Lock
освобождается. **LAN-only пользователю пуши не обещаем.**

## Статус

Phase 0 закрыта (2026-07-01): тепловая модель + sim dead-man (готовы ранее в этой же сессии) +
инжект аварий на лету (`POST /sim/fault`) + рабочий round-trip конфига §6.3 (`GET`/`PUT /config`
против настоящего `DeviceConfigSchema`, клампинг по `CONFIG_FIELD_RANGES`) + `listSlots`/
`readSlotSnapshot` (device-sim `GET /recipes`+`GET /recipe?slot=N` → `DeviceTransport` →
`BrewforgeProvider`) + `createDemoDevice` (идемпотентный экшен + кнопка «Демо-пивоварня» на
`/app/devices`, вне production). Мульти-устройство уже работало и раньше (несколько процессов
`device-sim` с разными `--port`/`--device-id`). Firmware sim-режим (`bf_sim.c`) — вне этого репо.

Phase 1 закрыта (2026-07-01): `device-telemetry-cache` — ОДИН поллер/устройство (Map хабов по
deviceId) с фан-аутом на всех подписчиков (L2 зоны B + дашборд партии зоны A), кеш last-known,
даунсэмпл-персист в `brew_telemetry` (устройство + активная brewing-партия), teardown при уходе
подписчиков (LINGER-грация). Роуты `/api/devices/[id]/{telemetry (SSE), command, telemetry/history}`.
`live-dashboard` + `telemetry-chart` сделаны **transport-агностичными** через `TelemetrySource`
(batch|device) — зоны A/B делят одни компоненты. Пульт L2 `/app/devices/[id]` с вкладками
Обзор/Живой + кнопка «Пульт» из карточки устройства. **Серверный freshness-гейт** (`command-gate.ts`):
опасные команды (START_BREW/AUTOTUNE/MANUAL_HEAT-on/PWM-вверх) отклоняются при stale/недостижимом
устройстве (409 `DEVICE_STALE`); fail-safe (ESTOP/STOP/PAUSE/CLEAR_FAULT/…) — всегда; гейт применён
и к device-, и к batch-роуту команд. Batch-SSE-роут отрефакторен на общий хаб (один опрос
независимо от числа открытых экранов). Проверено HTTP-smoke на живом device-sim: SSE (2 подписчика,
общий поллер), 409 при мёртвом устройстве, ack при живом, SSR пульта. Юнит-тесты: `command-gate`,
`telemetry-source`. Control-lease (одно владение на устройство) — намеренно Phase 2, здесь только
freshness-гейт.

Phase 2 закрыта (2026-07-01): **single-writer control-lease** — таблица `device_control_leases`
(deviceId PK → одно владение/устройство; держатель = userId+sessionId, различает вкладки/приборы
одного юзера), сервис `control-lease.ts` (acquireOrRenew НЕ крадёт чужую валидную аренду; heartbeat/
release/requestTakeover; TTL 45с = паритет с dead-man; транзакция FOR UPDATE против гонок). **Hard
lease-гейт** в обоих command-роутах: управляющие команды без валидной аренды → 409 `NO_CONTROL_LEASE`;
fail-safe (ESTOP/STOP/CLEAR_FAULT/PWM-вниз) — всегда. Роуты `control-lease` под `/api/devices/[id]`
и `/api/brew-batches/[id]` (аренда — на устройство). Клиент: `useDeviceCommand` (per-tab sessionId в
sessionStorage, acquire+heartbeat-loop 15с, release при уходе через keepalive, optimistic/in-flight,
дружелюбный разбор 409, отложенный undo для SKIP). Компоненты: **TransportBar** (медиаплеер
Пауза/Продолжить/Пропустить/Стоп, conditional visibility по стадии), **ControlLeaseBadge** (Вы
управляете / управляет другой + Запросить перехват / вам прислали запрос → Передать),
**HoldToConfirmButton** (ESTOP press&hold), undo-тост через `useToast` (`@nb/ui`). `LiveDashboard` (общий A/B):
сняты модалки с Пауза/Продолжить (один тап), SKIP — один тап + undo-тост, graceful STOP — двухшаг,
ESTOP — hold-to-confirm; рутина активна лишь у держателя аренды. Проверено HTTP-smoke на живом
device-sim: две сессии одного юзера → single-writer (A держит, B read-only), 409 `NO_CONTROL_LEASE`
для B, ESTOP/CLEAR_FAULT без аренды проходят, request-takeover→release→B берёт аренду, START_BREW
у держателя проходит lease+freshness. Юнит-тесты: `commandRequiresLease`. Firmware dead-man на плате
(реальный TTL/heartbeat в прошивке) — Phase 3.

Phase 3 закрыта (2026-07-01): **ручной режим** — `ManualControlCard` (RAPT-style: слайдеры
Target/Heat% с commit по отпусканию → MANUAL_SETPOINT/MANUAL_PWM, тогглы ENABLE HEAT
(вкл — hold-to-confirm, выкл — один тап → MANUAL_HEAT) и PUMP → MANUAL_PUMP, вход/выход
ENTER/EXIT_MANUAL). «применяется…» до подтверждения телеметрией — не врём «включено» заранее.
**Device-keepalive**: пока карта открыта и нагрев включён, портал периодически шлёт команду
(<dead-man TTL) — плата держит нагрев; ушёл оператор/закрыл вкладку → keepalive прекращается →
sim/firmware dead-man гасит нагрев (безопасность «включил и ушёл»). Всё эксклюзивно через
control-lease + серверный lease/freshness-гейт (Phase 2). **AlarmsPanel (ISA-18.2)**: активные
аварии из faultMask с приоритетом по риску (critical/high/medium), текст «что + что делать»,
acknowledge (локально) + Сбросить аварии (CLEAR_FAULT, fail-safe), журнал по фронтам raised/cleared
(дедуп/анти-дребезг). Оба компонента интегрированы в общий `LiveDashboard` (зоны A/B) с conditional
visibility (слайдеры — лишь в MANUAL у держателя аренды). Проверено HTTP-smoke на живом device-sim:
ENTER_MANUAL→SETPOINT→PWM→HEAT(on)→PUMP→EXIT через портал (lease+freshness+аудит, все ack ok),
нагрев реально растёт от duty (тепловая модель), инжект аварии→FAULT→CLEAR_FAULT→IDLE, SSR пульта
рендерит AlarmsPanel+ManualControlCard. Помощник/Автомат уже покрыты FSM варки + промптами
(зона A) — отдельного режима не требуют.

Phase 4 закрыта (2026-07-01): **рецепты «на борту»** — таблица `device_recipe_slots`
(уникум `(deviceId, slot)` = одна привязка на слот; `recipeId` FK `ON DELETE SET NULL`
+ денормализованный `recipeName`, переживающий удаление/переименование рецепта;
миграция 0043). Транспорт `putRecipe(recipe, slot?)` (LAN — `?slot=N`; облако слот
не адресует — прошивка выбирает сама, привязка к вернувшемуся слоту) + провайдер
`pushRecipeToDevice` (device-first push БЕЗ партии: резолв устройства → трансляция
снимка плана → запись в слот). Сервис `features/devices/onboard-recipes.ts`:
`getOnboardRecipes` (listSlots платы × привязки nb через чистую `mergeOnboardSlots`),
`getSlotSnapshot` (read-only «что на плате»), `pushRecipeToSlot`
(`getOwnedRecipeById`→`buildBrewPlanSnapshot`→`pushRecipeToDevice`→upsert привязки),
`listPushableRecipes` (пикер). Роуты `/api/devices/[id]/recipes` (GET список+привязки,
POST push с валидацией) и `/recipes/[slot]` (GET снапшот); `CLOUD_UNSUPPORTED`→501 с
понятным текстом. **OnboardRecipesPanel** + вкладка «Рецепты» в пульте L2: «что на
плате» (слоты, источник nb, read-only просмотр снапшота) + «записать на плату»
(пикер рецепта×слот, двухшаг на перезапись занятого слота, occupied — source of truth
платы). **Честно** (§5): снапшот = просмотр, НЕ импорт в каталог (нет кнопки импорта);
двусторонний обмен только через привязку слот↔recipeId. Юнит-тесты: `mergeOnboardSlots`
(занятость с платы, привязка/осиротевший рецепт/pushedAt→ISO), slot-таргетинг
`lanTransport.putRecipe`. Проверено HTTP-smoke на живом device-sim: `PUT /recipe?slot=3`
→`{slot:3}`, `GET /recipe?slot=3` (снапшот), `GET /recipes` (слот 3 назван), пустой
слот→404 (→null), вне диапазона→422. Пуш по облаку работает (прошивка выбирает слот),
перечень/чтение слотов — только LAN/sim (панель показывает объяснение).

Phase 4.5 закрыта (2026-07-01): **per-device provider dispatch + прод-демо без железа**.
Reference-симулятор `SimDevice` вынесен из apps/device-sim в общий пакет
**`@nb/brewforge-sim`** (зависит только от протокола) — единый источник поведения
устройства БЕЗ параллельной архитектуры: тот же класс гоняет и standalone device-sim
(HTTP/WS/MQTT), и портал. К классу добавлено ленивое `advanceToNow` (продвижение по
реальному времени БЕЗ фонового setInterval, с кап-catch-up — для pull-рантайма веба).
**`simTransport`** — in-process `DeviceTransport` поверх `SimDevice` (Map по deviceId,
ленивое продвижение перед каждым обращением). Ключ архитектуры: `DeviceTransport` уже
имеет нужный интерфейс, поэтому `transportForDevice` ДИСПАТЧИТ по `providerId`
(`brewforge-demo`→simTransport, иначе LAN/облако) — вся ownership/audit-логика провайдера
переиспользуется без дублирования. **`brewforgeDemoProvider`** (те же методы, id
`brewforge-demo`) зарегистрирован в реестре; `getProviderForDevice(device)` = getProvider
по `device.providerId`. Call sites с устройством под рукой (onboard-recipes, config-роут,
device command-роут, profiles) переведены на per-device dispatch; `device-telemetry-cache`
принимает `providerId` (дефолт brewforge; device-роуты прокидывают явно). `createDemoDevice`:
dev — loopback device-sim (providerId brewforge, полный LAN-путь), **prod — стаб**
(providerId `brewforge-demo`, без localUrl, in-process SimDevice) — «Демо-пивоварня»
доступна ВЕЗДЕ («попробуй до покупки»), кнопка больше не гейтится. **DEMO-бейдж** в списке
устройств и в пульте L2 (метка по hardwareId `demo-*`). Демо корректно и без per-device
dispatch (транспорт диспатчится ВНУТРИ методов провайдера) — dispatch добавлен как
правильная абстракция и future-proofing (RAPT и др.). Юнит-тесты: `simTransport`
(телеметрия/слоты/putRecipe в слот/SELECT_RECIPE/config-клампинг round-trip). Проверено:
typecheck `@nb/brewforge-sim`/web/device-sim зелёные; device-sim по-прежнему стартует после
извлечения (telemetry 200, 8 слотов).

Phase 5 закрыта (2026-07-01): **HMI-графики + StageTimeline + L1 командный центр**.
**HMI-график** (`telemetry-chart.tsx`): вторая ось Y (нагрев %, деления 0/50/100
справа) отдельно от левой оси температур; линия уставки поверх факта; вертикальные
**аннотации событий** (смены стадий/аварии) с чёткими HTML-подписями-оверлеем (не
тянутся вместе с `preserveAspectRatio="none"` viewBox), деклаттер по мин-зазору,
авария подписывается всегда; палитра по High-Performance HMI / ISA-101 — нейтральные
полосы стадий, цвет ТОЛЬКО для аномалий (авария — красным). Чистое ядро аннотаций
`telemetry-annotations.ts` (`deriveStageTransitions` — метка на фронте смены стадии,
null-точки не рвут детект; `stageShortLabel`). **StageTimeline** (`stage-timeline.tsx`
+ чистое ядро `stage-timeline.ts`): 16 значений `bf_stage_t` свёрнуты в 5 макро-стадий
(Затор → Кипячение → Хмелестояние → Охлаждение → Готово), пройдено/идёт/впереди с
долей заполнения текущей (для затора — по номеру паузы `(idx+доля)/nSteps`, не только
по таймеру); overlay-состояния (ожидание/отложенный старт/ПАУЗА позиционируется по
`pausedFrom`/РУЧНОЙ/АВАРИЯ); интерактив — клик по сегменту раскрывает состав/статус.
Кормится телеметрией из общего `LiveDashboard` (зоны A/B) — своего SSE не поднимает.
**L1 командный центр**: `/app/devices` — грид **плиток** (`device-tile.tsx`): last-known
срез (темп/уставка/стадия/нагрев) + sparkline температуры + бейдж активных аварий
(единственный цветовой акцент, приоритет через общий `faults.ts` — вынесен из
`AlarmsPanel`, единый источник) + свежесть «обновлено N назад» (устаревшее гасится).
Данные — ОДНИМ оконным запросом `listDeviceTiles` (`tiles.ts`: `row_number() … ≤ N`
на устройство, faultMask из payload) + лёгкий health-опрос `/api/devices/tiles` раз в
15с (**БЕЗ per-tile SSE** — N×M-защита слабого ESP32). Клик «Пульт» → L2. Форма привязки
свёрнута (грид — герой L1), демо/отзыв сохранены. Клиент-safe помощник свежести
(`classifyTileFreshness`) вынесен в `contracts.ts` — плитка клиентская, не тянет `@nb/db`.
Юнит-тесты: `stage-timeline` (8), `telemetry-annotations` (4), `faults` (5),
`tiles`/freshness (3) — все зелёные; typecheck web и `next lint` по изменённым чисты.
Живая проверка UI грида/графиков на device-sim — следующий ручной шаг.

Phase 6a закрыта (2026-07-01): **веб-пуш (фундамент)** — «пуш на телефон вне дома».
Новый серверный пакет **`@nb/push`** — единственная точка зависимости `web-push`:
чистое построение payload (`notification.ts`, тестируется) + отправка подписчикам
(`send.ts`: VAPID из env, мёртвые подписки 404/410 вычищаются, best-effort — не
роняет вызывающего). Таблица **`push_subscriptions`** (миграция 0044, подписка на
ПОЛЬЗОВАТЕЛЯ, endpoint уникален → upsert). Чистая детекция фронтов в протоколе
**`detectTelemetryEdges`** (`@nb/brewforge-protocol/notify.ts`): новый промпт по
смене `promptSeq` (идемпотентно), авария — только по вновь поднятым битам; `prev=null`
(первый кадр) лишь сидирует — **анти-спам при рестарте моста**. Диспетчер — **мост**
(`apps/bridge/notify.ts`, вклейка в `handleTelemetry`): in-memory память фронтов по
deviceId → `sendPushToUser` владельцу (always-on ⇒ пуши идут при закрытом портале).
Портал: `features/notifications` (contracts/service upsert/opt-in-хук + карточка
«Включить уведомления» в L1), роуты `/api/notifications/{subscribe,unsubscribe,
public-key,test}`, service worker `public/sw.js` (push + notificationclick →
диплинк на пульт, `tag`+`renotify` схлопывает повторы). VAPID в env (`.env.example`
+ серверная схема), пусто = opt-in скрыт. Next: `@nb/push` в `transpilePackages`,
`web-push` в `serverExternalPackages`. Юнит-тесты: `push-events` (10 — детекция
фронтов + payload); typecheck protocol/shared/db/push/bridge/web зелёные, `next lint`
чист, миграция применена. Живая e2e (реальный push-сервис/браузер) — ручной шаг.

Phase 6b/6c закрыта (2026-07-01): **cloud-плечо dead-man + индикация канала**.
**6b (cloud-плечо dead-man)** — ВТОРИЧНАЯ сеть безопасности (первичная — firmware
dead-man на плате). Чистый детектор `isManualHeatActive` (`@nb/brewforge-protocol`):
плата в MANUAL и нагрев командуется (SSR ON или ненулевая скважность). Мост
(`apps/bridge/cloud-deadman.ts`, в `handleTelemetry`) ловит «ручной нагрев + аренда
управления ИСТЕКЛА» (`getLeaseStateForDevice`: триггер именно `expired` — портал
управлял и пропал; `none` = локальное использование, не тревожим) и: **всегда** шлёт
пуш «проверьте пивоварню» (`cloudDeadmanNotification`); **опц.** под явным
`BREWFORGE_CLOUD_DEADMAN_STOP` шлёт `EXIT_MANUAL` (автономная актуация из облака
рискованна → off по умолчанию). Дедуп — one-shot на эпизод (сброс при снятии условия).
**6c (честная индикация канала)** — `deviceChannel(device)` в провайдере (зеркалит
порядок веток `transportForDevice`: демо→облако→LAN), тип `DeviceChannel` в
client-safe `telemetry-source.ts`. Бейдж «Канал: LAN (прямой) / Облако (через мост)»
в `LiveDashboard` (обе зоны A/B), считается на сервере (страницы пульта и варки),
демо/неизвестный — без бейджа. Юнит-тесты: `isManualHeatActive` (4, в `push-events`);
typecheck protocol/push/bridge зелёные, мои области web чисты, `next lint` чист.
Живая e2e (мост+брокер+sim, потеря heartbeat в MANUAL → пуш; LAN vs облако бейдж) —
ручной шаг.

Дальше — **прод-хардненинг** (вне фаз): HTTPS для web-push, VAPID в секрет-менеджере,
broker TLS+per-device ACL, короткоживущий bridge-ticket вместо `nb_session`,
single-instance edge-память моста (или вынести в БД), rate-limit пушей, per-device
opt-in автономного STOP вместо глобального env.

## Дорожная карта

| Phase | Что | Effort | Результат |
|---|---|---|---|
| **0** ✅ | Демо без железа (dev): тепловая модель в sim + sim dead-man + инжект аварий + round-trip конфига + readSlotSnapshot + `createDemoDevice` (loopback→sim) | L | Один клик «Демо-пивоварня» → виртуальный контроллер, неотличимый в UI и честный по безопасности. Весь UX зон A/B тестится без DS18B20 |
| **1** ✅ | device-telemetry-cache (один поллер/устройство) + роуты `/api/devices/[id]/{telemetry,command,history}` + рефактор live-dashboard в transport-агностичный + пульт L2 (Обзор/Живой) | L | Зайти на устройство, смотреть живой нагрев и базово рулить БЕЗ партии; опасное гейтится на сервере |
| **2** ✅ | TransportBar + useDeviceCommand (optimistic+undo) + control-lease + ControlLeaseBadge; снять модалки с рутины | M | Рутина в один тап; одно владение на устройство; подтверждение только на опасное |
| **3** ✅ | **Ручной режим** (блокер: firmware dead-man + sim-паритет) + ManualControlCard + AlarmsPanel | M | Помощник/Автомат/Ручной с override мощности БЕЗОПАСНО для удалённого нагрева |
| **4** ✅ | Рецепты: read-only снапшот С платы + push НА плату + `device_recipe_slots` + OnboardRecipesPanel | L | «Подключиться и увидеть что на пивоварне» + двусторонний push с привязкой к рецепту nb |
| **4.5** ✅ | Per-device provider dispatch + prod-демо (стаб-провайдер) | M | Демо в проде без железа («попробуй до покупки») |
| **5** ✅ | HMI-графики (вторая ось/аннотации) + StageTimeline + L1 командный центр (грид плиток) | L | Командный центр: список пивоварен → статус → пульт; графики/аварии промышленного уровня |
| **6a** ✅ | Веб-пуш: `push_subscriptions` + `@nb/push` + мост-диспетчер (промпт/авария) + service worker + opt-in | L | Пуш на телефон вне дома: «Засыпьте солод» / «Авария» → тап открывает пульт |
| **6b/6c** ✅ | cloud-плечо dead-man (push-alert + STOP opt-in) + честная индикация канала LAN/облако | L | Вторичная сеть безопасности удалёнки + честный канал связи в дашборде |
| хардненинг | HTTPS/VAPID-секреты + broker TLS+ACL + bridge-ticket + single-instance edge-память + rate-limit | M | Прод-готовность облачного пути (вне фазовой нумерации) |

## Ключевые компоненты/роуты (reuse/extend/new)

- **new service:** `device-telemetry-cache.ts` (общий поллер), `control-lease.ts` + таблица
  `device_control_leases`, `provider-registry.ts` (`getProviderForDevice` по `providerId`),
  таблица `device_recipe_slots`, `createDemoDevice` (action).
- **new api:** `/api/devices/[id]/{telemetry, command, telemetry/history, control-lease, recipes}`.
- **new route:** `/app/devices/[id]/page.tsx` (пульт L2, вкладки Обзор/Живой/Ручной/Рецепты на борту/Настройки).
- **new component:** ControlLeaseBadge, ManualControlCard, TransportBar, useDeviceCommand, AlarmsPanel,
  StageTimeline, OnboardRecipesPanel, DeviceTile, EstopButton/HoldToConfirm.
- **extend:** `live-dashboard.tsx` (transport-агностичный), `telemetry-chart.tsx` (вторая ось/аннотации),
  `transport.ts`/`brewforge-provider.ts` (listSlots/readSlotSnapshot), `actions.ts` (graceful STOP),
  `sim-device.ts` (тепловая модель + dead-man + аварии + конфиг + снапшот), `navigation.ts`,
  `@nb/brewforge-protocol` (heartbeat/manualHeatDeadline + опц. SIM_*).
- **firmware:** dead-man heartbeat для MANUAL heat (обязателен для Phase 3/6) + опц. SIM_* в CMD_MAP.
- **reuse:** `device-config-form.tsx`, `confirm-action-dialog.tsx` (только для опасного).

## Принятые решения (рекомендованные дефолты)

1. Firmware dead-man: heartbeat TTL 30–60с + max MANUAL_HEAT 30 мин → heat OFF на плате. (Безопасность не от облака.)
2. Control-lease: hard (сервер отклоняет запись без валидного lease; ESTOP/STOP всегда).
3. Freshness-гейт: на сервере (клиент — только UX).
4. Телеметрия: один общий кеш/устройство + фан-аут; L1 на last-known.
5. Рецепты с платы: read-only снапшот + слот↔recipeId, без реверс-маппинга.
6. Prod-демо: отдельная задача Phase 4.5 (не «готово» в Phase 0).
7. Пуши: только через облачный мост (Phase 6), не на LAN.
8. ESTOP: «Аварийный останов (запрос)» + дисклеймер + hold-to-confirm.
