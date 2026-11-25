import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createControlPlane } from '../../apps/api/app';

test('every workspace route is reachable and mobile navigation supports keyboard use', async ({
  page,
}) => {
  await mkdir('.data', { recursive: true });
  const control = createControlPlane(await mkdtemp(resolve('.data/navigation-')), { serveWeb: true });
  try {
    await new Promise<void>((ready) => control.server.listen(0, '127.0.0.1', ready));
    const address = control.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Navigation test listener did not start');
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByRole('link', { name: /BreakTrace/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Find what will break');
    await page.getByRole('link', { name: 'Open workspace' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overview');
    await page.getByRole('link', { name: 'New execution' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test executions');
    const navigation = page.getByRole('navigation', { name: 'Workspace navigation' });
    for (const title of [
      'Overview',
      'Projects',
      'API explorer',
      'Workflows',
      'Failure scenarios',
      'Test executions',
      'Dependency graph',
      'Failure details',
      'Root cause analysis',
      'Experiment history',
      'Regression tests',
      'Repair verification',
      'Deployment risk',
    ]) {
      await navigation.getByRole('link', { name: title, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(navigation.getByRole('link', { name: title, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
    await page.getByRole('link', { name: 'Settings & docs' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings & docs');
    await page.getByLabel('Warning threshold').fill('30');
    await page.getByLabel('Block threshold').fill('70');
    await page.getByRole('button', { name: 'Save thresholds' }).click();
    await expect(page.getByText('Saved to this workspace.')).toBeVisible();
    const config = await page.request.get(`http://127.0.0.1:${address.port}/api/config`);
    expect((await config.json()).thresholds).toEqual({ warning: 30, block: 70 });

    await page.setViewportSize({ width: 390, height: 844 });
    const toggle = page.getByRole('button', { name: 'Open navigation' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: /BreakTrace/ })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('link', { name: 'Settings & docs' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole('link', { name: 'Product overview' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Find what will break');
  } finally {
    await control.close();
  }
});
