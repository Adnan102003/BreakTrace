import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { BrowserRunner } from '../apps/api/browser';
import { executeRun, verifyRepair } from '../apps/api/execution';
import { checkout, projects, scenarios, thresholds } from '../packages/shared/demo';
import type { Run } from '../packages/shared/contracts';

const run: Run = {
  id: randomUUID(),
  createdAt: new Date().toISOString(),
  status: 'running',
  phase: '',
  project: projects[0],
  workflow: checkout,
  scenario: scenarios[2],
  thresholds,
};
const runner = new BrowserRunner();
try {
  const directory = process.argv[2]
    ? resolve(process.argv[2])
    : resolve('.data', 'smoke-evidence', run.id);
  await executeRun(run, runner, directory, console.log);
  console.log(
    JSON.stringify(
      {
        status: run.status,
        baselineIssues: run.baseline?.issueLog,
        findings: run.findings,
        applied: run.variant?.applied,
        isolation: run.isolation?.status,
        indices: run.isolation?.indices,
        risk: run.risk?.score,
      },
      null,
      2,
    ),
  );
  if (
    run.status !== 'failed' ||
    run.isolation?.status !== 'verified' ||
    run.isolation.indices.join(',') !== '1'
  ) {
    throw new Error('Expected one isolated pricing mutation');
  }
  const repair = await verifyRepair(run, runner, directory);
  console.log(JSON.stringify(repair.checks, null, 2));
  if (!repair.passed) throw new Error('Reviewed patch should pass');
  run.repair = repair;
  const patched: Run = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'running',
    phase: 'Queued',
    project: projects[1],
    workflow: run.workflow,
    scenario: run.scenario,
    thresholds,
  };
  await executeRun(patched, runner);
  await writeFile(join(directory, 'original.json'), JSON.stringify(run, null, 2));
  await writeFile(join(directory, 'repaired.json'), JSON.stringify(patched, null, 2));
} finally {
  await runner.close();
}
