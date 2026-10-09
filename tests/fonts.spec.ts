import { expect, test } from '@playwright/test';

test('generic text renders with the bundled Gilroy font', async ({ page }) => {
  for (const [path, selectors] of [
    ['/', ['.hero-copy p', '.footer-inner p']],
    ['/accedi', ['.auth-frame label', '.auth-frame input']],
  ] as const) {
    const failedFonts: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/fonts/Gilroy-') && response.status() >= 400)
        failedFonts.push(response.url());
    });
    await page.goto(path);
    if (path === '/accedi') {
      await page.locator('input[name="email"]').fill('font-check@example.local');
    }
    await page.evaluate(() => document.fonts.ready);
    const session = await page.context().newCDPSession(page);
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    for (const selector of selectors) {
      const element = page.locator(selector).first();
      await expect(element).toHaveCSS('font-family', /Gilroy/);
      const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
      expect(fonts.length, selector).toBeGreaterThan(0);
      for (const font of fonts) {
        expect(font.familyName, selector).toMatch(/^Gilroy/);
        expect(font.isCustomFont, selector).toBe(true);
        expect(font.glyphCount, selector).toBeGreaterThan(0);
      }
    }
    expect(failedFonts).toEqual([]);
    await session.detach();
  }
});
