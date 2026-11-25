import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { demoClient, reviewedPatch, startDemo } from '../demo/server';
import { workflows } from '../../packages/shared/demo';
import type { Repair, Run } from '../../packages/shared/contracts';
import { isolate } from '../../packages/mutation-engine/isolate';
import { BrowserRunner, compareIssues, compareScreens } from './browser';
import { assess } from './analysis';
import { TargetError, type PinnedTarget } from './targets';

const ids = (count: number) => Array.from({ length: count }, (_, index) => index);

export async function executeRun(
  run: Run,
  runner: BrowserRunner,
  directory?: string,
  update: (phase: string) => void | Promise<void> = () => {},
  target?: PinnedTarget,
  signal = AbortSignal.timeout(360_000),
) {
  const external = run.project.kind === 'external' ? run.project : undefined;
  if (external && (!target || target.origin !== external.url))
    throw new TargetError('Authorize this target before running a workflow');
  const demo = external
    ? undefined
    : await startDemo({ resilient: 'version' in run.project && run.project.version === 'resilient' });
  const transport = external && target ? { ...target, operations: external.endpoints } : undefined;
  const origin = transport?.origin ?? demo!.url;
  const save = (name: string) =>
    directory && (!external || external.captureScreenshots) ? { directory, name } : undefined;
  try {
    await update('Recording baseline');
    run.baseline = await runner.execute(
      origin,
      run.workflow,
      run.scenario,
      [],
      save('baseline.png'),
      transport,
      signal,
    );
    await update('Applying response mutations');
    const active = ids(run.scenario.mutations.length);
    run.variant = await runner.execute(
      origin,
      run.workflow,
      run.scenario,
      active,
      save('variant.png'),
      transport,
      signal,
    );
    run.findings = compareIssues(run.baseline, run.variant);
    let result: Run['status'] = run.baseline.issueLog.length
      ? 'inconclusive'
      : run.findings.length
        ? 'failed'
        : 'passed';
    if (result === 'passed' && active.length && run.variant.applied.length !== active.length)
      result = 'inconclusive';
    if (directory) run.screenshots = await compareScreens(directory, run.baseline, run.variant);
    if (result === 'failed' && run.findings.length) {
      await update('Isolating the failure');
      const signature = run.findings.map((issue) => issue.key);
      run.isolation = await isolate(active.length, signature, async (subset) =>
        compareIssues(
          run.baseline!,
          await runner.execute(origin, run.workflow, run.scenario, subset, undefined, transport, signal),
        ).map((issue) => issue.key),
      );
    }
    signal.throwIfAborted();
    run.status = result;
    run.risk = assess(run);
    run.phase = 'Complete';
  } catch (error) {
    if (signal.aborted)
      throw new TargetError(
        'Execution exceeded the six-minute limit. Completed evidence was preserved.',
      );
    throw error;
  } finally {
    await demo?.close();
  }
}

export function canVerify(run: Run) {
  return (
    run.project.kind !== 'external' &&
    run.project.version === 'original' &&
    run.status === 'failed' &&
    run.isolation?.status === 'verified' &&
    run.isolation.indices.some((index) => {
      const item = run.scenario.mutations[index];
      return item.operator === 'rename' && item.path === 'price' && item.to === 'productPrice';
    })
  );
}

export async function verifyRepair(run: Run, runner: BrowserRunner, directory: string): Promise<Repair> {
  if (!canVerify(run)) throw new Error('This run does not match the reviewed pricing patch');
  const workspace = join(directory, 'repair-workspace');
  await mkdir(workspace, { recursive: true });
  const client = join(workspace, 'client.js');
  const source = await demoClient();
  await writeFile(client, reviewedPatch(source));
  const original = await startDemo();
  try {
    const before = await runner.execute(
      original.url,
      run.workflow,
      run.scenario,
      ids(run.scenario.mutations.length),
      { directory, name: 'repair-before.png' },
    );
    const repaired = await startDemo({ reviewedClient: await readFile(client, 'utf8') });
    try {
      const after = await runner.execute(
        repaired.url,
        run.workflow,
        run.scenario,
        ids(run.scenario.mutations.length),
        { directory, name: 'repair-after.png' },
      );
      const checks = [
        {
          name: 'Original failure signature reproduced',
          passed:
            JSON.stringify(before.issueLog.map(({ key }) => key).sort()) ===
            JSON.stringify(run.findings?.map(({ key }) => key).sort()),
        },
        {
          name: 'Original scenario passes after patch',
          passed: !after.issueLog.length && after.applied.length === run.scenario.mutations.length,
        },
      ];
      for (const workflow of workflows) {
        const result = await runner.execute(repaired.url, workflow, run.scenario, []);
        checks.push({ name: `Baseline suite · ${workflow.name}`, passed: !result.issueLog.length });
      }
      checks.push({ name: 'Original source preserved', passed: source === (await demoClient()) });
      return {
        before,
        after,
        checks,
        passed: checks.every((check) => check.passed),
        patch: 'Reviewed demo patch · accept integer cents from price or productPrice',
      };
    } finally {
      await repaired.close();
    }
  } finally {
    await original.close();
  }
}
