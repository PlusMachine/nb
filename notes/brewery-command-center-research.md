# Ресёрч: командный центр пивоварни — что перенять из индустрии

> Результат мультиагентной разведки (web) + аудита нашего стека, 2026-07-01.
> Дизайн-план и дорожная карта (что строим) — в `docs/brewery-command-center.md`.
> Это «сырьё»: что изучено и какие принципы вынесены.

## Изученные референсы (20)

**Открытые контроллеры пивоварения:**
- CraftBeerPi 4 (cbpi4ui) — drag-drop дашборды (до 10), виджеты оборудования, actor = кнопка-тумблер, dummy actor для теста.
- Brewblox / BrewPi Spark — Brewery Builder (мнемосхема контуров), Session Log с аннотациями, Mutex/min-ON-OFF/hold-time интерлоки, spark-sim.
- esp-brew-engine (jeroen79) — до 10 динамических нагревателей, MQTT-телеметрия, BeerXML, раздельный PID кипячение/затирание.
- BrewManiac EX (vitotai, ESP8266) — web UI по WebSocket, hold-to-confirm на нагрев, «крышка» на опасное.
- Brautomat32 (InnuendoPi, ESP32) — адаптивный PID, транспортная панель управления, webhook-исполнители.

**Коммерческие приложения/облака:**
- Brewfather — Brew Controller (Beta) + Brew Tracker, гайдед brew-day, live-мониторинг брожения, BeerXML round-trip помнит источник, 20+ интеграций.
- Grainfather Community + Connect — G-Series brew-day guide, профили оборудования.
- BierBot Bricks — облако/телефон, «всё с одного взгляда», PID без перерегулирования на дешёвых реле.
- RAPT (Portal + Brew app + BrewZilla Gen4) — Dashboard device-first, Manual card (Target/Heat%/Pump% + тогглы ENABLE HEAT/PUMP/PID).
- Tilt / iSpindel / BrewSpy — плавающие гидрометры, экосистема брожения.
- PicoBrew — graceful degradation, тройной вход в старт варки.

**Промышленность / IoT:**
- High-Performance HMI / ISA-101 — серо-нейтральный фон, цвет только для аномалий; экран «статус→причина→действие».
- ISA-18.2 Alarm Management — приоритет по риску, дедбенды, state-based suppression, acknowledge/clear.
- Home Assistant (Lovelace/Sections) — conditional UI (контролы видны только когда релевантны), single coordinator.
- Node-RED Dashboard 2.0, Grafana Live — живые time-series, фан-аут из одного источника.
- E-stop стандарты (IEC 60204 / ISO 13850 / IEC 60947-5-1 / NFPA 79) — soft-кнопка ≠ аппаратный E-stop.
- Remote IoT safety — watchdog / heartbeat / dead-man switch.
- Промышленные brewhouse HMI/SCADA (Ignition, Brewmation, Portland Kettle Works).

## Принципы, вынесенные в дизайн (что перенимаем)

1. **Безопасность удалённого нагрева = firmware dead-man, а не дисклеймер.** Силовой выход на таймере:
   потеря heartbeat командного источника → ТЭН OFF на плате; max-длительность MANUAL_HEAT → auto-OFF. (PicoBrew
   graceful degradation, SCADA/PLC watchdog, IEC 60730 safety-timer.)
2. **Single-writer / control authority** — один управляющий сеанс на устройство (control-lease), остальные
   read-only. (HMI lockout, OPC-UA write-authority, SCADA-арбитраж.)
3. **Гейт свежести — на сервере, не на клиенте** (zero-trust к UI; SCADA-gateway). Клиентский disabled
   обходится прямым POST/фоновым табом.
4. **Транспортная панель медиаплеера** вместо модалки на каждое действие (Brautomat32, Grainfather, BierBot, RAPT).
5. **Один поллер/кеш телеметрии на устройство** с фан-аутом, не SSE-петля на клиента (Grafana Live, HA coordinator).
6. **Опасность снимают интерлоки на плате**, но они про датчики/перегрев — не про «включил и ушёл» (это dead-man).
7. **Демо-режим — first-class** (Brewblox spark-sim, CraftBeerPi dummy actor): dev loopback→sim неотличим в UI.
8. **Pull рецепта = read-only «что на плате»**, не импорт каталожного рецепта (DeviceRecipe беднее модели nb);
   двусторонний обмен через привязку слот↔recipeId (как BeerXML round-trip Brewfather помнит источник).
9. **Пуши/фон = функция облачного always-on consumer + service worker**, не свойство LAN-сеанса.
10. **Manual card** (RAPT: Target/Heat%/Pump% + тогглы) ложится 1:1 на ENTER_MANUAL/MANUAL_*; ENABLE HEAT
    обвязан lease + server-gate + firmware dead-man.
11. **Командный центр device-first** (Brewblox Brewery Builder, RAPT Dashboard): список пивоварен → пульт.
12. **Графики живого нагрева — ядро:** вторая ось Y (heatDuty%/PWM), линия уставки поверх actual, аннотации событий.
13. **High-Performance HMI / ISA-101:** серо-нейтраль, цвет только для аномалий; sparkline в карточке.
14. **Аварии ISA-18.2:** приоритет, дедбенды против дребезга, state-based suppression, текст «что + что делать».
15. **Conditional UI** (HA): контролы видны только когда релевантны — вместо disabled-кладбища.
16. **Честность по ESTOP:** soft-кнопка = «Аварийный останов (запрос)» + дисклеймер; hold-to-confirm/крышка.
17. **Optimistic + «в полёте» + ack + undo/откат**; но для нагрева — «применяется…» до реального ack платы, не «включено».
18. **Mobile/планшет-first:** thumb-zone для частого, деструктивное — в край, tap ≥44px, фидбек <100мс,
    dark, keep-screen-awake; звук/пуши на prompts/faults — только при облачном мосте.

## Открытые развилки (рекомендованные дефолты приняты в дизайне)

1. Firmware dead-man: **heartbeat TTL 30–60с + max MANUAL_HEAT 30 мин → heat OFF** (не от облака). [рек.]
2. Control-lease: **hard** (сервер отклоняет запись без валидного lease; ESTOP/STOP всегда). [рек.]
3. Freshness-гейт: **на сервере** (клиент — только UX). [рек.]
4. Телеметрия L1+L2+A: **один общий кеш/устройство + фан-аут**; L1 на last-known. [рек.]
5. Рецепты с платы: **read-only снапшот + слот↔recipeId**, без реверс-маппинга. [рек.]
6. Prod-демо: **отдельная задача Phase 4.5** (per-device provider dispatch). [рек.]
7. Пуши: **только через облачный мост (Phase 6)**, не на LAN. [рек.]
8. ESTOP UI: **«Аварийный останов (запрос)» + дисклеймер + hold-to-confirm**. [рек.]
9. Статус партии↔устройства: **двунаправленно** (степпер шлёт реальные команды + зеркалит телеметрию). [рек.]
10. Где Manual: **в обеих зонах, эксклюзивно через общий control-lease**. [рек.]
