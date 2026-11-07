import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { completeEmailSignIn, createSession } from "@nb/auth";
import { brewBatches, brewMeasurements, db, eq, users } from "@nb/db";
import type { BrewDayProgress } from "../features/brew-batches/contracts";

test.skip(process.env.PWA_OFFLINE_BREW_QA !== "1", "Requires an isolated production build and test database");

test("a saved brew reopens offline and sends its queue once the connection returns", async ({ page, context, baseURL }) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(12_000);
  const database = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(database.hostname) || database.pathname !== "/nb_qa_offline_brew") {
    throw new Error("ISOLATED_OFFLINE_BREW_DATABASE_REQUIRED");
  }
  const owner = await completeEmailSignIn({ email: `qa.offline-brew.${randomUUID()}@localhost` });
  let secondOwner: string | undefined;
  try {
    await db.update(users).set({ preferredGravityUnit: "sg" }).where(eq(users.id, owner.id));
    const [batch] = await db.insert(brewBatches).values({
      userId: owner.id,
      name: "QA варка без сети",
      brewNumber: 1,
      brewPlanSnapshot: {
        version: "brew_plan_v1",
        recipe: { id: randomUUID(), title: "QA варка без сети", versionNumber: 1, batchSizeL: 20 },
        equipmentProfileSnapshot: null, waterPlanMeta: null, mashSteps: [],
        boilPlan: { boilTimeMinutes: 60, timedAdditions: [] }, whirlpoolPlan: [],
        fermentationPlan: null, packagingPlan: null, deviceHints: []
      }
    }).returning();
    const stored = async () => (await db.select().from(brewBatches).where(eq(brewBatches.id, batch.id)))[0];
    const storedMeasurements = () => db.select().from(brewMeasurements).where(eq(brewMeasurements.brewBatchId, batch.id));
    const session = await createSession({ userId: owner.id, userAgent: "QA offline brew" });
    await context.addCookies([
      { name: "nb_session", value: session.rawToken, url: baseURL! },
      { name: "nb_cookie_consent", value: "1:necessary", url: baseURL! },
      { name: "nb_age_ok", value: "1", url: baseURL! }
    ]);
    const path = `/app/brew-batches/${batch.id}`;
    await page.goto(path);
    await expect(page.getByText("Доступно без интернета", { exact: true })).toBeVisible({ timeout: 30_000 });
    const crossOrigin = await page.request.post(`/api/brew-batches/${batch.id}/offline`, {
      headers: { Origin: "https://other-origin.example.invalid" }, data: {}
    });
    expect(crossOrigin.status()).toBe(403);

    const startedAfter = Date.now();
    await context.setOffline(true);
    await page.getByRole("button", { name: "Начать варку", exact: true }).click();
    await page.getByRole("button", { name: /^Начать шаг/ }).click();
    await expect(page.getByRole("button", { name: "Изменить время", exact: true })).toBeVisible();
    await (await context.newCDPSession(page)).send("Network.clearBrowserCache");
    await page.close();
    const reopened = await context.newPage();
    reopened.setDefaultTimeout(12_000);
    await reopened.clock.install({ time: new Date(Date.now() + 10 * 60_000) });
    await reopened.goto(path);
    await expect(reopened.getByRole("heading", { name: /QA варка без сети/ })).toBeVisible();
    await expect(reopened.getByRole("button", { name: "Изменить время", exact: true })).toBeVisible();
    await expect(reopened.getByTestId("manual-brew-current-step").getByText(/^(49:\d{2}|50:00)$/)).toBeVisible();
    await reopened.clock.setSystemTime(new Date());

    await reopened.getByRole("button", { name: "Замер", exact: true }).click();
    const measurement = reopened.locator("#brew-journal");
    await measurement.getByLabel(/^Плотность,/).fill("1,052");
    await measurement.getByRole("button", { name: /Добавить/ }).click();
    await expect(measurement.getByText("1.052", { exact: true }).first()).toBeVisible();
    const volumes = reopened.locator("#batch-volumes");
    await volumes.getByLabel("До кипячения, л", { exact: true }).fill("25");
    await volumes.getByRole("button", { name: "Сохранить объёмы" }).click();
    await expect(volumes.getByText("Сохранено на устройстве", { exact: true })).toBeVisible();
    await reopened.keyboard.press("Escape");
    await reopened.getByRole("button", { name: "Заметка", exact: true }).click();
    await reopened.locator("#brew-notes textarea").fill("Сохранено при отключённой сети");
    await reopened.locator("#brew-notes").getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(reopened.locator("#brew-notes").getByText("Сохранено на устройстве", { exact: true })).toBeVisible();
    await reopened.keyboard.press("Escape");

    await reopened.getByRole("button", { name: /^Завершить кипячение/ }).click();
    await reopened.getByRole("dialog").getByRole("button", { name: "Завершить шаг", exact: true }).click();
    await reopened.getByRole("button", { name: "Сусло охлаждено", exact: true }).click();
    await reopened.getByRole("button", { name: "Продолжить без замеров", exact: true }).click();
    await reopened.getByRole("button", { name: "Поставить на брожение", exact: true }).click();
    await expect(reopened.getByRole("heading", { name: "Брожение", exact: true })).toBeVisible();
    await expect(reopened.locator("#brew-notes textarea")).toHaveValue("Сохранено при отключённой сети");
    await measurement.getByLabel(/^Плотность,/).fill("1,012");
    await measurement.getByLabel("Это замер конечной плотности (КП)").check();
    await measurement.getByRole("button", { name: /Добавить/ }).click();
    await expect(measurement.getByText("1.012", { exact: true }).first()).toBeVisible();

    expect((await stored()).status).toBe("planned");
    expect(await storedMeasurements()).toHaveLength(0);
    let lostResponse = false;
    await reopened.route(`**/api/brew-batches/${batch.id}/offline`, async route => {
      const request = route.request();
      if (!lostResponse && request.method() === "POST" && request.postDataJSON().operation.command.kind === "add-measurement") {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        lostResponse = true;
        await route.abort("connectionreset");
      } else {
        await route.continue();
      }
    });
    const reconnectedAt = Date.now();
    await context.setOffline(false);
    await expect.poll(async () => (await stored()).status, { timeout: 30_000 }).toBe("fermenting");
    await expect(reopened.getByText("Доступно без интернета", { exact: true })).toBeVisible();
    expect(lostResponse).toBe(true);
    const synced = await stored();
    expect(synced.startedAt!.getTime()).toBeGreaterThanOrEqual(startedAfter);
    expect(synced.startedAt!.getTime()).toBeLessThan(reconnectedAt);
    expect((synced.brewDayProgress.steps as BrewDayProgress["steps"])["boil:timer"].timerStartedAt).toBeTruthy();
    expect(synced.volumeMeasurements.preBoilL).toBe(25);
    expect(synced.notes).toBe("Сохранено при отключённой сети");
    const measurements = await storedMeasurements();
    expect(measurements).toHaveLength(2);
    expect(measurements.find(row => !row.isFinal)?.gravitySg).toBeCloseTo(1.052, 5);
    expect(measurements.find(row => row.isFinal)?.gravitySg).toBeCloseTo(1.012, 5);
    expect(measurements.every(row => row.takenAt.getTime() < reconnectedAt)).toBe(true);

    await context.setOffline(true);
    await reopened.locator("#brew-notes textarea").fill("Локальная правка");
    await reopened.locator("#brew-notes").getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(reopened.locator("#brew-notes").getByText("Сохранено на устройстве", { exact: true })).toBeVisible();
    await db.update(brewBatches).set({ notes: "Правка с другого устройства" }).where(eq(brewBatches.id, batch.id));
    await context.setOffline(false);
    await expect(reopened.getByText("Правка с другого устройства", { exact: true })).toBeVisible();
    await reopened.getByRole("button", { name: "Оставить моё", exact: true }).click();
    await expect.poll(async () => (await stored()).notes).toBe("Локальная правка");
    await expect(reopened.getByText("Доступно без интернета", { exact: true })).toBeVisible();

    await context.setOffline(true);
    await reopened.locator("#brew-notes textarea").fill("Отправка из списка варок");
    await reopened.locator("#brew-notes").getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(reopened.locator("#brew-notes").getByText("Сохранено на устройстве", { exact: true })).toBeVisible();
    await reopened.goto("/app");
    await expect(reopened.getByRole("heading", { name: "Сохранённые варки", exact: true })).toBeVisible();
    await context.setOffline(false);
    await expect.poll(async () => (await stored()).notes).toBe("Отправка из списка варок");

    const other = await completeEmailSignIn({ email: `qa.offline-brew.other.${randomUUID()}@localhost` });
    secondOwner = other.id;
    const otherSession = await createSession({ userId: other.id, userAgent: "QA offline brew other account" });
    await context.addCookies([{ name: "nb_session", value: otherSession.rawToken, url: baseURL! }]);
    await reopened.goto("/app");
    await expect.poll(() => reopened.evaluate(() => localStorage.getItem("nb:session-owner"))).toBe(other.id);
    await context.setOffline(true);
    await reopened.goto(path);
    await expect(reopened.getByText(/сначала откройте её с интернетом/)).toBeVisible();
    await expect(reopened.getByRole("heading", { name: /QA варка без сети/ })).toHaveCount(0);
  } finally {
    await db.delete(users).where(eq(users.id, owner.id));
    if (secondOwner) await db.delete(users).where(eq(users.id, secondOwner));
  }
});
