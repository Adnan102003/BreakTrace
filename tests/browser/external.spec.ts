import { expect, test } from './dashboard';
import { test as boundaryTest } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createControlPlane } from '../../apps/api/app';
import { BrowserRunner } from '../../apps/api/browser';
import { TargetAuthority } from '../../apps/api/targets';
import type { Run } from '../../packages/shared/contracts';

const staging = 'https://staging.example.test';
const payload = (contentType: string, body: string) => ({
  status: 200,
  headers: { 'content-type': contentType },
  body: Buffer.from(body),
});

test('operator enrolls a staging project and reproduces a scoped rule failure in Chromium', async ({
  page,
}) => {
  test.setTimeout(100_000);
  const traffic: string[] = [];
  let proof = '';
  const targets = new TargetAuthority(
    [staging],
    async () => [{ address: '93.184.216.34', family: 4 }],
    async (url, _ip, method) => {
      traffic.push(`${method} ${url.pathname}`);
      if (proof && url.pathname.startsWith('/.well-known/breaktrace/'))
        return payload('text/plain', proof);
      if (url.pathname === '/products')
        return payload(
          'text/html',
          '<!doctype html><meta charset="utf-8"><output data-testid="price" hidden></output><script src="/app.js"></script>',
        );
      if (url.pathname === '/app.js')
        return payload(
          'application/javascript',
          [
            'fetch("/v1/products/42").then(response => response.json()).then(item => {',
            '  const price = document.querySelector("output");',
            '  price.textContent = item.price ?? 0; price.hidden = false;',
            '});',
          ].join('\n'),
        );
      if (url.pathname === '/v1/products/42') return payload('application/json', '{"price":10}');
      return { status: 404, headers: {}, body: Buffer.alloc(0) };
    },
  );
  await mkdir('.data', { recursive: true });
  const control = createControlPlane(await mkdtemp(resolve('.data/external-ui-')), {
    serveWeb: true,
    targets,
  });
  try {
    await new Promise<void>((ready) => control.server.listen(0, '127.0.0.1', ready));
    const address = control.server.address();
    if (!address || typeof address === 'string') throw new Error('Test listener did not start');
    await page.goto(`http://127.0.0.1:${address.port}`);
    const projectsLink = page
      .getByRole('navigation', { name: 'Workspace navigation' })
      .getByRole('link', { name: 'Projects', exact: true });
    await projectsLink.click();
    await page.getByRole('button', { name: 'Add project' }).click();
    await page.getByLabel('Target type').selectOption('external');
    await page.getByLabel('Name', { exact: true }).fill('Staging fixture');
    await page.getByLabel('Project ID').fill('staging-fixture');
    await page.getByLabel('HTTPS origin').fill(staging);
    await page.getByRole('button', { name: 'Save project' }).click();
    await expect(page.getByRole('button', { name: 'Create challenge' })).toBeDisabled();
    await page.getByLabel('I control this staging application', { exact: false }).check();
    await page.getByRole('button', { name: 'Create challenge' }).click();
    const reportedProof = page.getByText(/^breaktrace:[a-f0-9]{64}$/);
    await expect(reportedProof).toBeVisible();
    proof = (await reportedProof.textContent())!;
    await page.getByRole('button', { name: 'Verify proof' }).click();
    await expect(page.getByText('Target verified.')).toBeVisible();
    await page.getByRole('button', { name: 'Check connection' }).click();
    await expect(page.getByText('Connection and target proof verified.')).toBeVisible();

    await page.getByRole('link', { name: 'API explorer' }).click();
    await page.getByLabel('Import scope').selectOption('staging-fixture');
    await page.getByLabel('Register imported GET and HEAD', { exact: false }).check();
    const yaml = 'openapi: 3.1.0\npaths:\n  /v1/products/{id}:\n    get: {summary: Public product}\n';
    await page
      .getByLabel('Specification file')
      .setInputFiles({ name: 'staging.yaml', mimeType: 'application/yaml', buffer: Buffer.from(yaml) });
    await expect(page.getByLabel('Specification document')).toHaveValue(yaml);
    await page.getByRole('button', { name: 'Import operations' }).click();
    await expect(page.getByText('GET /v1/products/{id}', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Workflows' }).click();
    await page.getByLabel('New external workflow template').selectOption('staging-fixture');
    await page.getByLabel('Workflow JSON').fill(
      JSON.stringify({
        id: 'staging-workflow',
        name: 'Staging price',
        projectId: 'staging-fixture',
        start: '/products',
        steps: [{ action: 'visible', target: 'price' }],
      }),
    );
    await page.getByText('Open visual rule builder').click();
    await page.getByLabel('Rule name').fill('Price is positive');
    await page.getByRole('combobox', { name: 'Operator', exact: true }).selectOption('range');
    await page.getByLabel('Element test ID').fill('price');
    await page.getByLabel('Minimum').fill('1');
    await page.getByLabel('Maximum').fill('100');
    await page.getByRole('button', { name: 'Add rule to workflow' }).click();
    await expect(page.getByText('Rule added to the workflow draft.')).toBeVisible();
    await page.getByRole('button', { name: 'Save workflow' }).click();
    await expect(page.getByText('Saved to this workspace.')).toBeVisible();
    await page.getByRole('link', { name: 'Failure scenarios' }).click();
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Remove price on staging');
    await page.getByLabel('Scenario ID').fill('staging-no-price');
    await page.getByLabel('Project scope').selectOption('staging-fixture');
    await page.getByRole('button', { name: 'Add mutation' }).click();
    await expect(page.getByRole('combobox', { name: 'Operation', exact: true })).toHaveValue(
      'GET /v1/products/{id}',
    );
    await page.getByRole('button', { name: 'Add mutation' }).click();
    await page.getByRole('button', { name: 'Remove mutation' }).last().click();
    await page.getByRole('button', { name: 'Save scenario' }).click();
    await expect(page.getByText('Saved to this workspace.')).toBeVisible();

    await page.getByRole('link', { name: 'Test executions' }).click();
    await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption('staging-fixture');
    await expect(page.getByRole('combobox', { name: 'Workflow', exact: true })).toHaveValue(
      'staging-workflow',
    );
    await page.getByRole('button', { name: 'Start execution' }).click();
    await page.getByRole('link', { name: 'Inspect evidence' }).click({ timeout: 55_000 });
    await expect(
      page.getByText('Price is positive: measured 0, expected between 1 and 100'),
    ).toBeVisible();
    expect(traffic).toContain('GET /v1/products/42');
    const current = new URL(page.url());
    const run = await page.request.get(`${current.origin}/api/runs/${current.hash.split('/').at(-1)}`);
    const report = (await run.json()) as Run;
    expect(report.baseline?.observations[0]?.path).toBe('/v1/products/{id}');
    expect(report.baseline?.screenshot).toBeUndefined();
    expect(report.isolation?.indices).toEqual([0]);
    expect(report.risk?.coverage).toEqual({ observed: 1, total: 1 });
    await page.getByRole('link', { name: 'Regression tests' }).click();
    await expect(page.getByText(/const target = await new TargetAuthority/)).toBeVisible();
    await expect(page.getByText(proof, { exact: true })).toHaveCount(0);

    await page.getByRole('link', { name: 'Failure scenarios' }).click();
    await page.getByRole('button', { name: /Remove price on staging/ }).click();
    await page.getByText('Captured response previews').click();
    await page.getByLabel('Evidence run').selectOption(report.id);
    await expect(page.getByLabel('Captured operation')).toHaveValue('GET /v1/products/{id}');
    await expect(page.getByText('"price": 10', { exact: false })).toBeVisible();
    await page.getByLabel('Field path').fill('temporary');
    await page.getByLabel('Captured JSON path for mutation 1').selectOption('price');
    await expect(page.getByLabel('Field path')).toHaveValue('price');

    await projectsLink.click();
    await page.getByRole('button', { name: /Staging fixture/ }).click();
    await page.getByRole('button', { name: 'Revoke authorization' }).click();
    await page.getByRole('button', { name: 'Cancel revocation' }).click();
    await page.getByRole('button', { name: 'Revoke authorization' }).click();
    await page.getByRole('button', { name: 'Confirm revocation' }).click();
    await expect(page.getByText('Authorization revoked for future runs.')).toBeVisible();
    await page.getByRole('link', { name: 'Test executions' }).click();
    await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption('staging-fixture');
    await expect(page.getByRole('button', { name: 'Start execution' })).toBeDisabled();

    await projectsLink.click();
    const project = page.getByRole('button', { name: /Staging fixture/ });
    await project.click();
    await page.getByRole('link', { name: 'Project history' }).click();
    await expect(page.getByLabel('Filter by project')).toHaveValue('staging-fixture');
    await projectsLink.click();
    await project.click();
    await page.getByRole('button', { name: 'Delete project' }).click();
    await page.getByRole('button', { name: 'Cancel deletion' }).click();
    await page.getByRole('button', { name: 'Delete project' }).click();
    await page.getByRole('button', { name: 'Confirm deletion' }).click();
    await expect(project).toHaveCount(0);
  } finally {
    await control.close();
  }
});

boundaryTest('external Chromium requests cannot reach unregistered API routes, other origins, or write methods', async () => {
  const runner = new BrowserRunner();
  const visited: string[] = [];
  try {
    const result = await runner.execute(
      staging,
      {
        id: 'boundary',
        name: 'Boundary',
        start: '/',
        steps: [{ action: 'text', target: 'result', value: 'blocked blocked blocked allowed' }],
      },
      { id: 'control', name: 'Control', seed: 0, mutations: [] },
      [],
      undefined,
      {
        origin: staging,
        operations: [{ method: 'GET', path: '/api/read' }],
        async read(url, method) {
          visited.push(`${method} ${url.href}`);
          if (url.pathname === '/')
            return payload(
              'text/html',
              '<!doctype html><meta charset="utf-8"><output data-testid="result" hidden></output><script src="/app.js"></script>',
            );
          if (url.pathname === '/app.js')
            return payload(
              'application/javascript',
              [
                'const run = (url, options) => fetch(url, options).then(() => "allowed", () => "blocked");',
                'Promise.all([run("/api/unregistered"), run("https://other.example.test/api/read"),',
                '  run("/api/read", {method:"POST"}), run("/api/read")]).then(results => {',
                '  const out = document.querySelector("output"); out.textContent = results.join(" "); out.hidden = false;',
                '});',
              ].join('\n'),
            );
          return payload('application/json', '{}');
        },
      },
    );
    expect(result.issueLog.filter(({ kind }) => kind === 'assertion')).toEqual([]);
    expect(visited).toContain(`GET ${staging}/api/read`);
    expect(visited).not.toContain(`GET ${staging}/api/unregistered`);
    expect(visited).not.toContain(`POST ${staging}/api/read`);
    expect(visited.every((url) => url.startsWith(`GET ${staging}/`))).toBe(true);
  } finally {
    await runner.close();
  }
});
