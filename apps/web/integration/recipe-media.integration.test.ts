import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, it, expect } from "vitest";
import { chromium, expect as browserExpect, type Browser, type BrowserContext } from "@playwright/test";
import sharp from "sharp";
import { db, pool, users, recipes, recipeImages, eq, inArray } from "@nb/db";
import { completeEmailSignIn, createSession } from "@nb/auth";
import { createRecipe } from "../features/recipes/service";
import { deleteRecipeImage, requestRecipeImageUpload, setRecipeCoverImage, listRecipeImages } from "../features/recipe-images/service";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const owners: string[] = [];
let browser: Browser, ownerContext: BrowserContext, guest: BrowserContext, foreign: BrowserContext;
let owner: string, recipeId: string;
const upload = (buffer: Buffer, mimeType = "image/png", extra: Record<string, string> = {}) => ownerContext.request.post(base + "/api/recipe-images/upload", {
  multipart: { recipeId, ...extra, file: { name: "qa-image", mimeType, buffer } }
});
const png = () => sharp({ create: { width: 120, height: 80, channels: 4, background: "#a34d11" } }).png().toBuffer();
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (url.pathname !== "/nb_qa_20261103" || !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("ISOLATED_QA_DATABASE_REQUIRED");
  if (process.env.STORAGE_BUCKET !== "qa-interop-20261103") throw new Error("ISOLATED_QA_STORAGE_REQUIRED");
  browser = await chromium.launch({ headless: true });
});
beforeEach(async () => {
  owner = (await completeEmailSignIn({ email: `qa.media.${randomUUID()}@localhost` })).id; owners.push(owner);
  const other = (await completeEmailSignIn({ email: `qa.media.other.${randomUUID()}@localhost` })).id; owners.push(other);
  const session = await createSession({ userId: owner, userAgent: "QA media" });
  const otherSession = await createSession({ userId: other, userAgent: "QA media other" });
  recipeId = (await createRecipe(owner, { title: "QA media", publicationState: "private" })).id;
  ownerContext = await browser.newContext(); guest = await browser.newContext(); foreign = await browser.newContext();
  await ownerContext.addCookies([{ name: "nb_session", value: session.rawToken, url: base }, { name: "nb_cookie_consent", value: "1:necessary", url: base }, { name: "nb_age_ok", value: "1", url: base }]);
  await foreign.addCookies([{ name: "nb_session", value: otherSession.rawToken, url: base }]);
});
afterEach(async () => { await Promise.all([ownerContext?.close(), guest?.close(), foreign?.close()]); });
afterAll(async () => {
  for (const id of owners) {
    const rows = await db.query.recipes.findMany({ where: eq(recipes.authorId, id) });
    for (const recipe of rows) for (const image of await listRecipeImages(recipe.id, id)) await deleteRecipeImage(image.id, id);
  }
  await browser?.close();
  if (owners.length) await db.delete(users).where(inArray(users.id, owners));
  await pool.end();
});

describe("real image processing, HTTP delivery and permissions", () => {
  it("uploads through the recipe editor and saves text edits after the image mutation", async () => {
    const tab = await ownerContext.newPage();
    await tab.goto(base + `/app/recipes/${recipeId}/edit`, { waitUntil: "domcontentloaded" });
    await tab.waitForFunction(() => Array.from(document.querySelectorAll("button")).some(button => button.textContent?.trim() === "Сварить" && Object.keys(button).some(key => key.startsWith("__reactProps$"))));
    await tab.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').setInputFiles({ name: "qa-ui.png", mimeType: "image/png", buffer: await png() });
    await browserExpect.poll(async () => (await listRecipeImages(recipeId, owner)).filter(image => image.status === "ready").length, { timeout: 15000 }).toBe(1);
    const images = await listRecipeImages(recipeId, owner);
    const thumbnail = tab.locator(`img[src="${images[0].thumbUrl}"]`).filter({ visible: true });
    await browserExpect(thumbnail).toBeVisible();
    const titleInput = tab.getByPlaceholder("Например, NEIPA с тропическим ароматом").filter({ visible: true });
    await titleInput.fill("QA text after photo");
    await browserExpect(tab.getByText("Сохранено", { exact: true })).toBeVisible({ timeout: 15000 });
    expect((await db.query.recipes.findFirst({ where: eq(recipes.id, recipeId) }))?.title).toBe("QA text after photo");
    await tab.reload({ waitUntil: "domcontentloaded" });
    await browserExpect(titleInput).toHaveValue("QA text after photo");
    await browserExpect(thumbnail).toBeVisible();
  });
  it("rotates EXIF JPEG, strips metadata and supplies valid derivatives without resizing up", async () => {
    const input = await sharp(await png()).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const response = await upload(input, "image/jpeg"); expect(response.status()).toBe(200);
    const { image } = await response.json(); expect(image).toMatchObject({ status: "ready", width: 80, height: 120, isCover: true });
    for (const variant of ["original", "large", "medium", "thumb"]) {
      const result = await ownerContext.request.get(base + `/api/recipe-images/${image.id}/${variant}`);
      expect(result.status()).toBe(200); expect(result.headers()["x-content-type-options"]).toBe("nosniff");
      const metadata = await sharp(await result.body()).metadata();
      expect(metadata).toMatchObject({ width: 80, height: 120, format: variant === "original" ? "jpeg" : "webp" });
      expect(metadata.orientation).toBeUndefined(); expect(metadata.exif).toBeUndefined();
    }
  });
  it("denies foreign uploads and private reads, switches cover and removes old files", async () => {
    const first = (await (await upload(await png())).json()).image;
    const second = (await (await upload(await sharp(await png()).webp().toBuffer(), "image/webp")).json()).image;
    const url = base + `/api/recipe-images/${first.id}/thumb`;
    expect((await guest.request.get(url)).status()).toBe(404);
    expect((await foreign.request.get(url)).status()).toBe(404);
    const foreignUpload = await foreign.request.post(base + "/api/recipe-images/upload", { multipart: { recipeId, file: { name: "foreign.png", mimeType: "image/png", buffer: await png() } } });
    expect(foreignUpload.status()).toBe(404);
    await setRecipeCoverImage(second.id, owner);
    expect((await listRecipeImages(recipeId, owner)).filter(image => image.isCover).map(image => image.id)).toEqual([second.id]);
    await deleteRecipeImage(second.id, owner);
    expect((await listRecipeImages(recipeId, owner)).filter(image => image.isCover).map(image => image.id)).toEqual([first.id]);
    expect((await ownerContext.request.get(base + `/api/recipe-images/${second.id}/original`)).status()).toBe(404);
  });
  it("rechecks visibility after a public image has already been loaded in the browser", async () => {
    const image = (await (await upload(await png())).json()).image;
    // Direct SQL changes just visibility; avoids introducing publication prerequisites into this access test.
    await db.update(recipes).set({ publicationState: "published" }).where(eq(recipes.id, recipeId));
    const tab = await guest.newPage(); await tab.goto(base + "/login");
    const url = base + image.thumbUrl;
    const fetchStatus = () => tab.evaluate(async url => (await fetch(url)).status, url);
    expect(await fetchStatus()).toBe(200);
    await db.update(recipes).set({ hiddenAt: new Date() }).where(eq(recipes.id, recipeId));
    expect((await guest.request.get(url)).status()).toBe(404);
    expect(await fetchStatus()).toBe(404);
    expect((await ownerContext.request.get(url)).status()).toBe(200);
  });
  it("rejects corrupt data and disguised SVG, then retries the failed image slot", async () => {
    for (const input of [Buffer.from("not an image"), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')]) {
      const result = await upload(input); expect(result.status()).toBe(400);
      const failed = (await result.json()).image; expect(failed.status).toBe("failed");
      const retry = await upload(await png(), "image/png", { imageId: failed.id }); expect(retry.status()).toBe(200);
      expect((await retry.json()).image).toMatchObject({ id: failed.id, status: "ready" });
    }
    const oversized = await upload(Buffer.alloc(10 * 1024 * 1024 + 1)); expect(oversized.status()).toBe(400);
    expect(await db.query.recipeImages.findMany({ where: eq(recipeImages.recipeId, recipeId) })).toHaveLength(2);
  });
  it("enforces the eight-image quota under ten simultaneous reservations", async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => requestRecipeImageUpload({ recipeId, userId: owner, mimeType: "image/png", sizeBytes: 100 })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(8);
    expect(results.filter(result => result.status === "rejected").map(result => result.status === "rejected" && result.reason.message)).toEqual(["IMAGE_LIMIT_REACHED", "IMAGE_LIMIT_REACHED"]);
  });
  it("does not expose a private image from the former owner's browser cache after logout", async () => {
    const image = (await (await upload(await png())).json()).image;
    const tab = await ownerContext.newPage(); await tab.goto(base + "/login");
    const url = base + image.thumbUrl;
    expect(await tab.evaluate(async url => (await fetch(url)).status, url)).toBe(200);
    await ownerContext.clearCookies();
    expect(await tab.evaluate(async url => (await fetch(url)).status, url)).toBe(404);
  });
  it("limits actual derivative dimensions and the total quota under concurrent requests", async () => {
    const input = await sharp({ create: { width: 3000, height: 1800, channels: 3, background: "#bf7932" } }).png().toBuffer();
    const image = (await (await upload(input)).json()).image;
    for (const [variant, width, height] of [["large", 2560, 1536], ["medium", 1200, 720], ["thumb", 480, 288]] as const) {
      const response = await ownerContext.request.get(base + `/api/recipe-images/${image.id}/${variant}`);
      expect(await sharp(await response.body()).metadata()).toMatchObject({ format: "webp", width, height });
    }
    await deleteRecipeImage(image.id, owner);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => requestRecipeImageUpload({ recipeId, userId: owner, mimeType: "image/png", sizeBytes: 10 * 1024 * 1024 })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(4);
    expect(results.filter(result => result.status === "rejected").map(result => result.status === "rejected" && result.reason.message)).toEqual(["IMAGE_TOTAL_SIZE_LIMIT_REACHED"]);
  });
  it("returns a controlled error for malformed multipart data", async () => {
    const result = await ownerContext.request.post(base + "/api/recipe-images/upload", { headers: { "content-type": "multipart/form-data; boundary=qa-missing" }, data: "invalid body" });
    expect(result.status()).toBe(400);
    expect((await result.json()).ok).toBe(false);
  });
});
