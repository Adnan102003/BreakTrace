import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright';
import {
  installInterception,
  responseField,
  type ExternalTransport,
} from '../../packages/mutation-engine';
import {
  stepSchema,
  type Project,
  type RecorderCommand,
  type Recording,
  type Step,
  type Workflow,
} from '../../packages/shared/contracts';
import { startDemo } from '../demo/server';
import { BrowserRunner, checkStep } from './browser';
import { TargetError, type PinnedTarget } from './targets';

type Session = {
  id: string;
  projectId: string;
  origin: string;
  draft: Workflow;
  runner: BrowserRunner;
  page: Page;
  transport?: ExternalTransport;
  operations: Recording['operations'];
  inputs: Map<string, string>;
  responses: Map<string, unknown>;
  closeDemo?: () => Promise<void>;
  timer: ReturnType<typeof setTimeout>;
};

export class Recorder {
  private current?: Session;

  async open(project: Project, start: string, target?: PinnedTarget): Promise<Recording> {
    if (this.current) throw new TargetError('Close the existing recording before starting another one');
    if (project.kind === 'external' && target?.origin !== project.url)
      throw new TargetError('Verify the target to record a workflow');
    const runner = new BrowserRunner();
    const demo =
      project.kind === 'external'
        ? undefined
        : await startDemo({ resilient: project.version === 'resilient' });
    const transport =
      project.kind === 'external' && target ? { ...target, operations: project.endpoints } : undefined;
    const origin = transport?.origin ?? demo!.url;
    const operations: Recording['operations'] = [];
    const responses = new Map<string, unknown>();
    try {
      const context = await runner.context(Boolean(transport));
      await installInterception(
        context,
        origin,
        [],
        0,
        (event) => {
          if (operations.length < 40) {
            operations.push({ method: event.method, path: event.path, status: event.status });
            responses.set(`${event.method} ${event.path}`, event.data);
          }
        },
        [],
        transport,
      );
      const page = await context.newPage();
      page.setDefaultTimeout(3200);
      await page.goto(origin + start, { waitUntil: 'domcontentloaded', timeout: 6500 });
      const id = randomUUID();
      const timer = setTimeout(() => {
        void this.close(id).catch(() => {});
      }, 10 * 60_000);
      timer.unref();
      const session: Session = {
        id,
        projectId: project.id,
        origin,
        runner,
        page,
        transport,
        operations,
        draft: {
          id: `recorded-${id.slice(0, 8)}`,
          name: `${project.name.slice(0, 55)} recording`,
          start,
          projectId: project.kind === 'external' ? project.id : undefined,
          steps: [],
        },
        inputs: new Map(),
        responses,
        closeDemo: demo?.close,
        timer,
      };
      this.current = session;
      return await this.snapshot(session);
    } catch (error) {
      if (this.current?.runner === runner) await this.close();
      else {
        await runner.close();
        await demo?.close();
      }
      throw error;
    }
  }

  private session(id: string) {
    if (this.current?.id !== id) throw new TargetError('This browser recording expired or was closed');
    return this.current;
  }

  private async snapshot(session: Session, validated?: boolean): Promise<Recording> {
    const inputs = [...new Set(session.inputs.values())].map((value) => value.trim()).filter(Boolean);
    const png = await session.page.screenshot({
      timeout: 2200,
      animations: 'disabled',
      mask: [
        session.page.locator('input, textarea, select, [contenteditable], [data-sensitive]'),
        ...inputs.map((value) => session.page.getByText(value, { exact: true })),
      ],
      maskColor: '#202530',
    });
    return {
      id: session.id,
      projectId: session.projectId,
      path: new URL(session.page.url()).pathname,
      screenshot: `data:image/png;base64,${png.toString('base64')}`,
      draft: session.draft,
      operations: session.operations,
      validated,
    };
  }

  async perform(id: string, command: RecorderCommand) {
    const session = this.session(id);
    if (session.draft.steps.length >= 16) throw new TargetError('Record at most 16 steps per workflow');
    const before = new URL(session.page.url()).pathname;
    let step: Step;
    if (command.action === 'pick') {
      const target = await session.page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'),
        command,
      );
      const parsed = stepSchema.safeParse({ action: 'click', target });
      if (!parsed.success) throw new TargetError('Choose a visible element with a data-testid');
      step = parsed.data;
    } else if (command.action === 'fill') {
      const input = `BREAKTRACE_INPUT_${command.target.toUpperCase().replaceAll('-', '_')}`;
      session.inputs.set(input, command.value);
      step = { action: 'fill', target: command.target, input };
    } else step = command.step;
    const results = await checkStep(
      session.page,
      step,
      !session.transport,
      (input) => session.inputs.get(input),
      (source) =>
        responseField(session.responses.get(`${source.method} ${source.endpoint}`), source.path),
    );
    if (results.some((result) => !result.passed))
      throw new TargetError('The recorded assertions did not pass');
    const after = new URL(session.page.url()).pathname;
    const recorded = step.action === 'click' && after !== before ? { ...step, path: after } : step;
    session.draft.steps.push(stepSchema.parse(recorded));
    return this.snapshot(session);
  }

  async replay(id: string, workflow: Workflow) {
    const session = this.session(id);
    if (workflow.projectId !== session.draft.projectId)
      throw new TargetError('Replay must stay in the selected project');
    const context = await session.runner.context(Boolean(session.transport));
    try {
      const responses = new Map<string, unknown>();
      await installInterception(
        context,
        session.origin,
        [],
        0,
        (event) => {
          if (responses.size < 80) responses.set(`${event.method} ${event.path}`, event.data);
        },
        [],
        session.transport,
      );
      const page = await context.newPage();
      page.setDefaultTimeout(2600);
      await page.goto(session.origin + workflow.start, { waitUntil: 'domcontentloaded', timeout: 6000 });
      for (const step of workflow.steps) {
        const rules = await checkStep(
          page,
          step,
          !session.transport,
          (input) => session.inputs.get(input),
          (source) => responseField(responses.get(`${source.method} ${source.endpoint}`), source.path),
        );
        if (rules.some((result) => !result.passed))
          throw new TargetError('The replay failed a business rule');
      }
      session.draft = structuredClone(workflow);
      return await this.snapshot(session, true);
    } finally {
      await context.close();
    }
  }

  async close(id?: string) {
    if (!this.current || (id && this.current.id !== id)) return;
    const session = this.current;
    this.current = undefined;
    clearTimeout(session.timer);
    session.inputs.clear();
    try {
      await session.runner.close();
    } finally {
      await session.closeDemo?.();
    }
  }

  async closeProject(projectId: string) {
    if (this.current?.projectId === projectId) await this.close();
  }
}
