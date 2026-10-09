import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('home shows one crew with automatic, manual and pause controls', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const section = page.getByRole('region', { name: 'Le ciurme' });
  const name = section.getByRole('heading', { level: 3 });
  await expect(name).toHaveCount(1);
  await expect(name).toHaveText('La Rotta Blu');
  await expect(section.getByRole('button', { name: 'Pausa scorrimento ciurme' })).toBeVisible();
  await page.clock.runFor(7000);
  await expect(name).toHaveText('Pirati dell’Aurora');
  await section.getByRole('button', { name: 'Ciurma successiva' }).click();
  await expect(name).toHaveText('Vento di Levante');
  await section.getByRole('button', { name: 'Ciurma precedente' }).click();
  await expect(name).toHaveText('Pirati dell’Aurora');
  await section.getByRole('button', { name: 'Pausa scorrimento ciurme' }).click();
  await page.mouse.move(0, 0);
  await page.locator(':focus').evaluate((element) => (element as HTMLElement).blur());
  await page.clock.runFor(14000);
  await expect(name).toHaveText('Pirati dell’Aurora');
  await section.getByRole('button', { name: 'Avvia scorrimento ciurme' }).click();
  await page.mouse.move(0, 0);
  await page.locator(':focus').evaluate((element) => (element as HTMLElement).blur());
  await page.clock.runFor(7000);
  await expect(name).toHaveText('Vento di Levante');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await section.screenshot({ path: join(tmpdir(), 'keynes-slider-desktop.png') });
});

test('crew slider fits phones and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.clock.install();
  await page.goto('/');
  const section = page.getByRole('region', { name: 'Le ciurme' });
  await expect(section.getByRole('button', { name: 'Avvia scorrimento ciurme' })).toBeVisible();
  await page.clock.runFor(14000);
  await expect(section.getByRole('heading', { level: 3 })).toHaveText('La Rotta Blu');
  await section.getByRole('button', { name: 'Ciurma precedente' }).click();
  await expect(section.getByRole('heading', { level: 3 })).toHaveText('Vento di Levante');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await section.screenshot({ path: join(tmpdir(), 'keynes-slider-mobile.png') });
});
