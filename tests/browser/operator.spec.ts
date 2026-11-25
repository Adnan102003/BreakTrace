import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createControlPlane } from '../../apps/api/app';
import { expect, test } from './dashboard';

const password = randomBytes(32).toString('base64url');
test.use({ httpCredentials: { username: 'operator', password } });

test('an authenticated operator can load the production dashboard and receive live updates', async ({ page }) => {
  await mkdir('.data', { recursive: true });
  const control = createControlPlane(await mkdtemp(resolve('.data/operator-browser-')), {
    operatorPassword: password,
    serveWeb: true,
  });
  try {
    await new Promise<void>((done) => control.server.listen(0, '127.0.0.1', done));
    const address = control.server.address();
    if (!address || typeof address === 'string') throw new Error('Workspace listener did not start');
    const origin = `http://127.0.0.1:${address.port}`;
    expect((await fetch(origin)).status).toBe(401);
    await page.goto(origin);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await expect(page.getByText('Live', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Settings & docs' }).click();
    await page.getByLabel('Warning threshold').fill('30');
    await page.getByRole('button', { name: 'Save thresholds' }).click();
    await expect(page.getByText('Saved to this workspace.')).toBeVisible();
  } finally {
    await control.close();
  }
});
