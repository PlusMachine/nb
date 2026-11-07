import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import * as helpers from './browser-helpers.mjs';

export async function run(browser) {
  const sessions = JSON.parse(await readFile('/tmp/nb-perf-fixes-sessions-20261104.json', 'utf8'));
  const rows = [];
  for (let repeat = 1; repeat <= 3; repeat++) {
    for (const [name, path, cookies] of [
      ['catalog', '/catalog', []],
      ['calculator', '/calculators/abv-attenuation', []],
      ['editor', '/app/recipes/new', [sessions[1].cookie]]
    ]) {
      const result = await helpers.measure(browser, { name: `${name}-mobile-slow-${repeat}`, path, cookies, mobile: true, slow: true, shot: repeat === 1 });
      rows.push(result); console.log(JSON.stringify(result));
    }
  }
  for (const options of [
    { name: 'recipes-mobile-slow-1', path: '/recipes', mobile: true, slow: true },
    { name: 'recipes-desktop', path: '/recipes' },
    { name: 'home-desktop', path: '/' },
    { name: 'home-mobile-slow-1', path: '/', mobile: true, slow: true },
    { name: 'inventory-desktop', path: '/app/ingredients', cookies: [sessions[0].cookie] },
    { name: 'inventory-mobile-slow-1', path: '/app/ingredients', mobile: true, slow: true, cookies: [sessions[0].cookie] },
    { name: 'dashboard-mobile-slow-1', path: '/app', mobile: true, slow: true, cookies: [sessions[0].cookie] },
    { name: 'catalog-mobile-warm', path: '/catalog', mobile: true, slow: true, warm: true }
  ]) {
    const result = await helpers.measure(browser, { ...options, shot: true });
    rows.push(result); console.log(JSON.stringify(result));
  }
  await writeFile(helpers.root + '/measurements.json', JSON.stringify(rows, null, 2) + '\n');

  const checks = { errors: [], viewports: [], stock: [], themes: [], photos: [] };
  const surface = await helpers.newSurface(browser, { mobile: true, cookies: [sessions[1].cookie] });
  const { page, context } = surface;
  page.on('pageerror', error => checks.errors.push(error.message));
  try {
    for (const [width, height] of [[360, 800], [390, 844], [834, 1112]]) {
      await page.setViewportSize({ width, height });
      await page.goto(helpers.base + '/app/recipes/new');
      const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Солод и другое сырьё', exact: true }) });
      const action = section.getByRole('button', { name: 'Добавить', exact: true });
      await expect(action).toBeVisible();
      const box = await action.boundingBox();
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth }));
      if (viewport.scrollWidth > width || box.y + box.height > height - 56) throw new Error('EDITOR_VIEWPORT_FIT');
      checks.viewports.push({ ...viewport, firstIngredientAction: box });
      await page.screenshot({ path: helpers.root + `/screenshots/editor-${width}-final-light.png`, scale: 'css' });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Тема оформления', exact: true }).click();
    await page.getByRole('radio', { name: 'Тёмная тема', exact: true }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    checks.themes.push('dark persists after reload');
    await page.screenshot({ path: helpers.root + '/screenshots/editor-390-final-dark.png', scale: 'css' });
    await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'NB', exact: true })).toBeVisible();
    await page.screenshot({ path: helpers.root + '/screenshots/app-menu-final.png', scale: 'css' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.goto(helpers.base + '/app/ingredients');
    const input = page.getByRole('textbox', { name: 'Поиск по складу' });
    for (const query of ['цитра', 'пильзнер']) {
      await input.fill(query);
      await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe(query);
      await expect(page.getByText('Обновляем список…', { exact: true })).toHaveCount(0);
      const target = query === 'цитра' ? 'Цитра' : 'Пильзнер';
      await expect(page.getByRole('heading', { name: target, exact: true })).toBeVisible();
      const excluded = query === 'цитра' ? 'Пильзнер' : 'Цитра';
      await expect(page.getByRole('heading', { name: excluded, exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Очистить поиск', exact: true }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe(null);
      await expect(page.getByRole('heading', { name: 'Пильзнер', exact: true })).toBeVisible();
      await expect(page.getByText('Обновляем список…', { exact: true })).toHaveCount(0);
      checks.stock.push({ query, cleared: true });
    }
    const hop = page.getByRole('button', { name: /^Хмель(?:\s|$)/ });
    await hop.click();
    await expect(page.getByRole('heading', { name: 'Пильзнер', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Цитра', exact: true })).toBeVisible();
    await hop.click();
    await expect(page.getByRole('heading', { name: 'Пильзнер', exact: true })).toBeVisible();
    await expect(page.getByText('Обновляем список…', { exact: true })).toHaveCount(0);
    checks.stock.push({ category: 'hop', toggledBack: true });
    await page.screenshot({ path: helpers.root + '/screenshots/inventory-final-dark.png', scale: 'css' });
    await page.goto(helpers.base + '/app/shopping');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto(helpers.base + '/app/brew-batches');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const photo = await page.request.get(helpers.base + '/api/recipe-images/7d7fb344-a790-450f-a88c-c816e8673a11/thumb');
    checks.photos.push({ status: photo.status(), contentType: photo.headers()['content-type'], bytes: (await photo.body()).length });
    if (photo.status() !== 200) throw new Error('RECIPE_PHOTO_UNAVAILABLE');
  } finally { await context.close(); }
  await writeFile(helpers.root + '/browser-final-checks.json', JSON.stringify(checks, null, 2) + '\n');
  if (checks.errors.length) throw new Error('BROWSER_ERRORS: ' + checks.errors.join('; '));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const browser = await chromium.launch({ headless: true });
  try { await run(browser); } finally { await browser.close(); }
}
