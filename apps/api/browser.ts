import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type {
  Execution,
  Issue,
  RuleSource,
  Scenario,
  Step,
  Workflow,
} from '../../packages/shared/contracts';
import {
  installInterception,
  responseField,
  responseSample,
  type ExternalTransport,
} from '../../packages/mutation-engine';
import { evaluate } from '../../packages/validation-engine';

export const windowSize = { width: 1160, height: 760 };
const currentPath = (page: Page) => new URL(page.url()).pathname;

export async function checkStep(
  page: Page,
  step: Step,
  demo = true,
  input: (key: string) => string | undefined = (key) => process.env[key],
  api: (source: Extract<RuleSource, { from: 'api' }>) => unknown = () => undefined,
) {
  if (step.action === 'navigate') {
    const next = new URL(step.path, page.url());
    await page.goto(next.href, { waitUntil: 'domcontentloaded' });
    if (page.url() !== next.href) throw new Error('Navigation expectation failed');
    return [];
  }
  if (step.action === 'rules') {
    return Promise.all(
      step.rules.map((rule) =>
        evaluate(
          rule,
          async (key, read) => {
            const node = page.getByTestId(key);
            const value = await (
              read === 'text' || read === 'string'
                ? node.innerText({ timeout: 1400 })
                : node.getAttribute('data-value', { timeout: 1400 })
            ).catch(() => null);
            if (read === 'string') return value?.trim();
            return value !== null && value.trim() && Number.isFinite(Number(value))
              ? Number(value)
              : undefined;
          },
          api,
        ),
      ),
    );
  }
  const node = page.getByTestId(step.target);
  if (step.action === 'fill') {
    const value = input(step.input);
    if (value === undefined || value.length > 200)
      throw new Error('A workflow input variable is missing or too long');
    await node.fill(value);
    return [];
  }
  const storeError = page.getByTestId('store-error');
  if (demo) {
    await node.or(storeError).first().waitFor({ state: 'visible', timeout: 5000 });
    if (step.target !== 'store-error' && (await storeError.isVisible()))
      throw new Error('Store entered its error state');
  }
  if (step.action === 'click') {
    await node.click();
    if (step.path) {
      const expected = page.waitForURL((url) => url.pathname === step.path, {
        timeout: 5000,
        waitUntil: 'domcontentloaded',
      });
      await (demo
        ? Promise.race([
            expected,
            storeError.waitFor({ state: 'visible', timeout: 5200 }).then(() => {
              throw new Error('Store entered its error state');
            }),
          ])
        : expected);
    }
  } else {
    await node.waitFor({ state: 'visible' });
    if (step.action === 'text' && (await node.innerText()).trim() !== step.value)
      throw new Error('Text expectation failed');
  }
  return [];
}

export class BrowserRunner {
  private browser?: Browser;
  private externalBrowser?: Browser;
  private denyProxy?: Server;

  private async launchExternal() {
    if (!this.denyProxy) {
      const proxy = createServer((_req, res) => {
        res.writeHead(403);
        res.end();
      });
      proxy.on('connect', (_req, socket) => socket.destroy());
      await new Promise<void>((resolve, reject) => {
        proxy.once('error', reject);
        proxy.listen(0, '127.0.0.1', resolve);
      });
      this.denyProxy = proxy;
    }
    const address = this.denyProxy.address();
    if (!address || typeof address === 'string') throw new Error('Browser deny proxy did not start');
    return chromium.launch({
      chromiumSandbox: true,
      proxy: { server: `http://127.0.0.1:${address.port}`, bypass: '<-loopback>' },
      args: ['--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
    });
  }

  async close() {
    try {
      await Promise.all([this.browser?.close(), this.externalBrowser?.close()]);
    } finally {
      const proxy = this.denyProxy;
      this.denyProxy = undefined;
      if (proxy) {
        await new Promise<void>((resolve) => {
          proxy.close(() => resolve());
          proxy.closeAllConnections();
        });
      }
    }
  }

  async context(external: boolean) {
    if (external && !this.externalBrowser?.isConnected())
      this.externalBrowser = await this.launchExternal();
    if (!external && !this.browser?.isConnected()) this.browser = await chromium.launch();
    const browser = external ? this.externalBrowser! : this.browser!;
    return browser.newContext({
      viewport: windowSize,
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
      acceptDownloads: false,
      reducedMotion: 'reduce',
      locale: 'en-US',
    });
  }

  async execute(
    origin: string,
    workflow: Workflow,
    scenario: Scenario,
    indices: number[],
    artifact?: { directory: string; name: string },
    external?: ExternalTransport,
    signal?: AbortSignal,
  ): Promise<Execution> {
    signal?.throwIfAborted();
    const context = await this.context(Boolean(external));
    const abort = () => {
      void context.close().catch(() => {});
    };
    signal?.addEventListener('abort', abort, { once: true });
    const start = performance.now();
    const output: Execution = {
      issueLog: [],
      observations: [],
      rules: [],
      durationMs: 0,
      applied: [],
      pages: [],
    };
    const pages = new Set<string>();
    const seen = new Set<string>();
    const applied = new Set<number>();
    const responses = new Map<string, unknown>();
    const log = (issue: Issue) => {
      issue.severity = issue.kind === 'network' || issue.kind === 'console' ? 'medium' : 'high';
      if (!seen.has(issue.key) && output.issueLog.length < 80) output.issueLog.push(issue);
      seen.add(issue.key);
    };
    let screen: Buffer | undefined;
    let capturedFailure = false;
    try {
      signal?.throwIfAborted();
      const page = await context.newPage();
      page.setDefaultTimeout(2100);
      page.setDefaultNavigationTimeout(5000);
      await installInterception(
        context,
        origin,
        scenario.mutations,
        scenario.seed,
        (event) => {
          for (const index of event.applied) applied.add(index);
          if (output.observations.length >= 80) return;
          const { url, method, path, shape, status, durationMs, data } = event;
          responses.set(`${method} ${path}`, data);
          output.observations.push({
            method,
            path,
            shape,
            status,
            durationMs,
            page: url,
            sample: data === undefined ? undefined : responseSample(data),
          });
          if (event.status === null || event.status >= 400)
            log({
              key: `network:${event.method}:${event.path}:${event.status ?? 'aborted'}`,
              kind: 'network',
              page: url,
              message: `${event.method} ${event.path} ${event.status === null ? 'did not complete' : `returned HTTP ${event.status}`}`,
            });
        },
        indices,
        external,
      );
      page.on('framenavigated', (frame) => {
        const url = new URL(frame.url());
        if (frame === page.mainFrame() && url.origin === origin) pages.add(url.pathname);
      });
      page.on('pageerror', () =>
        log({
          key: `runtime:${currentPath(page)}`,
          kind: 'runtime',
          page: currentPath(page),
          message: external
            ? 'Uncaught JavaScript error in the target page'
            : 'Uncaught JavaScript error in the demo page',
        }),
      );
      page.on('console', (message) => {
        if (message.type() === 'error')
          log({
            key: `console:${currentPath(page)}`,
            kind: 'console',
            page: currentPath(page),
            message: 'Browser reported a console error',
          });
      });
      const capture = async (isFailure: boolean) => {
        if (!artifact || capturedFailure) return;
        const image = await page
          .screenshot({
            animations: 'disabled',
            timeout: 2500,
            mask: [page.locator('input, textarea, select, [contenteditable], [data-sensitive]')],
            maskColor: '#202530',
          })
          .catch(() => undefined);
        if (image) {
          screen = image;
          output.screenshotPage = currentPath(page);
          capturedFailure = isFailure;
        }
      };
      await page.goto(origin + workflow.start, { waitUntil: 'domcontentloaded' });
      for (const [index, step] of workflow.steps.entries()) {
        signal?.throwIfAborted();
        if (performance.now() - start > 30_000)
          throw new Error('Workflow exceeded the browser execution budget');
        try {
          const evidence = await checkStep(page, step, !external, undefined, (source) =>
            responseField(responses.get(`${source.method} ${source.endpoint}`), source.path),
          );
          output.rules.push(...evidence);
          for (const rule of evidence.filter((result) => !result.passed)) {
            log({
              key: `rule:${rule.id}`,
              kind: 'rule',
              message: `${rule.name}: measured ${rule.actual ?? 'missing'}, expected ${rule.expected}`,
              page: currentPath(page),
            });
          }
          if (step.action === 'rules') await capture(false);
        } catch {
          const navigation =
            step.action === 'navigate' ||
            (step.action === 'click' && step.path && currentPath(page) !== step.path);
          const shownError =
            !external &&
            (await page
              .getByTestId('store-error')
              .isVisible()
              .catch(() => false));
          log({
            key: `step:${index}:${step.action}`,
            kind: navigation ? 'navigation' : 'assertion',
            page: currentPath(page),
            message: `Step ${index + 1} (${step.action}${'target' in step ? ` ${step.target}` : ''}) failed${shownError ? ' with a visible store error' : ''}`,
          });
          await capture(true);
          break;
        }
      }
      if (!screen) await capture(false);
      await context.unrouteAll({ behavior: 'wait' });
    } finally {
      signal?.removeEventListener('abort', abort);
      await context.close();
    }
    if (artifact && screen) {
      await mkdir(artifact.directory, { recursive: true });
      await writeFile(join(artifact.directory, artifact.name), screen);
      output.screenshot = artifact.name;
    }
    output.pages = [...pages];
    output.applied = [...applied].sort((a, b) => a - b);
    output.durationMs = Math.round(performance.now() - start);
    return output;
  }
}

export const compareIssues = (baseline: Execution, variant: Execution) => {
  const existing = new Set(baseline.issueLog.map((issue) => issue.key));
  return variant.issueLog.filter((issue) => !existing.has(issue.key));
};

export async function compareScreens(directory: string, baseline: Execution, variant: Execution) {
  if (!baseline.screenshot || !variant.screenshot) return;
  const { readFile } = await import('node:fs/promises');
  const buffers = await Promise.all([
    readFile(join(directory, baseline.screenshot)),
    readFile(join(directory, variant.screenshot)),
  ]);
  const [before, after] = buffers.map((buffer) => PNG.sync.read(buffer));
  if (before.width !== after.width || before.height !== after.height) return;
  const diff = new PNG({ width: before.width, height: before.height });
  const changedPixels = pixelmatch(before.data, after.data, diff.data, before.width, before.height, {
    threshold: 0.12,
  });
  const output = { changedPixels, totalPixels: before.width * before.height, diff: 'difference.png' };
  await writeFile(join(directory, output.diff), PNG.sync.write(diff));
  return output;
}
