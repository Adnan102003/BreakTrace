import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { createControlPlane } from '../../apps/api/app';
import type { Run } from '../../packages/shared/contracts';

test('the Vite proxy preserves workspace authorization for dashboard actions', async ({ page }) => {
  test.setTimeout(90_000);
  await mkdir('.data', { recursive: true });
  const root = await mkdtemp(resolve('.data/dev-proxy-test-'));
  const control = createControlPlane(root);
  let vite: ViteDevServer | undefined;
  try {
    await new Promise<void>((ready) => control.server.listen(0, '127.0.0.1', ready));
    const api = control.server.address();
    if (!api || typeof api === 'string') throw new Error('API listener did not start');

    // Vite treats port 0 as its default port, which may already be in use.
    const reservation = createServer();
    await new Promise<void>((ready) => reservation.listen(0, '127.0.0.1', ready));
    const address = reservation.address();
    await new Promise<void>((ready) => reservation.close(() => ready()));
    if (!address || typeof address === 'string') throw new Error('Could not allocate a Vite port');

    const previousPort = process.env.BREAKTRACE_PORT;
    try {
      process.env.BREAKTRACE_PORT = String(api.port);
      vite = await createViteServer({
        cacheDir: resolve(root, 'vite'),
        server: { host: '127.0.0.1', port: address.port, hmr: false, watch: null },
      });
    } finally {
      if (previousPort === undefined) delete process.env.BREAKTRACE_PORT;
      else process.env.BREAKTRACE_PORT = previousPort;
    }
    await vite.listen();
    const origin = `http://127.0.0.1:${address.port}`;
    await page.goto(origin);
    await expect(page.getByText('Live', { exact: true })).toBeVisible();

    const accepted = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/runs' && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Run demo experiment' }).click();
    const attempt = await accepted;
    expect(attempt.status()).toBe(202);
    const { id } = await attempt.json();
    await page.getByRole('link', { name: 'Inspect evidence' }).click({ timeout: 40_000 });
    const reportUrl = `${origin}/api/runs/${id}`;
    const report = (await (await page.request.get(reportUrl)).json()) as Run;
    expect(report.status).toBe('failed'); // The bundled scenario deliberately regresses.
    expect(report.baseline?.issueLog).toEqual([]);
    expect(report.findings?.map(({ key }) => key)).toContain('rule:checkout-total');
    expect(report.isolation?.indices).toEqual([1]);
    expect(report.risk?.gate).toBe('BLOCK');
    await expect(page.getByText(/measured 0, expected 8640/)).toBeVisible();
    const screenshot = await page.request.get(`${reportUrl}/artifact/baseline.png`);
    expect(screenshot.status()).toBe(200);
    expect(screenshot.headers()['content-type']).toContain('image/png');

    await page.getByRole('link', { name: 'Repair verification' }).click();
    await page.getByLabel('Apply the reviewed patch to the isolated copy').check();
    await page.getByRole('button', { name: 'Verify repair' }).click();
    await expect(page.getByText('Original source preserved')).toBeVisible({ timeout: 35_000 });
    expect(((await (await page.request.get(reportUrl)).json()) as Run).repair?.passed).toBe(true);

    await page.getByRole('link', { name: 'Settings & docs' }).click();
    await page.getByLabel('Warning threshold').fill('30');
    await page.getByLabel('Block threshold').fill('70');
    await page.getByRole('button', { name: 'Save thresholds' }).click();
    await expect(page.getByText('Saved to this workspace.')).toBeVisible();

    await page.getByRole('link', { name: 'API explorer' }).click();
    await page
      .getByLabel('Specification document')
      .fill('{"openapi":"3.1.0","paths":{"/items":{"get":{"summary":"Items"}}}}');
    await page.getByRole('button', { name: 'Import operations' }).click();
    await expect(page.getByText('GET /items', { exact: true })).toBeVisible();

    const foreignPort = await page.request.put(`${origin}/api/settings/gate`, {
      headers: { Origin: `http://127.0.0.1:${api.port}`, 'Sec-Fetch-Site': 'same-site' },
      data: { warning: 31, block: 71 },
    });
    expect(foreignPort.status()).toBe(403);
    const foreignSite = await page.request.put(`${origin}/api/settings/gate`, {
      headers: { Origin: 'https://untrusted.invalid', 'Sec-Fetch-Site': 'cross-site' },
      data: { warning: 31, block: 71 },
    });
    expect(foreignSite.status()).toBe(403);
    const config = await page.request.get(`${origin}/api/config`);
    expect((await config.json()).thresholds).toEqual({ warning: 30, block: 70 });
  } finally {
    await vite?.close();
    await control.close();
  }
});
