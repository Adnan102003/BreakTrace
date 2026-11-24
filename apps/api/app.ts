import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { join, resolve } from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import { Server } from 'socket.io';
import { z } from 'zod';
import {
  gateSchema,
  projectSchema,
  scenarioSchema,
  workflowSchema,
  type Run,
} from '../../packages/shared/contracts';
import { endpoints } from '../../packages/shared/demo';
import { generateRegression } from '../../packages/test-generator';
import {
  assess,
  diffShape,
  importOperations,
  openApiSchema,
  optionalOllama,
  recommendations,
} from './analysis';
import { BrowserRunner } from './browser';
import { canVerify, executeRun, verifyRepair } from './execution';
import { Store } from './store';

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const runId = z.uuid();
const runInput = z.strictObject({ projectId: slug, workflowId: slug, scenarioId: slug });
const modelName = /^[A-Za-z0-9_.:/-]{1,100}$/;
const artifacts = [
  'baseline.png',
  'variant.png',
  'difference.png',
  'repair-before.png',
  'repair-after.png',
];
const loopbackHost = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
function localRequest(req: IncomingMessage) {
  if (!loopbackHost.test(req.headers.host ?? '') || req.headers['sec-fetch-site'] === 'cross-site')
    return false;
  if (!req.headers.origin) return true;
  try {
    const origin = new URL(req.headers.origin);
    return (
      origin.protocol === 'http:' &&
      loopbackHost.test(origin.host) &&
      origin.origin === req.headers.origin
    );
  } catch {
    return false;
  }
}

class ClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createControlPlane(root: string, options: { serveWeb?: boolean; model?: string } = {}) {
  const store = new Store(root);
  const runner = new BrowserRunner();
  const app = express();
  const server = createServer(app);
  const socket = new Server(server, {
    allowRequest: (req, callback) => callback(null, localRequest(req)),
    serveClient: false,
    maxHttpBufferSize: 8192,
  });
  const tasks: { run: Run; repair: boolean }[] = [];
  let busy = false;
  const save = (run: Run) => {
    store.saveRun(run);
    socket.emit('run:update', { id: run.id, status: run.status, phase: run.phase });
  };
  for (const run of store.runs()) {
    if (['queued', 'running'].includes(run.status)) {
      run.status = 'error';
      run.phase = 'Interrupted';
      run.error = 'The service stopped before execution completed.';
      run.risk = assess(run);
      save(run);
    } else if (['Repair queued', 'Verifying reviewed patch'].includes(run.phase)) {
      run.phase = 'Complete';
      run.error = 'The service stopped during repair verification.';
      save(run);
    }
  }
  async function drain() {
    if (busy) return;
    busy = true;
    try {
      while (tasks.length) {
        const { run, repair } = tasks.shift()!;
        try {
          delete run.error;
          if (repair) {
            run.phase = 'Verifying reviewed patch';
            save(run);
            run.repair = await verifyRepair(run, runner, store.directory(run.id));
            run.phase = 'Complete';
          } else {
            run.status = 'running';
            await executeRun(run, runner, store.directory(run.id), (phase) => {
              run.phase = phase;
              save(run);
            });
          }
        } catch (error) {
          const missingBrowser =
            error instanceof Error && error.message.includes("Executable doesn't exist");
          run.error = missingBrowser
            ? 'Chromium is unavailable. Run npx playwright install chromium.'
            : 'Execution stopped. Review the API log for details.';
          run.phase = repair ? 'Complete' : 'Execution error';
          if (!repair) run.status = 'error';
          run.risk = assess(run);
          console.error(
            'BreakTrace execution error',
            run.id,
            error instanceof Error ? error.message.split('\n')[0] : 'unknown',
          );
        }
        save(run);
      }
    } finally {
      busy = false;
    }
  }
  function enqueue(run: Run, repair: boolean) {
    if (tasks.length + Number(busy) >= 5) throw new ClientError(429, 'Execution queue is full');
    save(run);
    tasks.push({ run, repair });
    void drain().catch(() => console.error('Unable to save queued execution'));
  }
  function requireRun(value: unknown) {
    const run = store.getRun(runId.parse(value));
    if (!run) throw new ClientError(404, 'Run not found');
    return run;
  }

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (!localRequest(req)) return res.status(403).json({ error: 'Local workspace access is required' });
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
    });
    next();
  });
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '48kb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', scope: 'local demo' }));
  app.get('/api/config', (_req, res) =>
    res.json({
      ...store.catalog(),
      endpoints,
      ai: Boolean(options.model && modelName.test(options.model)),
    }),
  );
  app.put('/api/projects', (req, res) => {
    const project = projectSchema.parse(req.body);
    const catalog = store.catalog();
    catalog.projects = [...catalog.projects.filter(({ id }) => id !== project.id), project];
    if (catalog.projects.length > 30) throw new ClientError(409, 'Project limit reached');
    store.saveCatalog(catalog);
    res.json(project);
  });
  app.put('/api/workflows', (req, res) => {
    const workflow = workflowSchema.parse(req.body);
    const catalog = store.catalog();
    catalog.workflows = [...catalog.workflows.filter(({ id }) => id !== workflow.id), workflow];
    if (catalog.workflows.length > 30) throw new ClientError(409, 'Workflow limit reached');
    store.saveCatalog(catalog);
    res.json(workflow);
  });
  app.put('/api/scenarios', (req, res) => {
    const scenario = scenarioSchema.parse(req.body);
    if (
      scenario.mutations.some(
        (mutation) =>
          !endpoints.some(
            ({ path, method }) => path === mutation.endpoint && method === mutation.method,
          ),
      )
    )
      throw new ClientError(400, 'Mutation target must be a registered demo operation');
    const catalog = store.catalog();
    catalog.scenarios = [...catalog.scenarios.filter(({ id }) => id !== scenario.id), scenario];
    if (catalog.scenarios.length > 50) throw new ClientError(409, 'Scenario limit reached');
    store.saveCatalog(catalog);
    res.json(scenario);
  });
  app.post('/api/openapi', (req, res) => {
    const catalog = store.catalog();
    catalog.imported = importOperations(openApiSchema.parse(req.body));
    store.saveCatalog(catalog);
    res.json(catalog.imported);
  });
  app.put('/api/settings/gate', (req, res) => {
    const catalog = store.catalog();
    catalog.thresholds = gateSchema.parse(req.body);
    store.saveCatalog(catalog);
    res.json(catalog.thresholds);
  });
  app.get('/api/runs', (_req, res) =>
    res.json(
      store
        .runs()
        .map(({ id, createdAt, phase, status, risk, project, workflow, scenario, findings }) => ({
          id,
          createdAt,
          phase,
          status,
          risk,
          project: project.name,
          workflow: workflow.name,
          scenario: scenario.name,
          findings: findings?.length ?? 0,
        })),
    ),
  );
  app.post('/api/runs', (req, res) => {
    const input = runInput.parse(req.body);
    const catalog = store.catalog();
    const project = catalog.projects.find(({ id }) => id === input.projectId);
    const workflow = catalog.workflows.find(({ id }) => id === input.workflowId);
    const scenario = catalog.scenarios.find(({ id }) => id === input.scenarioId);
    if (!project || !workflow || !scenario)
      throw new ClientError(404, 'Project, workflow or scenario not found');
    if (store.runs().length >= 150)
      throw new ClientError(409, 'Local run limit reached. Use another data directory for new runs.');
    const run: Run = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'queued',
      phase: 'Queued',
      workflow,
      project,
      scenario,
      thresholds: catalog.thresholds,
    };
    enqueue(run, false);
    res.status(202).json({ id: run.id });
  });
  app.get('/api/runs/:id', (req, res) => res.json(requireRun(req.params.id)));
  app.get('/api/runs/:id/report', (req, res) => {
    const run = requireRun(req.params.id);
    res.attachment(`breaktrace-${run.id}.json`).json(run);
  });
  app.get('/api/runs/:id/artifact/:name', (req, res) => {
    const run = requireRun(req.params.id);
    if (!artifacts.includes(req.params.name)) throw new ClientError(404, 'Artifact not found');
    const path = join(store.directory(run.id), req.params.name);
    if (!existsSync(path)) throw new ClientError(404, 'Artifact not found');
    res.sendFile(path, { dotfiles: 'allow' });
  });
  app.get('/api/runs/:id/test', (req, res) => {
    const run = requireRun(req.params.id);
    if (!run.baseline || !run.variant || ['queued', 'running', 'error'].includes(run.status))
      throw new ClientError(409, 'Run evidence is unavailable');
    if (req.query.download === '1') res.attachment(`breaktrace-${run.id}.spec.ts`);
    res.type('text/plain').send(generateRegression(run));
  });
  app.post('/api/runs/:id/repair', (req, res) => {
    const run = requireRun(req.params.id);
    z.strictObject({ approved: z.literal(true) }).parse(req.body);
    if (!canVerify(run) || run.phase !== 'Complete')
      throw new ClientError(409, 'This run is unavailable for the reviewed pricing patch');
    run.phase = 'Repair queued';
    enqueue(run, true);
    res.status(202).json({ id: run.id });
  });
  app.get('/api/runs/:id/analysis', (req, res) => {
    const run = requireRun(req.params.id);
    res.json({
      source: 'Deterministic rules',
      text: recommendations(run),
      repairAvailable: canVerify(run),
    });
  });
  let aiBusy = false;
  app.post('/api/runs/:id/analysis', async (req, res) => {
    const run = requireRun(req.params.id);
    if (!options.model || !modelName.test(options.model))
      throw new ClientError(409, 'No local Ollama model configured');
    if (aiBusy) throw new ClientError(429, 'A local analysis is already running');
    aiBusy = true;
    try {
      res.json(await optionalOllama(options.model).describe(run));
    } catch {
      throw new ClientError(503, 'Local model unavailable. Deterministic analysis remains available.');
    } finally {
      aiBusy = false;
    }
  });
  app.get('/api/compare', (req, res) => {
    const params = z.object({ before: runId, after: runId }).parse(req.query);
    const before = requireRun(params.before);
    const after = requireRun(params.after);
    const first = before.baseline?.observations ?? [];
    const second = after.baseline?.observations ?? [];
    const changes = first.flatMap((row) => {
      const next = second.find((entry) => entry.method === row.method && entry.path === row.path);
      return next
        ? diffShape(row.shape, next.shape).map((change) => ({
            ...change,
            endpoint: `${row.method} ${row.path}`,
          }))
        : [];
    });
    const key = (item: { method: string; path: string }) => `${item.method} ${item.path}`;
    const beforeKeys = new Set(first.map(key));
    const afterKeys = new Set(second.map(key));
    res.json({
      changes,
      onlyBefore: [...beforeKeys].filter((item) => !afterKeys.has(item)),
      onlyAfter: [...afterKeys].filter((item) => !beforeKeys.has(item)),
    });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));
  const webRoot = resolve('apps/web/dist');
  if (options.serveWeb && existsSync(join(webRoot, 'index.html'))) {
    app.use(express.static(webRoot));
    app.get(/.*/, (_req, res) => res.sendFile(join(webRoot, 'index.html')));
  }
  const onError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: error.issues
          .slice(0, 4)
          .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
          .join(' · '),
      });
    if (error instanceof ClientError) return res.status(error.status).json({ error: error.message });
    if (error?.status === 413 || error?.status === 400)
      return res.status(error.status).json({ error: 'Invalid or oversized JSON body' });
    console.error('BreakTrace API error', error instanceof Error ? error.name : 'unknown');
    return res.status(500).json({ error: 'Unexpected server error' });
  };
  app.use(onError);
  return {
    app,
    server,
    close: async () => {
      await runner.close();
      await socket.close();
    },
  };
}
