# Нагрузочные тесты NB

Локальный одноразовый стенд запускает production Next.js, PostgreSQL, MQTT и bridge. Скрипты проверяют HTTP-статус и содержимое HTML/JSON/PNG/PDF, а realtime-тест измеряет доставку от MQTT publish до сообщения авторизованному WebSocket-клиенту. Итоговая оценка железа: `docs/loadtest-2026-10-13.md`.

## Подготовка

Нужны Docker Compose, установленные зависимости проекта и Node.js 24. Генератор работает на хосте, отдельно от контейнеров с ограничениями ресурсов. Выполнять из корня репозитория. Сборку лучше делать в CI или до запуска runtime.

```bash
export LOADTEST_OUTPUT=.local-artifacts/loadtest-2026-10-13
export DATABASE_URL=postgresql://postgres:loadtest-local-only@127.0.0.1:55432/nb_loadtest
export LOADTEST_UID=$(id -u)
export LOADTEST_GID=$(id -g)
mkdir -p "$LOADTEST_OUTPUT"
docker compose -f scripts/loadtest/compose.yml up -d postgres mqtt

NODE_ENV=development node node_modules/tsx/dist/cli.mjs packages/db/scripts/seed.ts
NODE_ENV=development node node_modules/tsx/dist/cli.mjs --tsconfig apps/web/tsconfig.json apps/web/scripts/seed-sample-data.ts --email qa.user@localhost
node scripts/loadtest/prepare.mjs

# next build обновляет next-env.d.ts: сохраняем текущую пользовательскую версию.
cp apps/web/next-env.d.ts "$LOADTEST_OUTPUT/next-env.before.d.ts"
(
  cd apps/web
  NODE_ENV=production APP_URL=https://nb-loadtest.invalid NEXT_DIST_DIR=.next-loadtest NEXT_TELEMETRY_DISABLED=1 node ../../node_modules/next/dist/bin/next build
)
cp "$LOADTEST_OUTPUT/next-env.before.d.ts" apps/web/next-env.d.ts

docker compose -f scripts/loadtest/compose.yml up -d web bridge
```

`prepare.mjs` создаёт 50 разных пользователей, действительные сессии на 6 часов, копии склада и шести sample-рецептов и 50 устройств. База должна называться строго `nb_loadtest` и находиться на localhost. Повторный запуск заменяет только аккаунты `loadtest-*@localhost`. Файл `fixtures.json` содержит тестовые cookie и записывается с правами 0600 в игнорируемый каталог. Его не следует публиковать.

Для приведённого в отчёте запуска витрина дополнительно содержала 30 рецептов штатного public seed. Их отсутствие в минимальной подготовке меняет размер набора; фактические количества всегда записываются в `dataset.json`.

## Обычная работа пользователей

Запустить три команды одновременно в отдельных терминалах, сохранив переменные `DATABASE_URL` и `LOADTEST_OUTPUT`:

```bash
LOADTEST_USERS=50 LOADTEST_SECONDS=120 LOADTEST_THINK_MS=5000 LOADTEST_NAME=2cpu-mixed-50-users node scripts/loadtest/http.mjs
LOADTEST_DEVICES=50 LOADTEST_SECONDS=125 LOADTEST_NAME=2cpu-realtime-50-devices node scripts/loadtest/realtime.mjs
LOADTEST_SECONDS=130 LOADTEST_NAME=2cpu-resources node scripts/loadtest/monitor.mjs
```

Один виртуальный пользователь последовательно открывает публичные страницы, личный кабинет, склад и свои рецепты, вызывает поиск ингредиентов, поиск по складу и API рецептов по стилю. Между действиями есть пауза 4–6 секунд. Каждый пользователь имеет свой аккаунт и IP тестового диапазона; ограничители запросов остаются включёнными. `TRUSTED_PROXY_HOPS=1` в стенде имитирует передачу адреса одним доверенным reverse proxy.

## Предельная нагрузка и рендер

Следующие HTTP-тесты выполняются по очереди, чтобы не смешивать результаты:

```bash
LOADTEST_USERS=50 LOADTEST_SECONDS=45 LOADTEST_THINK_MS=0 LOADTEST_NAME=2cpu-mixed-stress-50 node scripts/loadtest/http.mjs
LOADTEST_MODE=search LOADTEST_USERS=10 LOADTEST_SECONDS=30 LOADTEST_THINK_MS=0 LOADTEST_NAME=2cpu-search-stress-10 node scripts/loadtest/http.mjs
LOADTEST_MODE=workspace LOADTEST_USERS=5 LOADTEST_SECONDS=60 LOADTEST_THINK_MS=3000 LOADTEST_NAME=2cpu-workspace-5-users node scripts/loadtest/http.mjs
```

Режим `workspace` проверяет карточку и редактор собственного рецепта, PNG-превью наклейки, PDF-лист A4 и историю своего устройства. Для непустой истории сначала должен пройти realtime-тест. Режим `search` использует пять разных непустых запросов. Все статистики задержки относятся к получению и проверке полного ответа, а не только первого байта.

## Сравнение CPU

Начальный профиль ограничивает суммарный CPU до 2: web 0,9; PostgreSQL 0,75; bridge 0,25; MQTT 0,1. Профиль 4 CPU получается удвоением этих лимитов. RAM контейнеров при сравнении сохраняется: 1536, 1024, 256 и 128 MiB соответственно.

```bash
docker update --cpus=1.8 nb-loadtest-web-20261013
docker update --cpus=1.5 nb-loadtest-postgres-20261013
docker update --cpus=0.5 nb-loadtest-bridge-20261013
docker update --cpus=0.2 nb-loadtest-mqtt-20261013
```

После изменения повторить тесты с новыми `LOADTEST_NAME`. CPU-лимит ограничивает процессорное время на текущем хосте; он не воспроизводит скорость процессора и диска конкретного VPS.

## Накопленная телеметрия

После realtime-теста 50 устройств можно добавить 100 тысяч валидных исторических кадров, по 2000 на устройство, и нагрузить API графиков:

```bash
node scripts/loadtest/history.mjs
LOADTEST_MODE=history LOADTEST_USERS=50 LOADTEST_SECONDS=60 LOADTEST_THINK_MS=5000 LOADTEST_NAME=history-50-users node scripts/loadtest/http.mjs
```

Два сценария читают последние 1000 точек и временное окно в 30 дней. Набор содержит примерно 5,6 часа истории на устройство при интервале 10 секунд; это проверка размера ответа, не модель месячного объёма.

## Результаты и завершение

Каждый тест сохраняет JSON под своим именем в `LOADTEST_OUTPUT`. `monitor.mjs` записывает отдельные выборки Docker CPU, памяти и I/O. Ошибочный HTTP-ответ, пустая ожидаемая коллекция, невалидный файл или потерянное realtime-сообщение дают ненулевой код завершения. Обращения разрешены только к локальному стенду.

```bash
docker compose -f scripts/loadtest/compose.yml down -v
```

Эта команда удаляет одноразовые сервисы и тестовую БД. Она не касается основного `docker-compose.yml`, данных приложения или каталога результатов.
