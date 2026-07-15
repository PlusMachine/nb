import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";

// Регресс Ф4 (2026-07-15): DropdownMenu.Item «Изменить этап…» синхронно открывает
// Dialog (setStatusDialogOpen(true)) внутри Menu.handleSelect, который сам
// синхронно зовёт rootContext.onClose() — размонтирование DropdownMenu-слоя и
// монтирование Dialog-слоя попадают в ОДИН React-коммит. Оба используют
// @radix-ui/react-dismissable-layer с module-level переменной
// originalBodyPointerEvents; при такой гонке слоёв финальное закрытие Dialog
// восстанавливает body в pointer-events:none НАВСЕГДА — страница становится
// некликабельной. Фикс — packages/ui/src/components/dropdown-menu.tsx откладывает
// вызов item.onSelect на setTimeout(0), чтобы Menu успевал размонтироваться
// отдельным коммитом до открытия Dialog.
//
// Тест гоняет цикл открытия меню → смены этапа → закрытия диалога 10 раз и после
// КАЖДОГО цикла проверяет, что body не залип в pointer-events:none и что клик по
// реальному интерактивному элементу вне модалок долетает (открывает меню заново).

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const FIXTURE_SCRIPT = "e2e/fixtures/batch-menu-pointer-events-fixture.ts";

const runFixture = async (...args: string[]) => {
  const { stdout } = await execFileAsync("npx", ["tsx", FIXTURE_SCRIPT, ...args], {
    cwd: APP_ROOT,
    env: { ...process.env, TMPDIR: "/tmp", TEMP: "/tmp", TMP: "/tmp" }
  });
  return stdout;
};

test.describe("Меню партии не залипает в pointer-events:none", () => {
  let batchId: string | undefined;

  test.beforeAll(async ({}, testInfo) => {
    // Функциональный regression-тест на гонку Radix-слоёв, не про вёрстку — гоняем
    // на одном вьюпорте, чтобы не создавать/чистить по отдельной партии на каждый
    // из 4 projects из playwright.config.ts.
    test.skip(testInfo.project.name !== "desktop", "не зависит от вьюпорта — достаточно одного прогона");

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

  test("10 циклов «Изменить этап…» не оставляют body некликабельным", async ({ page }) => {
    if (!batchId) {
      throw new Error("batchId не подготовлен — beforeAll должен был упасть раньше");
    }

    await page.goto(`/app/brew-batches/${batchId}`);

    const menuTrigger = page.getByRole("button", { name: "Действия с партией" });
    const editStageItem = page.getByRole("menuitem", { name: "Изменить этап…" });
    const dialog = page.getByRole("dialog", { name: "Изменить этап" });

    // Партия создаётся в статусе planned — чередуем planned/brewing, чтобы
    // каждый клик реально менял статус (apply() не закрывает диалог, если
    // next === status).
    const targets: Array<"planned" | "brewing"> = ["brewing", "planned"];

    for (let cycle = 0; cycle < 10; cycle += 1) {
      const targetLabel = targets[cycle % 2] === "brewing" ? "Варится" : "Запланирована";

      // Реальный клик по элементу вне любых модалок — если body залип в
      // pointer-events:none после предыдущего цикла, этот клик не долетит и
      // меню не откроется (таймаут ниже это поймает).
      await menuTrigger.click();
      await expect(editStageItem).toBeVisible();

      await editStageItem.click();
      await expect(dialog).toBeVisible();

      await dialog.getByRole("button", { name: targetLabel, exact: true }).click();
      await expect(dialog).toBeHidden();

      const pointerEvents = await page.evaluate(() => getComputedStyle(document.body).pointerEvents);
      expect(pointerEvents, `цикл ${cycle + 1}: body.pointerEvents залип в none`).not.toBe("none");
    }

    // Финальная проверка «клик долетает» уже после всех циклов: меню должно
    // открываться и содержать оба пункта, никакого невидимого оверлея сверху нет.
    await menuTrigger.click();
    await expect(editStageItem).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Отменить партию" })).toBeVisible();
  });
});
