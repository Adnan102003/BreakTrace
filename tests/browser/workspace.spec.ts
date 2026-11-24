import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createControlPlane } from '../../apps/api/app';
import { startDemo } from '../../apps/demo/server';
import { installInterception } from '../../packages/mutation-engine';

test('dashboard executes a silent regression and verifies the approved isolated repair', async ({
  page,
}) => {
  test.setTimeout(100_000);
  await mkdir('.data', { recursive: true });
  const control = createControlPlane(await mkdtemp(resolve('.data/ui-test-')), { serveWeb: true });
  try {
    await new Promise<void>((resolve) => control.server.listen(0, '127.0.0.1', resolve));
    const address = control.server.address();
    if (!address || typeof address === 'string') throw new Error('Test listener did not start');
    await page.goto(`http://127.0.0.1:${address.port}`);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Use light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Run demo experiment' }).click();
    await page.getByRole('link', { name: 'Inspect evidence' }).click({ timeout: 40_000 });
    await expect(page.getByText(/measured 0, expected 8640/)).toBeVisible();
    const screenshot = page.getByRole('img', { name: 'Baseline browser checkpoint' });
    await expect(screenshot).toBeVisible();
    await expect
      .poll(() => screenshot.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await page.getByRole('link', { name: 'Experiments', exact: true }).click();
    await expect(page.getByText('Verified inclusion-minimal scenario', { exact: false })).toBeVisible();
    await page.getByRole('link', { name: 'Dependency graph' }).click();
    await expect(page.getByText('RESPONSE FIELD').first()).toBeVisible();
    await page.getByRole('link', { name: 'Regression tests' }).click();
    await expect(page.getByRole('link', { name: 'Export .spec.ts' })).toBeVisible();
    await expect(page.getByText(/const activeMutations = \[1\]/)).toBeVisible();
    await page.getByRole('link', { name: 'Repair verification' }).click();
    await expect(page.getByRole('button', { name: 'Verify repair' })).toBeDisabled();
    await page.getByLabel('Apply the reviewed patch to the isolated copy').check();
    await page.getByRole('button', { name: 'Verify repair' }).click();
    await expect(page.getByText('Original source preserved')).toBeVisible({ timeout: 35_000 });
    await expect(
      page.getByText('Original source preserved').locator('..').getByText('passed'),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Deployment risk' }).click();
    await expect(page.getByText('BLOCK', { exact: true })).toBeVisible();
  } finally {
    await control.close();
  }
});

test('browser interception denies another loopback origin without making a request', async ({
  page,
  context,
}) => {
  const fixture = await startDemo();
  const unrelated = await startDemo();
  try {
    await installInterception(context, fixture.url, [], 42);
    await page.goto(fixture.url);
    await expect(page.getByRole('heading', { name: 'Built for the everyday.' })).toBeVisible();
    await expect(page.goto(unrelated.url)).rejects.toThrow();
  } finally {
    await unrelated.close();
    await fixture.close();
  }
});
