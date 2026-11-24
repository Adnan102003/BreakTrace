import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { Execution, Issue, Scenario, Step, Workflow } from '../../packages/shared/contracts';
import { installInterception } from '../../packages/mutation-engine';
import { evaluate } from '../../packages/validation-engine';

const windowSize = { width: 1160, height: 760 };
const currentPath = (page: Page) => new URL(page.url()).pathname;

export async function checkStep(page: Page, step: Step) {
  if (step.action === 'rules') {
    return Promise.all(
      step.rules.map((rule) =>
        evaluate(rule, async (key) => {
          const value = await page
            .getByTestId(key)
            .getAttribute('data-value', { timeout: 1400 })
            .catch(() => null);
          return value !== null && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
        }),
      ),
    );
  }
  const node = page.getByTestId(step.target);
  const storeError = page.getByTestId('store-error');
  await node.or(storeError).first().waitFor({ state: 'visible', timeout: 5000 });
  if (step.target !== 'store-error' && (await storeError.isVisible()))
    throw new Error('Store entered its error state');
  if (step.action === 'click') {
    await node.click();
    if (step.path) {
      await Promise.race([
        page.waitForURL((url) => url.pathname === step.path, {
          timeout: 5000,
          waitUntil: 'domcontentloaded',
        }),
        storeError.waitFor({ state: 'visible', timeout: 5200 }).then(() => {
          throw new Error('Store entered its error state');
        }),
      ]);
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
  async close() {
    await this.browser?.close();
  }

  async execute(
    origin: string,
    workflow: Workflow,
    scenario: Scenario,
    indices: number[],
    artifact?: { directory: string; name: string },
  ): Promise<Execution> {
    if (!this.browser?.isConnected()) this.browser = await chromium.launch();
    const context = await this.browser.newContext({
      viewport: windowSize,
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
      acceptDownloads: false,
      reducedMotion: 'reduce',
      locale: 'en-US',
    });
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
    const log = (issue: Issue) => {
      issue.severity = issue.kind === 'network' || issue.kind === 'console' ? 'medium' : 'high';
      if (!seen.has(issue.key) && output.issueLog.length < 80) output.issueLog.push(issue);
      seen.add(issue.key);
    };
    let screen: Buffer | undefined;
    let capturedFailure = false;
    try {
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
          const { url, method, path, shape, status, durationMs } = event;
          output.observations.push({ method, path, shape, status, durationMs, page: url });
          if (event.status === null || event.status >= 400)
            log({
              key: `network:${event.method}:${event.path}:${event.status ?? 'aborted'}`,
              kind: 'network',
              page: url,
              message: `${event.method} ${event.path} ${event.status === null ? 'did not complete' : `returned HTTP ${event.status}`}`,
            });
        },
        indices,
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
          message: 'Uncaught JavaScript error in the demo page',
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
          .screenshot({ animations: 'disabled', timeout: 2500 })
          .catch(() => undefined);
        if (image) {
          screen = image;
          output.screenshotPage = currentPath(page);
          capturedFailure = isFailure;
        }
      };
      await page.goto(origin + workflow.start, { waitUntil: 'domcontentloaded' });
      for (const [index, step] of workflow.steps.entries()) {
        if (performance.now() - start > 30_000)
          throw new Error('Workflow exceeded the browser execution budget');
        try {
          const evidence = await checkStep(page, step);
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
          const navigation = step.action === 'click' && step.path && currentPath(page) !== step.path;
          const shownError = await page
            .getByTestId('store-error')
            .isVisible()
            .catch(() => false);
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
