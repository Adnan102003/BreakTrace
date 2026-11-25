import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { BrowserRunner } from '../apps/api/browser';
import { executeRun } from '../apps/api/execution';
import { TargetAuthority } from '../apps/api/targets';
import { startRoomBoard } from '../apps/demo/room-board';
import type { ExternalProject, Mutation, RuleSource, Run, Workflow } from '../packages/shared/contracts';
import { thresholds } from '../packages/shared/demo';

const fixture = await startRoomBoard();
const runner = new BrowserRunner();
const root = resolve(process.argv[2] || '.data/rooms-benchmark');
const endpoint = '/availability/quiet-lab';
const project: ExternalProject = {
  kind: 'external',
  id: 'room-board',
  name: 'Room Board',
  url: fixture.url,
  endpoints: [{ method: 'GET', path: endpoint }],
  captureScreenshots: true,
};
const dom: RuleSource = { from: 'dom', key: 'free-seats', read: 'text' };
const measured = (path: string): RuleSource => ({ from: 'api', method: 'GET', endpoint, path });
const workflow: Workflow = {
  id: 'availability',
  name: 'Validate room availability',
  projectId: project.id,
  start: '/board',
  steps: [
    { action: 'click', target: 'view-availability' },
    { action: 'visible', target: 'summary' },
    {
      action: 'rules',
      rules: [
        {
          id: 'reference',
          name: 'Five seats are available',
          op: 'equal',
          left: dom,
          right: { from: 'literal', value: 5 },
        },
        {
          id: 'capacity-required',
          name: 'Capacity exists',
          op: 'required',
          source: measured('room.capacity'),
        },
        {
          id: 'valid-availability',
          name: 'Availability is within bounds',
          op: 'range',
          source: dom,
          min: 0,
          max: 8,
        },
        {
          id: 'blocked-boolean',
          name: 'Blocked flag is boolean',
          op: 'type',
          source: measured('blocked'),
          expected: 'boolean',
        },
        {
          id: 'arithmetic',
          name: 'Available equals capacity less reserved',
          op: 'sum-products',
          total: dom,
          terms: [{ price: measured('room.capacity'), quantity: { from: 'literal', value: 1 } }],
          subtract: measured('reserved'),
        },
      ],
    },
  ],
};
const cases: { id: string; expected: 'passed' | 'failed'; mutations: Mutation[] }[] = [
  { id: 'baseline', expected: 'passed', mutations: [] },
  {
    id: 'capacity-renamed',
    expected: 'failed',
    mutations: [{ method: 'GET', endpoint, operator: 'rename', path: 'room.capacity', to: 'limit' }],
  },
  {
    id: 'reserved-negative',
    expected: 'failed',
    mutations: [{ method: 'GET', endpoint, operator: 'negative', path: 'reserved' }],
  },
  {
    id: 'room-label-removed',
    expected: 'passed',
    mutations: [{ method: 'GET', endpoint, operator: 'remove', path: 'room.name' }],
  },
];
try {
  await mkdir(root, { recursive: true });
  const authority = new TargetAuthority([], undefined, undefined, [fixture.url]);
  fixture.setProof(authority.issue(project.id, fixture.url).contents);
  const proof = await authority.verify(project.id, fixture.url);
  const target = await authority.authorized(fixture.url, proof.token);
  const results = [];
  for (const entry of cases) {
    const run: Run = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'running',
      phase: 'Starting',
      project,
      workflow,
      thresholds,
      scenario: { ...entry, name: entry.id, projectId: project.id, seed: 42 },
    };
    await executeRun(run, runner, join(root, entry.id), undefined, target);
    const verified =
      run.status === entry.expected &&
      (entry.expected === 'passed' ||
        (run.isolation?.status === 'verified' && run.isolation.indices.join() === '0'));
    await writeFile(join(root, entry.id, 'run.json'), JSON.stringify(run, null, 2));
    results.push({
      id: entry.id,
      expected: entry.expected,
      observed: run.status,
      verified,
      findings: run.findings?.map(({ key }) => key),
      isolation: run.isolation ? { status: run.isolation.status, indices: run.isolation.indices } : null,
    });
  }
  const summary = { fixture: 'Room Board', executed: results.length, results };
  await writeFile(join(root, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
  if (results.some((result) => !result.verified)) process.exitCode = 1;
} finally {
  await runner.close();
  await fixture.close();
}
