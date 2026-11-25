import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { Store } from '../../apps/api/store';
import { createControlPlane } from '../../apps/api/app';
import { projects, scenarios, thresholds, workflows } from '../../packages/shared/demo';
import type { Run } from '../../packages/shared/contracts';

it('marks recovered queued and running records interrupted while preserving evidence', async () => {
  await mkdir('.data', { recursive: true });
  const root = await mkdtemp(resolve('.data/recovery-'));
  const store = new Store(root);
  const run: Run = {
    id: randomUUID(),
    project: projects[0],
    workflow: workflows[0],
    scenario: scenarios[0],
    createdAt: new Date().toISOString(),
    status: 'running',
    phase: 'Applying response mutations',
    thresholds,
    baseline: { durationMs: 2, issueLog: [], observations: [], rules: [], pages: ['/'], applied: [] },
  };
  const queued: Run = {
    ...run,
    id: randomUUID(),
    status: 'queued',
    phase: 'Queued',
    baseline: undefined,
  };
  await store.saveRun(run);
  await store.saveRun(queued);
  const control = createControlPlane(root);
  try {
    await control.ready;
    expect(store.getRun(run.id)).toMatchObject({
      status: 'error',
      phase: 'Interrupted',
      baseline: run.baseline,
    });
    expect(store.getRun(queued.id)).toMatchObject({ status: 'error', phase: 'Interrupted' });
  } finally {
    await control.close();
  }
});
