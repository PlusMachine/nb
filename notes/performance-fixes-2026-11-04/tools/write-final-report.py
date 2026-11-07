import hashlib
import json
import re
import subprocess
from pathlib import Path

out = Path(__file__).resolve().parent.parent
repo = out.parent.parent
summary = json.loads((out / "summary.json").read_text())
recipes = json.loads((out / "recipes-desktop.json").read_text())
mobile_recipes = json.loads((out / "recipes-mobile-slow-1.json").read_text())
before_recipes = json.loads((out.parent / "performance-audit-2026-11-04/recipes-desktop.json").read_text())
checks = json.loads((out / "browser-final-checks.json").read_text())
http = json.loads((out / "http-smoke.json").read_text())
assert all(row["after"]["cls"] < .1 for row in summary["mobile"])
assert all(row["after"]["contrastPass"] for row in summary["lighthouse"])
assert recipes["htmlTransfer"] + recipes["resourceTransfer"] < 1.5 * 1024 ** 2
assert not mobile_recipes.get("failure") and mobile_recipes["status"] == 200
assert mobile_recipes["cls"] < .1 and recipes["cls"] < .1
assert not checks["errors"]
for row in http["records"]:
    assert all(sample["status"] == 200 for sample in row["samples"])
for name, count in [("search-final.log", 6), ("e2e-final.log", 9), ("pwa-final.log", 2)]:
    assert re.search(rf"\b{count} passed\b", (out / "tools" / name).read_text())
unit = (out / "tools/all-unit-final.log").read_text()
assert re.search(r"4434 passed", unit)
paths = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "apps/web"], cwd=repo, text=True).splitlines()
paths = sorted({p for p in paths if (repo / p).is_file() and Path(p).suffix in [".ts", ".tsx", ".js", ".css", ".woff2"] and p not in ["apps/web/next-env.d.ts", "apps/web/tsconfig.json"]})
env = json.loads((out / "environment.json").read_text())
env["buildId"] = (repo / "apps/web/.next-perf-verified-20261104/BUILD_ID").read_text().strip()
env["sourceSha256"] = {p: hashlib.sha256((repo / p).read_bytes()).hexdigest() for p in paths}
(out / "environment.json").write_text(json.dumps(env, ensure_ascii=False, indent=2) + "\n")

def sec(value):
    return f"{value / 1000:.2f}".replace(".", ",")

def decimal(value):
    return f"{value:.3f}".replace(".", ",")

names = {"catalog": "Каталог", "calculator": "Калькулятор крепости", "editor": "Новый рецепт"}
mobile_rows = []
for row in summary["mobile"]:
    a, b = row["before"], row["after"]
    mobile_rows.append(f"| {names[row['name']]} | {sec(a['lcpMs'])} → {sec(b['lcpMs'])} с | {decimal(a['cls'])} → {decimal(b['cls'])} | {round(a['transferBytes']/1024)} → {round(b['transferBytes']/1024)} КиБ |")
lh_rows = []
for row in summary["lighthouse"]:
    a, b = row["before"], row["after"]
    lh_rows.append(f"| {names.get(row['name'], 'Рецепты')} | {round(a['scores']['performance']*100)} → {round(b['scores']['performance']*100)} | {round(a['scores']['accessibility']*100)} → {round(b['scores']['accessibility']*100)} | {sec(b['metrics']['largest-contentful-paint'])} с |")
old_bytes = before_recipes["htmlTransfer"] + before_recipes["resourceTransfer"]
new_bytes = recipes["htmlTransfer"] + recipes["resourceTransfer"]
reduction = (1 - new_bytes / old_bytes) * 100
requests = sum(len(row["samples"]) for row in http["records"])
report = f'''# Исправления быстродействия NB

4 ноября 2026 года. Исправлены восемь пунктов [исходного аудита](../performance-audit-2026-11-04/README.md). Главная открывается с обеими этикетками, рецепты загружают уменьшенные изображения, ввод поиска согласован с адресом и результатами. Проверена production-сборка на изолированной копии локальной базы.

## Результат повторных замеров

Список рецептов на desktop передал **{old_bytes / 1024**2:.2f} → {new_bytes / 1024**2:.2f} МиБ**, сокращение **{reduction:.1f}%**. На мобильном профиле загрузка ресурсов завершилась за **{sec(mobile_recipes['loadMs'])} с**; в исходном аудите она не завершилась за 90 секунд. CLS списка уменьшился с 0,310 до {decimal(mobile_recipes['cls'])}. [Desktop](recipes-desktop.json), [мобильный профиль](recipes-mobile-slow-1.json).

Три холодных браузерных контекста на страницу, 390×844, загрузка 200 000 байт/с, задержка 150 мс, CPU ×4, cookie-баннер закрыт. В таблице медианы; сервер прогрет.

| Страница | LCP до и после | CLS до и после | Трафик до и после |
| --- | --- | --- | --- |
{chr(10).join(mobile_rows)}

[Исходные значения сравнения](summary.json), [все новые прогоны](measurements.json), [настройки и снимок исходников](environment.json).

Lighthouse 13.6.0 использует собственную мобильную симуляцию и первый визит с cookie-баннером. Его значения измерены отдельно от прямого профиля выше.

| Страница | Performance до и после | Accessibility до и после | Новый LCP |
| --- | --- | --- | --- |
{chr(10).join(lh_rows)}

Проверка контраста Lighthouse проходит на обеих страницах. [Отчёт каталога](lighthouse-catalog.report.html), [отчёт рецептов](lighthouse-recipes.report.html).

## Что изменилось

| Пункт | Исправление и проверка |
| --- | --- |
| A1 Главная | Сборка SVG эмблемы сохраняется после production-минификации. Ошибка декоративного превью обрабатывается отдельно; следующий запрос повторяет рендер. Главная отвечает 200, оба реальных PNG декодируются браузером. |
| A2 Изображения | Публичные фотографии стилей используют адаптивный Next Image, включая пример страницы пива на главной. Для маленьких карточек загружаются уменьшенные WebP; проверены DPR 1 и 2. Пользовательские фотографии продолжают использовать готовые миниатюры через авторизованный маршрут. |
| A3 Сдвиги | Добавлены WOFF2 с кириллицей и нужными начертаниями. Два основных файла уменьшены с 1 104 740 до 166 528 байт; `font-display: optional` предотвращает позднюю замену текста. Заглушка ленты резервирует высоту экрана, чтобы футер не появлялся и не исчезал при загрузке рецептов. Исходные TTF и лицензии сохранены. |
| A4 Первое нажатие | Нажатие меню до гидратации получает видимый отклик и открывает меню после готовности. Повторный тап не требуется. Форма обратной связи и неиспользуемый подбор ингредиентов калькулятора загружаются отдельно. |
| A5 Перекрытие формы | На мобильном редакторе обратная связь доступна в меню действий. Плавающая кнопка не перекрывает степперы кипячения; реальные нажатия проверены на 360, 390 и 834 px. |
| A6 Поиск склада | Начальный список остаётся в серверном HTML. Последующие фильтры получают отдельный ответ, отменяют прежний запрос и игнорируют устаревший ответ. URL, ввод и результаты согласованы; ошибка запроса показывает возможность повтора. Доступ к API ограничен складом текущей сессии. |
| A7 Контраст | Затемнён второстепенный текст светлой темы; исправлен цвет счётчиков активных категорий. |
| A8 Начало рецепта | Пустые показатели свёрнуты, настройки доступны при раскрытии. Состав и кнопка добавления видны в начале экрана. В заполненном рецепте показатели раскрываются. |

[Файлы шрифтов и контрольные суммы](font-assets.json), [размеры и положение первого действия](editor-fit-after.json), [проверки интерфейса](browser-final-checks.json).

## Проверки

- Production-сборка и TypeScript завершились успешно. Существующие предупреждения линтера перечислены в [логе сборки](tools/build-inventory-client.log).
- **4434 unit-теста** прошли, включая ошибку превью, production SVG, права доступа к поиску и даты складских карточек. [Лог](tools/all-unit-final.log).
- **9 браузерных сценариев** прошли: главная, изображения, раннее меню анонима и пользователя, параметры редактора, повторный поиск, ответы с задержкой, ошибка поиска с повтором, сохранение рецепта с сетевым сбоем и восстановлением. [Лог](tools/e2e-final.log).
- Два сценария поиска повторены по три раза: **6 успешных прогонов**, включая 24 цикла посещения склада, поиска и очистки. [Лог](tools/search-final.log).
- **2 PWA-проверки**: манифест и иконки, активация service worker и офлайн-страница. [Лог](tools/pwa-final.log).
- **{requests} запросов HTML к {len(http['records'])} маршрутам** завершились с HTTP 200. [Результаты](http-smoke.json).
- Проверены размеры 360×800, 390×844, 834×1112 и desktop, светлая и тёмная темы, переходы на покупки и партии, доступность фотографии рецепта. [Скриншоты](screenshots/).

Это локальные лабораторные проверки Chromium с эмуляцией телефона. Они не устанавливают полевой INP или показатели реальных iPhone и Android.

## Воспроизведение и окружение

Стенд использовал PostgreSQL `nb_perf_fixes` на 55437, отдельное mock-хранилище и приложение на 3018. Изменения тестовых данных выполнены в копии базы. Исходный аудит сохранён; параллельные изменения рабочего каталога учтены в снимке исходников.

Сценарии находятся в [performance-regression.spec.ts](../../apps/web/e2e/performance-regression.spec.ts), конфигурация — в [performance-regression.config.ts](../../apps/web/e2e/performance-regression.config.ts). Они требуют `PERFORMANCE_QA=1`, отдельную базу и временные сессии из [auth.mts](tools/auth.mts). Прямые профили повторяются через [run-browser.mjs](tools/run-browser.mjs), Lighthouse — через [run-lighthouse.sh](tools/run-lighthouse.sh). Преобразование шрифтов описано в [prepare-fonts.py](tools/prepare-fonts.py).

Временные процессы, контейнер, копия файлов и токены удалены после проверки. В сгенерированных настройках удалены пути этого стенда; остальные настройки сохранены. [Очистка](cleanup.json), [проверка артефактов](artifact-verification.json).
'''
(out / "README.md").write_text(report)
coverage = (out / "coverage.md").read_text()
status = "Финальный результат: A1–A8 проверены. Подробные результаты и ограничения — в [отчёте](README.md)."
coverage = coverage.replace(status, "").rstrip() + "\n\n" + status + "\n"
(out / "coverage.md").write_text(coverage)
print(json.dumps({"recipeBeforeMiB": old_bytes / 1024**2, "recipeAfterMiB": new_bytes / 1024**2, "reductionPercent": reduction, "httpRequests": requests}, ensure_ascii=False))
