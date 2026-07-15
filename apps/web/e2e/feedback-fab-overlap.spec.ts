import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, test, type Page } from "@playwright/test";

// Ф5 (P0): контент теперь резервирует место под FAB «Обратная связь» —
// feedback-launcher.tsx публикует --nb-fab-h (высота кнопки + её базовый зазор
// 1rem), app-shell.tsx/public-shell.tsx добавляют её в pb-формулу контейнера,
// toast.tsx — в bottom-формулу тост-вьюпорта.
//
// ⚠ Эмпирически проверено (замер через Playwright на этой же странице): после
// формы замера плотности (#brew-journal) на странице партии идут ещё «Склад
// партии» и «Заметки о варке» — суммарно на порядок выше (400-600px), чем
// резерв под FAB (~60-100px). Поэтому «прокрутить форму в видимость и
// кликнуть «Добавить»» не задевает FAB на ЭТОЙ странице ни до, ни после
// фикса — тест ниже с этим сценарием лишь базовая проверка «форма работает
// как обычно» (и как ЛЮБОЙ такой клик может быть перехвачен fixed-элементом,
// если он вообще есть на экране в момент клика).
//
// Настоящий регресс-барьер — второй тест: он сравнивает computed
// padding-bottom контейнера в режиме киоска (?kiosk=1 — FAB не монтируется,
// --nb-fab-h сброшен в 0px, см. feedback-launcher.tsx) и в обычном режиме
// (FAB виден). Разница обязана равняться высоте кнопки + 1rem. Проверено
// вручную: с временно откаченным var(--nb-fab-h,0px) из lg-ветки формулы
// разница падает до 0 и тест краснеет; с фиксом — проходит.
const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const FIXTURE_SCRIPT = "e2e/fixtures/feedback-fab-overlap-fixture.ts";
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// Тот самый div, что несёт pb-формулу в app-shell.tsx (мобильная ветка формулы
// уникальна в разметке — достаточно матчить по началу её arbitrary-класса).
const CONTENT_CONTAINER_SELECTOR = '[class*="pb-[calc(6rem"]';

const runFixture = async (...args: string[]) => {
  const { stdout } = await execFileAsync("npx", ["tsx", FIXTURE_SCRIPT, ...args], {
    cwd: APP_ROOT,
    env: { ...process.env, TMPDIR: "/tmp", TEMP: "/tmp", TMP: "/tmp" }
  });
  return stdout;
};

// Баннер cookie-согласия перекрывает низ экрана и сам двигает --nb-cookie-banner-h
// (тот же приём, что в beer-presentation.spec.ts) — гость, уже принявший
// решение, его не видит. Без этого второй тест мерил бы разницу, замусоренную
// высотой баннера, а не только вкладом FAB.
const acceptCookies = async (page: Page) => {
  await page.context().addCookies([
    { name: "nb_cookie_consent", value: "1:all", url: BASE_URL },
    { name: "nb_age_ok", value: "1", url: BASE_URL }
  ]);
};

const readContainerPaddingBottomPx = (page: Page) =>
  page.evaluate((selector) => {
    const el = document.querySelector(selector);
    return el ? parseFloat(getComputedStyle(el).paddingBottom) : null;
  }, CONTENT_CONTAINER_SELECTOR);

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
];

test.describe("FAB «Обратная связь» не перекрывает интерактив на странице партии", () => {
  let batchId: string | undefined;

  test.beforeAll(async ({}, testInfo) => {
    // Три вьюпорта тестируются через test.use ВНУТРИ этого файла, не через
    // playwright.config.ts projects — фикстуру создаём один раз независимо от
    // того, в каком из 4 projects (mobile/tablet/laptop/desktop) идёт прогон,
    // иначе на 4 параллельных воркера получим 4 висящие тестовые партии.
    test.skip(testInfo.project.name !== "desktop", "не зависит от project-вьюпорта — достаточно одного прогона");

    const stdout = await runFixture();
    const resultLine = stdout.split("\n").find((line) => line.startsWith("RESULT:"));
    if (!resultLine) {
      throw new Error(`Фикстура не вернула RESULT: строку. Вывод:\n${stdout}`);
    }
    batchId = (JSON.parse(resultLine.slice("RESULT:".length)) as { batchId: string }).batchId;
  });

  test.afterAll(async () => {
    if (!batchId) return;
    await runFixture("--cleanup", `--batch-id=${batchId}`);
  });

  for (const viewport of VIEWPORTS) {
    test.describe(`${viewport.width}×${viewport.height}`, () => {
      test.use({ viewport });

      test("форма замера плотности кликабельна после scrollIntoView", async ({ page }) => {
        if (!batchId) {
          throw new Error("batchId не подготовлен — beforeAll должен был упасть раньше");
        }
        await acceptCookies(page);
        await page.goto(`/app/brew-batches/${batchId}`);

        await page.locator("#brew-journal").scrollIntoViewIfNeeded();
        const addButton = page.getByRole("button", { name: "Добавить" });
        // Playwright сам провалит тест, если этот клик перехватит фиксированный
        // элемент поверх кнопки: actionability-проверка "receives pointer events"
        // не пройдёт и click() упадёт по таймауту.
        await addButton.click();
        await expect(page.getByText("Введите плотность.")).toBeVisible();
      });

      test("резерв под FAB в контенте равен высоте кнопки + 1rem", async ({ page }) => {
        if (!batchId) {
          throw new Error("batchId не подготовлен — beforeAll должен был упасть раньше");
        }
        await acceptCookies(page);

        // Киоск: FeedbackLauncher не монтируется вовсе → --nb-fab-h сброшен в
        // 0px (см. useEffect в feedback-launcher.tsx) — базовая линия без FAB.
        await page.goto(`/app/brew-batches/${batchId}?kiosk=1`, { waitUntil: "networkidle" });
        await expect(page.getByRole("button", { name: "Обратная связь" })).toHaveCount(0);
        const paddingBottomWithoutFab = await readContainerPaddingBottomPx(page);
        expect(paddingBottomWithoutFab).not.toBeNull();

        // Обычный режим: та же страница, тот же контейнер, FAB виден. --nb-fab-h
        // пишет клиентский useEffect (ResizeObserver) уже ПОСЛЕ гидратации —
        // под параллельной нагрузкой прогона (6 воркеров на одном dev-сервере)
        // "networkidle" может наступить раньше, чем этот эффект отработает,
        // поэтому ждём именно факта роста паддинга, а не фиксированную паузу.
        await page.goto(`/app/brew-batches/${batchId}`, { waitUntil: "networkidle" });
        const fab = page.getByRole("button", { name: "Обратная связь" });
        await expect(fab).toBeVisible();
        const fabBox = await fab.boundingBox();
        expect(fabBox).not.toBeNull();
        await expect
          .poll(() => readContainerPaddingBottomPx(page), {
            message: "--nb-fab-h ещё не применился к pb-формуле контейнера"
          })
          .toBeGreaterThan(paddingBottomWithoutFab!);
        const paddingBottomWithFab = await readContainerPaddingBottomPx(page);
        expect(paddingBottomWithFab).not.toBeNull();

        const reservedForFab = paddingBottomWithFab! - paddingBottomWithoutFab!;
        const expectedReservation = fabBox!.height + 16; // высота кнопки + базовый зазор 1rem (16px)
        expect(Math.abs(reservedForFab - expectedReservation)).toBeLessThanOrEqual(1);
      });
    });
  }
});
