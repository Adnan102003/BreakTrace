import { createHash, randomUUID } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, sep } from 'node:path';
import { z } from 'zod';
import { matchOperation, type Repair, type Run, type Workflow } from '../../packages/shared/contracts';
import type { ExternalTransport } from '../../packages/mutation-engine';
import type { BrowserRunner } from './browser';
import { TargetError } from './targets';

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const textFile = /\.(?:html|[m]?js|css|json)$/;
const safePath = /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;
export const repairChanges = z.strictObject({
  changes: z
    .array(
      z.strictObject({
        path: z.string().max(240).regex(safePath).regex(textFile),
        content: z.string().max(16_384),
      }),
    )
    .min(1)
    .max(5),
});
type Snapshot = Map<string, Buffer>;
type Review = NonNullable<Repair['review']>;
type Candidate = {
  runId: string;
  expires: number;
  root: string;
  before: Snapshot;
  after: Snapshot;
  review: Review;
};

async function snapshot(root: string): Promise<Snapshot> {
  const files: Snapshot = new Map();
  let entries = 0;
  let size = 0;
  const base = await realpath(root);
  async function visit(path: string, depth: number) {
    if (depth > 8) throw new TargetError('The approved static directory exceeds the nesting limit');
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (++entries > 400)
        throw new TargetError('The approved static directory exceeds the entry limit');
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const next = join(path, entry.name);
      if (entry.isSymbolicLink())
        throw new TargetError('The approved static directory contains a symbolic link');
      const key = relative(base, next).split(sep).join('/');
      if (!safePath.test(key)) continue;
      if (entry.isDirectory()) {
        await visit(next, depth + 1);
      } else if (entry.isFile() && Object.hasOwn(mime, extname(key))) {
        const info = await lstat(next);
        if (!info.isFile() || info.nlink !== 1 || (await realpath(next)) !== next)
          throw new TargetError('The approved static directory contains a linked file');
        if (info.size > 2_000_000 || size + info.size > 8_000_000)
          throw new TargetError('The approved static directory exceeds the file size budget');
        const content = await readFile(next);
        size += content.length;
        if (content.length !== info.size)
          throw new TargetError('A source file changed while loading the static snapshot');
        files.set(key, content);
      }
    }
  }
  await visit(base, 0);
  if (!files.has('index.html'))
    throw new TargetError('The approved static directory requires index.html');
  return files;
}

function digest(files: Snapshot) {
  const hash = createHash('sha256');
  for (const path of [...files.keys()].sort()) {
    const content = files.get(path)!;
    hash.update(JSON.stringify([path, content.length])).update(content);
  }
  return hash.digest('hex');
}

function unified(path: string, before: string, after: string) {
  const lines = (value: string, prefix: string) => {
    const result = value.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    return {
      count: result.length,
      text: result
        .map(
          (line) => `${prefix}${line.endsWith('\n') ? line : `${line}\n\\ No newline at end of file\n`}`,
        )
        .join(''),
    };
  };
  const old = lines(before, '-');
  const next = lines(after, '+');
  return `--- a/${path}\n+++ b/${path}\n@@ -${old.count ? 1 : 0},${old.count} +${next.count ? 1 : 0},${next.count} @@\n${old.text}${next.text}`;
}

export class StaticRepairs {
  readonly configured: Set<string>;
  private readonly roots: Record<string, string>;
  private readonly pending = new Map<string, Candidate>();

  constructor(value = process.env.BREAKTRACE_REPAIR_ROOTS ?? '{}') {
    this.roots = z
      .record(z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/), z.string().refine(isAbsolute))
      .parse(JSON.parse(value));
    this.configured = new Set(Object.keys(this.roots));
  }

  available(run: Run) {
    return (
      run.project.kind === 'external' && run.status === 'failed' && this.configured.has(run.project.id)
    );
  }

  async preview(run: Run, changes: z.infer<typeof repairChanges>['changes']) {
    const root = this.roots[run.project.id];
    const before = await this.readSource(root);
    const after = new Map(before);
    const files = new Set<string>();
    const diffs: string[] = [];
    for (const { path, content } of changes) {
      if (files.has(path)) throw new TargetError('Provide one replacement per file');
      const old = before.get(path);
      if (!old || old.length > 16_384 || !Buffer.from(old.toString()).equals(old))
        throw new TargetError('Each replacement must refer to an existing small UTF-8 static file');
      const replacement = Buffer.from(content);
      if (old.equals(replacement)) throw new TargetError('Each replacement must change its source file');
      files.add(path);
      diffs.push(unified(path, old.toString(), content));
      after.set(path, replacement);
    }
    for (const [id, item] of this.pending) {
      if (item.expires <= Date.now() || item.runId === run.id) this.pending.delete(id);
    }
    if (this.pending.size >= 10) throw new TargetError('Too many pending patch reviews');
    const id = randomUUID();
    const review = { files: [...files], diff: diffs.join('') };
    this.pending.set(id, {
      runId: run.id,
      expires: Date.now() + 15 * 60_000,
      root,
      before,
      after,
      review,
    });
    return { id, ...review };
  }

  claim(run: Run, id: string) {
    const candidate = this.pending.get(id);
    if (!candidate || candidate.runId !== run.id || candidate.expires <= Date.now())
      throw new TargetError('Preview the proposed replacements again before approval');
    return candidate;
  }

  consume(id: string) {
    this.pending.delete(id);
  }

  async verify(
    run: Run,
    candidate: Candidate,
    runner: BrowserRunner,
    directory: string,
    suite: Workflow[],
  ): Promise<Repair> {
    if (run.project.kind !== 'external')
      throw new TargetError('This patch requires an external project');
    const original = digest(candidate.before);
    if (digest(await this.readSource(candidate.root)) !== original)
      throw new TargetError('The approved static source changed after preview. Review a fresh diff.');
    const { endpoints, captureScreenshots } = run.project;
    const signal = AbortSignal.timeout(360_000);
    const execute = (files: Snapshot, workflow: Workflow, indices: number[], name?: string) => {
      const transport = this.transport(files, endpoints);
      return runner.execute(
        transport.origin,
        workflow,
        run.scenario,
        indices,
        name && captureScreenshots ? { directory, name } : undefined,
        transport,
        signal,
      );
    };
    const active = run.scenario.mutations.map((_item, index) => index);
    const before = await execute(candidate.before, run.workflow, active, 'repair-before.png');
    const after = await execute(candidate.after, run.workflow, active, 'repair-after.png');
    const keys = (items: { key: string }[]) => JSON.stringify(items.map(({ key }) => key).sort());
    const checks = [
      {
        name: 'Original failure signature reproduced',
        passed:
          Boolean(run.findings?.length) &&
          keys(before.issueLog) === keys(run.findings ?? []) &&
          before.applied.length === active.length,
      },
      {
        name: 'Original scenario passes after patch',
        passed: !after.issueLog.length && after.applied.length === active.length,
      },
    ];
    for (const workflow of suite) {
      const baseline = await execute(candidate.after, workflow, []);
      checks.push({ name: `Baseline suite · ${workflow.name}`, passed: !baseline.issueLog.length });
    }
    signal.throwIfAborted();
    checks.push({
      name: 'Original source preserved',
      passed: digest(await this.readSource(candidate.root)) === original,
    });
    return {
      before,
      after,
      checks,
      passed: checks.every(({ passed }) => passed),
      patch: 'Reviewed patch in an isolated static copy',
      review: candidate.review,
    };
  }

  private async readSource(root: string) {
    try {
      return await snapshot(root);
    } catch (error) {
      if (error instanceof TargetError) throw error;
      throw new TargetError('The operator-approved static directory could not be read');
    }
  }

  private transport(files: Snapshot, operations: ExternalTransport['operations']): ExternalTransport {
    const origin = `https://${randomUUID()}.breaktrace.invalid`;
    return {
      origin,
      operations,
      async read(url, method) {
        if (url.origin !== origin || !['GET', 'HEAD'].includes(method))
          throw new TargetError('Request is outside the static copy');
        const path = url.pathname.slice(1);
        const key = !path
          ? 'index.html'
          : files.has(path)
            ? path
            : matchOperation(operations, method, url.pathname)
              ? `${path}.json`
              : `${path}/index.html`;
        const content = files.get(key);
        return {
          status: content ? 200 : 404,
          headers: {
            'content-type': content ? mime[extname(key)] : 'text/plain',
            'x-content-type-options': 'nosniff',
            'content-security-policy':
              "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
          },
          body: method === 'HEAD' || !content ? Buffer.alloc(0) : content,
        };
      },
    };
  }
}
