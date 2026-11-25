import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { join, resolve } from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import { Server } from 'socket.io';
import { z } from 'zod';
import {
  gateSchema,
  externalOperationSchema,
  projectSchema,
  scenarioSchema,
  workflowSchema,
  type Run,
  type ExternalProject,
} from '../../packages/shared/contracts';
import { endpoints, operationsFor, projects } from '../../packages/shared/demo';
import { generateRegression } from '../../packages/test-generator';
import {
  assess,
  diffShape,
  importOperations,
  openApiSchema,
  parseOpenApiDocument,
  optionalOllama,
  recommendations,
} from './analysis';
import { BrowserRunner } from './browser';
import { canVerify, executeRun, verifyRepair } from './execution';
import { Store, type Catalog, type Persistence } from './store';
import { externalOrigin, TargetAuthority, TargetError } from './targets';

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
      origin.host === req.headers.host &&
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

export function createControlPlane(
  root: string,
  options: {
    serveWeb?: boolean;
    model?: string;
    store?: Persistence;
    targets?: TargetAuthority;
  } = {},
) {
  const store: Persistence = options.store ?? new Store(root);
  const targets = options.targets ?? new TargetAuthority([]);
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
  const save = async (run: Run) => {
    await store.saveRun(run);
    socket.emit('run:update', { id: run.id, status: run.status, phase: run.phase });
  };
  async function restoreRuns() {
    for (const run of await store.runs()) {
      if (['queued', 'running'].includes(run.status)) {
        run.status = 'error';
        run.phase = 'Interrupted';
        run.error = 'The service stopped before execution completed.';
        run.risk = assess(run);
        await save(run);
      } else if (['Repair queued', 'Verifying reviewed patch'].includes(run.phase)) {
        run.phase = 'Complete';
        run.error = 'The service stopped during repair verification.';
        await save(run);
      }
    }
  }
  const ready = restoreRuns();
  let writes = Promise.resolve();
  function serialize<T>(task: () => Promise<T>) {
    const result = writes.then(task);
    writes = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  const currentProject = (catalog: Catalog, id: string) =>
    catalog.projects.find((project) => project.id === id);
  const externalProject = (catalog: Catalog, id: string): ExternalProject => {
    const project = currentProject(catalog, id);
    if (!project || project.kind !== 'external')
      throw new ClientError(404, 'External project not found');
    return project;
  };
  const proofFor = (catalog: Catalog, project: ExternalProject) =>
    catalog.targetProofs.find((proof) => proof.projectId === project.id && proof.origin === project.url);
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
            await save(run);
            run.repair = await verifyRepair(run, runner, store.directory(run.id));
            run.phase = 'Complete';
          } else {
            run.status = 'running';
            const project = run.project;
            const target =
              project.kind === 'external'
                ? await (async () => {
                    const catalog = await store.catalog();
                    const proof = proofFor(catalog, project);
                    if (!proof || externalProject(catalog, project.id).url !== project.url) {
                      throw new TargetError('The target authorization is no longer valid');
                    }
                    return targets.authorized(project.url, proof.token);
                  })()
                : undefined;
            await executeRun(
              run,
              runner,
              store.directory(run.id),
              async (phase) => {
                run.phase = phase;
                await save(run);
              },
              target,
            );
          }
        } catch (error) {
          const missingBrowser =
            error instanceof Error && error.message.includes("Executable doesn't exist");
          run.error =
            error instanceof TargetError
              ? error.message
              : missingBrowser
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
        await save(run);
      }
    } finally {
      busy = false;
    }
  }
  async function enqueue(run: Run, repair: boolean) {
    if (tasks.length + Number(busy) >= 5) throw new ClientError(429, 'Execution queue is full');
    await save(run);
    tasks.push({ run, repair });
    void drain().catch(() => console.error('Unable to save queued execution'));
  }
  async function requireRun(value: unknown) {
    const run = await store.getRun(runId.parse(value));
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
  app.use('/api', async (_req, res, next) => {
    await ready;
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/openapi', express.json({ limit: '512kb' }));
  app.use(express.json({ limit: '48kb' }));
  app.get('/api/health', (_req, res) =>
    res.json({ status: 'ok', scope: 'local demo', storage: store.mode }),
  );
  app.get('/api/config', async (_req, res) => {
    const { targetProofs, ...catalog } = await store.catalog();
    res.json({
      ...catalog,
      endpoints,
      storage: store.mode,
      authorization: catalog.projects.flatMap((project) =>
        project.kind === 'external'
          ? [
              {
                projectId: project.id,
                allowlisted: targets.includes(project.url),
                verifiedAt: targetProofs.find(
                  (proof) => proof.projectId === project.id && proof.origin === project.url,
                )?.verifiedAt,
              },
            ]
          : [],
      ),
      ai: Boolean(options.model && modelName.test(options.model)),
    });
  });
  app.put('/api/projects', async (req, res) => {
    const project = projectSchema.parse(req.body);
    if (project.kind === 'external') {
      if (projects.some(({ id }) => id === project.id))
        throw new ClientError(409, 'Choose a new ID for the external project');
      project.url = externalOrigin(project.url);
    }
    await serialize(async () => {
      const catalog = await store.catalog();
      catalog.projects = [...catalog.projects.filter(({ id }) => id !== project.id), project];
      catalog.targetProofs = catalog.targetProofs.filter(
        (proof) =>
          proof.projectId !== project.id ||
          (project.kind === 'external' && project.url === proof.origin),
      );
      if (catalog.projects.length > 30) throw new ClientError(409, 'Project limit reached');
      await store.saveCatalog(catalog);
    });
    res.json(project);
  });
  app.post('/api/projects/:id/challenge', async (req, res) => {
    z.strictObject({ staging: z.literal(true) }).parse(req.body);
    const project = externalProject(await store.catalog(), slug.parse(req.params.id));
    res.json(targets.issue(project.id, project.url));
  });
  app.post('/api/projects/:id/verify', async (req, res) => {
    const project = externalProject(await store.catalog(), slug.parse(req.params.id));
    const proof = await targets.verify(project.id, project.url);
    await serialize(async () => {
      const catalog = await store.catalog();
      if (externalProject(catalog, project.id).url !== project.url)
        throw new ClientError(409, 'The project origin changed');
      catalog.targetProofs = [
        ...catalog.targetProofs.filter((entry) => entry.projectId !== project.id),
        proof,
      ];
      await store.saveCatalog(catalog);
    });
    res.json({ verifiedAt: proof.verifiedAt });
  });
  app.delete('/api/projects/:id/authorization', async (req, res) => {
    await serialize(async () => {
      const catalog = await store.catalog();
      const project = externalProject(catalog, slug.parse(req.params.id));
      catalog.targetProofs = catalog.targetProofs.filter((proof) => proof.projectId !== project.id);
      await store.saveCatalog(catalog);
    });
    res.json({ revoked: true });
  });
  app.put('/api/workflows', async (req, res) => {
    const workflow = workflowSchema.parse(req.body);
    await serialize(async () => {
      const catalog = await store.catalog();
      if (workflow.projectId) externalProject(catalog, workflow.projectId);
      const existing = catalog.workflows.find(({ id }) => id === workflow.id);
      if (existing && existing.projectId !== workflow.projectId)
        throw new ClientError(409, 'Choose a new workflow ID for this project');
      catalog.workflows = [...catalog.workflows.filter(({ id }) => id !== workflow.id), workflow];
      if (catalog.workflows.length > 30) throw new ClientError(409, 'Workflow limit reached');
      await store.saveCatalog(catalog);
    });
    res.json(workflow);
  });
  app.put('/api/scenarios', async (req, res) => {
    const scenario = scenarioSchema.parse(req.body);
    await serialize(async () => {
      const catalog = await store.catalog();
      const operations = scenario.projectId
        ? externalProject(catalog, scenario.projectId).endpoints
        : endpoints;
      if (
        scenario.mutations.some(
          (mutation) =>
            !operations.some(
              ({ path, method }) => path === mutation.endpoint && method === mutation.method,
            ),
        )
      ) {
        throw new ClientError(400, 'Mutation target must be a registered project operation');
      }
      const existing = catalog.scenarios.find(({ id }) => id === scenario.id);
      if (existing && existing.projectId !== scenario.projectId)
        throw new ClientError(409, 'Choose a new scenario ID for this project');
      catalog.scenarios = [...catalog.scenarios.filter(({ id }) => id !== scenario.id), scenario];
      if (catalog.scenarios.length > 50) throw new ClientError(409, 'Scenario limit reached');
      await store.saveCatalog(catalog);
    });
    res.json(scenario);
  });
  app.post('/api/openapi', async (req, res) => {
    const { projectId, register } = z
      .object({ projectId: slug.optional(), register: z.literal('1').optional() })
      .parse(req.query);
    let operations;
    if (typeof req.body?.document === 'string') {
      const { document } = z.strictObject({ document: z.string().min(1).max(480_000) }).parse(req.body);
      try {
        operations = importOperations(parseOpenApiDocument(document));
      } catch {
        throw new ClientError(400, 'Enter a valid OpenAPI 3.x JSON or YAML document without aliases');
      }
    } else operations = importOperations(openApiSchema.parse(req.body));
    if (register && !projectId)
      throw new ClientError(400, 'Select an external project before registering operations');
    await serialize(async () => {
      const catalog = await store.catalog();
      if (projectId) {
        const project = externalProject(catalog, projectId);
        catalog.projectImports = [
          ...catalog.projectImports.filter((entry) => entry.projectId !== projectId),
          { projectId, operations },
        ];
        if (register) {
          const known = new Map(
            project.endpoints.map((operation) => [`${operation.method} ${operation.path}`, operation]),
          );
          for (const operation of operations) {
            const candidate = externalOperationSchema.safeParse(operation);
            if (candidate.success) known.set(`${operation.method} ${operation.path}`, candidate.data);
          }
          if (known.size > 80) throw new ClientError(409, 'Registered operation limit exceeded');
          project.endpoints = [...known.values()];
        }
      } else catalog.imported = operations;
      await store.saveCatalog(catalog);
    });
    res.json(operations);
  });
  app.put('/api/settings/gate', async (req, res) => {
    const thresholds = gateSchema.parse(req.body);
    await serialize(async () => {
      const catalog = await store.catalog();
      catalog.thresholds = thresholds;
      await store.saveCatalog(catalog);
    });
    res.json(thresholds);
  });
  app.get('/api/runs', async (_req, res) =>
    res.json(
      (await store.runs()).map(
        ({ id, createdAt, phase, status, risk, project, workflow, scenario, findings }) => ({
          id,
          createdAt,
          phase,
          status,
          risk,
          project: project.name,
          workflow: workflow.name,
          scenario: scenario.name,
          findings: findings?.length ?? 0,
        }),
      ),
    ),
  );
  app.post('/api/runs', async (req, res) => {
    const input = runInput.parse(req.body);
    const id = await serialize(async () => {
      const catalog = await store.catalog();
      const project = currentProject(catalog, input.projectId);
      const scope = project?.kind === 'external' ? project.id : undefined;
      const workflow = catalog.workflows.find(
        ({ id, projectId }) => id === input.workflowId && projectId === scope,
      );
      const scenario = catalog.scenarios.find(
        ({ id, projectId }) => id === input.scenarioId && projectId === scope,
      );
      if (!project || !workflow || !scenario)
        throw new ClientError(404, 'Project, workflow or scenario not found');
      if (
        project.kind === 'external' &&
        (!targets.includes(project.url) || !proofFor(catalog, project))
      ) {
        throw new ClientError(403, 'Verify the external target before starting an execution');
      }
      if (
        scenario.mutations.some(
          (mutation) =>
            !operationsFor(project).some(
              ({ method, path }) => method === mutation.method && path === mutation.endpoint,
            ),
        )
      ) {
        throw new ClientError(409, 'The scenario references an operation that is no longer registered');
      }
      if ((await store.runs()).length >= 150)
        throw new ClientError(409, 'This data store has reached its 150-run limit');
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
      await enqueue(run, false);
      return run.id;
    });
    res.status(202).json({ id });
  });
  app.get('/api/runs/:id', async (req, res) => res.json(await requireRun(req.params.id)));
  app.get('/api/runs/:id/report', async (req, res) => {
    const run = await requireRun(req.params.id);
    res.attachment(`breaktrace-${run.id}.json`).json(run);
  });
  app.get('/api/runs/:id/artifact/:name', async (req, res) => {
    const run = await requireRun(req.params.id);
    if (!artifacts.includes(req.params.name)) throw new ClientError(404, 'Artifact not found');
    const path = join(store.directory(run.id), req.params.name);
    if (!existsSync(path)) throw new ClientError(404, 'Artifact not found');
    res.sendFile(path, { dotfiles: 'allow' });
  });
  app.get('/api/runs/:id/test', async (req, res) => {
    const run = await requireRun(req.params.id);
    if (!run.baseline || !run.variant || ['queued', 'running', 'error'].includes(run.status))
      throw new ClientError(409, 'Run evidence is unavailable');
    if (req.query.download === '1') res.attachment(`breaktrace-${run.id}.spec.ts`);
    res.type('text/plain').send(generateRegression(run));
  });
  app.post('/api/runs/:id/repair', async (req, res) => {
    z.strictObject({ approved: z.literal(true) }).parse(req.body);
    const id = await serialize(async () => {
      const run = await requireRun(req.params.id);
      if (!canVerify(run) || run.phase !== 'Complete')
        throw new ClientError(409, 'This run is unavailable for the reviewed pricing patch');
      run.phase = 'Repair queued';
      await enqueue(run, true);
      return run.id;
    });
    res.status(202).json({ id });
  });
  app.get('/api/runs/:id/analysis', async (req, res) => {
    const run = await requireRun(req.params.id);
    res.json({
      source: 'Deterministic rules',
      text: recommendations(run),
      repairAvailable: canVerify(run),
    });
  });
  let aiBusy = false;
  app.post('/api/runs/:id/analysis', async (req, res) => {
    const run = await requireRun(req.params.id);
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
  app.get('/api/compare', async (req, res) => {
    const params = z.object({ before: runId, after: runId }).parse(req.query);
    const [before, after] = await Promise.all([requireRun(params.before), requireRun(params.after)]);
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
    if (error instanceof TargetError) return res.status(400).json({ error: error.message });
    if (error?.status === 413 || error?.status === 400)
      return res.status(error.status).json({ error: 'Invalid or oversized JSON body' });
    console.error('BreakTrace API error', error instanceof Error ? error.name : 'unknown');
    return res.status(500).json({ error: 'Unexpected server error' });
  };
  app.use(onError);
  return {
    app,
    server,
    ready,
    close: async () => {
      await runner.close();
      await socket.close();
      await store.close?.();
    },
  };
}
