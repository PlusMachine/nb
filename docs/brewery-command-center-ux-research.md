# Ресёрч UX брю-панелей: анатомия экранов + что люди любят

> Два мультиагентных web-ресёрча с адверсариальной проверкой утверждений, 2026-07-01.
> Цель — заземлить редизайн пульта устройства BrewForge (см. `brewery-command-center-l2-redesign.md`)
> на реальные панели, а не на «дизайн от головы». Дополняет архитектурный ресёрч
> `notes/brewery-command-center-research.md` (тот про безопасность/транспорт, этот — про экран и сентимент).

## Ограничения выборки (читать первым)

- **Ресёрч №1 (анатомия):** из 13 запрошенных продуктов адверсариал-проверку прошли данные только по 5 —
  **CraftBeerPi 4, Brewblox/BrewPi Spark, BierBot Bricks, esp-brew-engine, Brautomat32**. По RAPT, Grainfather,
  Brewfather, Speidel, BrewManiac EX подтверждённых деталей *экрана активной варки* в финальном синтезе не
  осталось (claim'ы отсеялись по бюджету верификации, а не были опровергнуты). Поэтому «общий знаменатель»
  смещён к DIY/опенсорс на Pi/ESP. Детали коммерческих продуктов ниже — из сырых выборок (blog/manual),
  подтверждены слабее.
- **Ресёрч №2 (сентимент):** похвала коммерческим (Grainfather, Brewfather) — из блог-обзоров (Brulosophy 2017,
  Homebrew Finds) и рейтингов сторов; по FOSS (Brautomat32, BrewManiacEx) подтверждено в основном *существование*
  фич из первоисточников, а не измеренный объём любви. Ряд смежных утверждений был ОПРОВЕРГНУТ (см. в конце).

---

## Часть 1 — Анатомия экрана активной варки (что и как показано)

### Общий знаменатель (подтверждён, high)
У всех 5 проверенных систем экран активной варки повторяет один набор:
**текущая t° + целевая уставка · температурно-временной профиль затора (последовательность шагов с
автопереходом) · мощность нагрева (PWM % либо бинарно on/off) · насос/циркуляция · живой график t° во
времени · журнал/комментарии.**
Источники: CraftBeerPi dashboard, BierBot automatic-mode, Brewblox all_widgets, esp-brew-engine, Brautomat32.

### Три философии компоновки
1. **Widget-канва (CraftBeerPi 4):** экран собирается из перетаскиваемых виджетов (Kettle, TargetTemp, Actor
   со слайдером мощности, Steps, Chart, LED, Pipe, KettleControl/auto mode). До 10 дашбордов, edit-mode.
2. **График/схема-центричный (Brewblox):** «герой» — Brewery Builder, живая мнемосхема установки с анимацией
   потока; управление через блоки sensor→setpoint→PID→PWM. **Уставка правится тапом по элементу** (клик по
   нагревателю → PID-диалог). Graph с **двумя осями Y** (t° vs мощность), live-линк к истории.
3. **Guided многопанельный (BierBot):** список шагов слева, диаграммы top-right, комментарии bottom-right;
   транспорт минимальный — только **Stop + Next** (без pause/skip); нагрев/охлаждение бинарно (реле).

### Прямые прецеденты для веб-пульта ESP32
- **Brautomat32** (ESP32, браузер): «Operation happens directly in the browser and is designed for PC, tablet,
  and smartphone». Maischeplan (Rast/Temperatur/Dauer/**autonext**) — контроллер сам держит уставку/таймер и
  прыгает на следующий шаг; ручной Play при выключенном autonext. Manual actuator control + PWM.
- **esp-brew-engine** (ESP32, esp-idf/C++): веб-UI по `http://BrewEngine`, отдельные экраны Control и Schedules,
  **два раздельных PID** (mash и boil) — прямое подтверждение фазового различия затор/кипячение.

### Коммерческие (из сырых выборок, слабее подтверждено)
- **Grainfather Connect** (Brulosophy): живой экран — текущая t° + целевая, имя сессии, **уровень мощности
  ТЭНа**, кнопки Pump и Heat, стрелки ручной подстройки + Set.
- **RAPT / BrewZilla Gen4** (docs.rapt.io, Homebrew Finds): мониторинг с ноутбука/телефона; на лету крутишь
  **скважность насоса** и **уровень мощности ТЭНа**; профили затора программируешь онлайн и заливаешь на
  контроллер; ручной режим — уставка, энергизация элемента через **Play**, насос, рециркуляция; цветной
  наклоняемый экран.
- **Brewfather Brew Tracker** (docs.brewfather.app): авто-таймлайн стадий из рецепта — паузы затора, **внесения
  хмеля по обратному отсчёту кипячения (60/30/15/5/0 мин)** и отдельная стадия **Hop Stand**.

### Безопасность удалённого управления (подтверждено)
Главный документированный приём — **interlock на уровне контроллера, а не UI-модалки**: в Brewblox блок
физически отказывается включаться при конфликте актуаторов (mutex — нельзя одновременно греть и охлаждать),
+ глобальный тумблер «Setpoint enabled». Hold-to-confirm / «крышку» / подтверждающие модалки НИ ОДИН из
выживших источников не показал. → подтверждает нашу модель (firmware dead-man/интерлоки + серверный гейт).

### Терминология (подтверждено): паузы затора = Rasten/rests · затор vs кипячение = mash vs boil · профиль =
Setpoint Profile / Maischeplan · актуаторы = actors/actuators/blocks · циркуляция = circulation · авторежим =
auto mode. **Лакуна:** whirlpool/вирпул и «напоминания о хмеле» не подтверждены (кроме Brewfather Hop Stand).

---

## Часть 2 — Что пивовары любят больше всего (сентимент)

Ранжировано по силе/частоте похвалы (все high, если не указано иное):

1. **Пошаговый гид с уведомлениями** («шаг готов / что дальше / внести хмель / достигнута t°»). Самая
   эмоциональная похвала. Grainfather: *«once the brew has begun, the app receives alerts when steps are
   completed and indicates what's to be done next»*; *«It's like having a permanent brewing assistant who
   doesn't talk back or drink all my beer!»*; *«hit all of my target numbers by simply following the
   instructions on the app»*.
2. **Дашборд «всё с одного взгляда» + ручная правка любого параметра** (Target/Heat%/Pump в реальном времени).
   Grainfather: *«displays the current status of the pump, temperatures, and whether or not the element is
   heating… ability to manually adjust pretty much every aspect»*. Brautomat32: per-kettle карточки Power/Play/Pause.
3. **Живой график t°** (во время и после варки). BrewManiacEx: *«Watching the temperature chart during brew and
   after brew»* (dygraph, реалтайм). Ожидаемая база, не опция.
4. **Чистый, простой, интуитивный UI сам по себе.** Brewfather 4.9★ (~1600 App Store): *«The UI is stellar»*,
   *«simple and intuitive»*; Homebrew Finds: *«clean, responsive, easy to navigate»*.
5. **Паритет телефон/планшет/десктоп.** Brewfather: *«mobile collapses into a single column but still contains
   the same information and gives you the same level of control»*. BrewManiacEx: *«monitor and control the brew
   on your phones, tablets, and computers»*.
6. **Явные режимы Помощник/ручной ↔ Автомат.** BrewManiacEx: *«Manual and Automation brewing process control»*,
   *«Automation is the heart of BrewManiacEx»*; Brautomat32 autonext vs ручной Play.

Дополнительно (подтверждено): гладкий workflow рецепт→варка + встроенные инструменты (расчёт воды, brew-day
таймер) + датчики (Tilt/RAPT Pill/iSpindel); профиль затора с автопрогрессом + адаптивный PID/AutoTune (medium,
один первоисточник); настраиваемый дашборд с перемещаемыми виджетами (medium, один первоисточник).

### Главные UX-боли (чего избегать)
1. **Обрыв связи посреди варки** → всё вручную. Grainfather: *«Keeps loosing connection. Have to time and do
   everything manually»* (high).
2. **Обрыв МОЛЧА убивает алерт «внести хмель».** Grainfather: *«Loss of BT even at 10m. There was no
   notification about the addition of hops!!!»* (medium). → алерты должны жить на сервере, не в браузерной вкладке.
3. **График не обновляется сам, нужен ручной refresh.** RAPT/BrewZilla (Homebrew Finds): *«isn't a continuously
   updating graph, you have to hit refresh in the App»* (medium). Прямой анти-паттерн.
4. **Неинтуитивный «кланки» UI с кривой обучения.** RAPT: *«totally non-intuitive», «clunky», «frustrating»*;
   пробный прогон на воде, чтобы понять раскладку (high). → самоочевидность важнее богатства.

### Опровергнуто при верификации (НЕ считать фактами)
Предпочтение планшета десктопу; критика Brewblox за отсутствие гида/автоматизации/условных таймеров; ошибки
онбординга Speidel; «любимая фича — таймер стартует только по достижении t°»; «control-виджеты Brewblox
пропадают»; «приложение при обрыве настолько деградирует, что нельзя даже переподключиться».

---

## Источники (проверенные, с claim'ами)

Анатомия: openbrewing.gitbook.io (CraftBeerPi dashboard), docs.bierbot.com (automatic-mode, importing-recipes),
brewblox.com (brewery_builder, all_widgets, control_chains, all_blocks, ferment_guide), github.com/jeroen79/esp-brew-engine,
github.com/InnuendoPi/Brautomat32, docs.brewfather.app (brew-tracker), docs.rapt.io (manual-operation, profiles),
brulosophy.com (Grainfather review), homebrewfinds.com (BrewZilla hands-on).

Сентимент: brulosophy.com (Grainfather), apps.apple.com Brewfather, homebrewfinds.com (BrewZilla),
github.com/vitotai/BrewManiacEsp8266, github.com/InnuendoPi/Brautomat32, grainfather.nolt.io/82 (BT-боль),
thehomebrewforum.co.uk, homebrewtalk.com (RAPT threads).
