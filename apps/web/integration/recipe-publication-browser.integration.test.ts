import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect as check, it } from "vitest";
import { chromium, expect, type Browser } from "@playwright/test";
import { createSession } from "@nb/auth";
import { db, eq, inArray, pool, recipes, users } from "@nb/db";
import { createRecipe } from "../features/recipes/service";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const owners: string[] = [];
let browser: Browser;

beforeAll(async () => {
  const database = new URL(process.env.DATABASE_URL!);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(database.hostname)) {
    throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
  }
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  if (owners.length) await db.delete(users).where(inArray(users.id, owners));
  await pool.end();
});

async function openOwner() {
  const id = randomUUID();
  await db.insert(users).values({ id, displayName: "QA publication" });
  owners.push(id);
  const session = await createSession({ userId: id, userAgent: "QA recipe publication" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([
    { name: "nb_session", value: session.rawToken, url: base },
    { name: "nb_cookie_consent", value: "1:necessary", url: base },
    { name: "nb_age_ok", value: "1", url: base }
  ]);
  return { id, context, page: await context.newPage() };
}

it("publishes and withdraws a recipe across warmed public routes and fits long text on mobile", async () => {
  const { id, context, page } = await openOwner();
  const guest = await browser.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
  try {
    await guest.addCookies([
      { name: "nb_cookie_consent", value: "1:necessary", url: base },
      { name: "nb_age_ok", value: "1", url: base }
    ]);
    const title = "Нефильтрованное".repeat(10) + randomUUID().slice(0, 6);
    const recipe = await createRecipe(id, {
      title,
      description: title.repeat(2),
      publicationState: "private",
      ingredients: [
        { ingredientCatalogItemId: "kurskiy-solod--pilsner", type: "malt", amountEnteredQuantity: 4000, amountEnteredUnit: "g", stage: "mash" },
        { ingredientCatalogItemId: "us-cascade-beervingem-standard", type: "hop", amountEnteredQuantity: 20, amountEnteredUnit: "g", stage: "boil", timeOffset: 30 },
        { ingredientCatalogItemId: "fermentis-us-05", type: "yeast", amountEnteredQuantity: 1, amountEnteredUnit: "pack", stage: "fermentation" }
      ]
    });
    const anonymous = await guest.newPage();
    const url = `${base}/recipes/${recipe.slug}`;
    const sitemapHasRecipe = async () => {
      const response = await guest.request.get(`${base}/sitemap.xml`);
      check(response.status()).toBe(200);
      return (await response.text()).includes(`/recipes/${recipe.slug}</loc>`);
    };
    const link = anonymous.locator(`#home-recipes a[href="/recipes/${recipe.slug}"]`);
    const fits = () => anonymous.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

    check((await guest.request.get(url)).status()).toBe(404);
    check(await sitemapHasRecipe()).toBe(false);
    await anonymous.goto(base + "/");
    await expect(link).toHaveCount(0);

    await page.goto(`${base}/app/recipes/${recipe.id}/edit`);
    await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Опубликовать", exact: true }).click();
    await expect(page.getByRole("link", { name: "Посмотреть публикацию", exact: true })).toBeVisible();

    check((await guest.request.get(url)).status()).toBe(200);
    await expect.poll(sitemapHasRecipe).toBe(true);
    await anonymous.reload();
    await expect(link.first()).toBeVisible();
    check(await fits()).toBe(true);
    await anonymous.goto(url);
    await expect(anonymous.getByRole("heading", { name: title, exact: true })).toBeVisible();
    check(await fits()).toBe(true);

    await page.getByRole("button", { name: "Скрыть публикацию", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Скрыть публикацию", exact: true }).click();
    await expect(page.getByRole("button", { name: "Опубликовать", exact: true })).toBeVisible();
    check((await guest.request.get(url)).status()).toBe(404);
    check((await guest.request.get(`${base}/beer/${recipe.slug}`)).status()).toBe(404);
    await expect.poll(sitemapHasRecipe).toBe(false);
    await anonymous.goto(base + "/");
    await expect(link).toHaveCount(0);
  } finally {
    await guest.close();
    await context.close();
  }
});

it("reopens the same version when the browser loses a committed response", async () => {
  const { id, context, page } = await openOwner();
  try {
    const recipe = await createRecipe(id, { title: "QA version retry", publicationState: "private" });
    const versions = () => db.query.recipes.findMany({ where: eq(recipes.recipeFamilyId, recipe.recipeFamilyId) });
    await page.goto(`${base}/app/recipes/${recipe.id}/edit`);
    await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
    let lost = false;
    await page.route("**/app/recipes/**", async route => {
      const body = route.request().postData();
      if (!lost && route.request().headers()["next-action"] && body?.startsWith(`["${recipe.id}","`)) {
        lost = true;
        await route.fetch();
        await route.abort("failed");
      } else {
        await route.continue();
      }
    });
    const create = page.getByRole("button", { name: "Новая версия", exact: true });
    await create.click();
    await expect(page.getByText(/Не удалось создать версию/)).toBeVisible();
    const committed = (await versions()).find(version => version.versionNumber === 2);
    check(committed).toBeDefined();
    await create.click();
    await expect(page).toHaveURL(`${base}/app/recipes/${committed!.id}/edit`);
    check(await versions()).toHaveLength(2);
  } finally {
    await context.close();
  }
});
