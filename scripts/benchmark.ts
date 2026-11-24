import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { platform, release } from 'node:os';
import { join, resolve } from 'node:path';
import { BrowserRunner } from '../apps/api/browser';
import { executeRun, verifyRepair } from '../apps/api/execution';
import { generateRegression } from '../packages/test-generator';
import { checkout, projects, thresholds } from '../packages/shared/demo';
import type { Run } from '../packages/shared/contracts';
import { cases } from './benchmark-cases';

const id = randomUUID().slice(0, 8);
const target = resolve(process.argv[2] || join('.data', 'benchmarks', id));
const specDirectory = resolve('.data', 'benchmark-specs', id);
await mkdir(target, { recursive: true });
await mkdir(specDirectory, { recursive: true });
const executeGenerated = async (filter: string, resilient: boolean) => {
  const report = join(target, resilient ? 'generated-repaired.json' : 'generated-original.json');
  const env = {
    ...process.env,
    BREAKTRACE_RESILIENT: resilient ? '1' : '0',
    BREAKTRACE_GENERATED_DIR: specDirectory,
    PLAYWRIGHT_JSON_OUTPUT_FILE: report,
    BREAKTRACE_GENERATED_OUTPUT: join(
      target,
      resilient ? 'generated-repaired-artifacts' : 'generated-original-artifacts',
    ),
  };
  const exitCode = await new Promise<number | null>((done, reject) => {
    const child = spawn(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        'playwright.generated.config.ts',
        '--reporter=json',
        filter,
      ],
      { env, stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('exit', done);
  });
  return { exitCode, report: JSON.parse(await readFile(report, 'utf8')) as PlaywrightReport };
};
type PlaywrightReport = { errors: unknown[]; suites: ReportSuite[] };
type ReportSuite = {
  suites?: ReportSuite[];
  specs?: { file: string; tests: { results: { status: string; error?: { message?: string } }[] }[] }[];
};
const flatten = (suites: ReportSuite[]): NonNullable<ReportSuite['specs']> =>
  suites.flatMap((suite) => [...(suite.specs ?? []), ...flatten(suite.suites ?? [])]);
const labelTime = new Date().toISOString();
const runner = new BrowserRunner();
const measurements: {
  fixture: (typeof cases)[number];
  run: Run;
  elapsedMs: number;
  isolationMatched: boolean;
  generatedFile?: string;
}[] = [];

try {
  for (const fixture of cases) {
    const scenario = fixture.scenario;
    const run: Run = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'running',
      phase: '',
      project: projects[fixture.resilient ? 1 : 0],
      workflow: checkout,
      scenario,
      thresholds,
    };
    const start = performance.now();
    try {
      await executeRun(run, runner);
    } catch (error) {
      run.status = 'error';
      run.error = error instanceof Error ? error.message.split('\n')[0] : 'Execution error';
    }
    const elapsedMs = Math.round(performance.now() - start);
    const isolationMatched =
      run.isolation?.status === 'verified' &&
      run.isolation.indices.join(',') === fixture.expectedIsolation?.join(',');
    const measurement: (typeof measurements)[number] = { fixture, run, elapsedMs, isolationMatched };
    measurements.push(measurement);
    if (run.status === 'failed' && fixture.expected === 'failure') {
      measurement.generatedFile = `bench-${id}-${fixture.repair ? 'repair-' : ''}${scenario.id}.spec.ts`;
      await writeFile(join(specDirectory, measurement.generatedFile), generateRegression(run, '../../..'));
    }
    if (fixture.repair && isolationMatched) {
      try {
        run.repair = await verifyRepair(run, runner, join(target, 'repairs', scenario.id));
      } catch (error) {
        run.error = error instanceof Error ? error.message.split('\n')[0] : 'Repair error';
      }
    }
    console.log(`${scenario.id.padEnd(25)} ${run.status.padEnd(13)} ${elapsedMs} ms`);
    await writeFile(join(target, 'measurements.json'), JSON.stringify(measurements, null, 2));
  }
} finally {
  await runner.close();
}

const controls = measurements.filter(({ fixture }) => fixture.expected === 'control');
const failures = measurements.filter(({ fixture }) => fixture.expected === 'failure');
const tp = failures.filter(({ run }) => run.status === 'failed').length;
const fp = controls.filter(({ run }) => run.status === 'failed').length;
const tn = controls.filter(({ run }) => run.status === 'passed').length;
const fn = failures.filter(({ run }) => run.status === 'passed').length;
const indeterminate = measurements.length - tp - fp - tn - fn;
const generated = measurements.filter(({ generatedFile }) => generatedFile);
const repairs = measurements.filter(({ fixture }) => fixture.repair);
const original = generated.length ? await executeGenerated(`bench-${id}-`, false) : undefined;
const patched = repairs.some(({ generatedFile }) => generatedFile)
  ? await executeGenerated(`bench-${id}-repair-`, true)
  : undefined;
const originalSpecs = flatten(original?.report.suites ?? []);
const patchedSpecs = flatten(patched?.report.suites ?? []);
const reproductions = originalSpecs.filter((spec) =>
  spec.tests.some((test) =>
    test.results.some(
      (result) =>
        result.status === 'failed' &&
        /expect|waiting for|getByTestId|Timeout/.test(result.error?.message ?? ''),
    ),
  ),
).length;
const patchedPasses = patchedSpecs.filter((spec) =>
  spec.tests.every((test) => test.results.every((result) => result.status === 'passed')),
).length;
const ratio = (value: number, total: number) => (total ? value / total : null);
const report = {
  collectedAt: labelTime,
  node: process.version,
  platform: `${platform()} ${release()}`,
  fixtures: measurements.length,
  tp,
  fp,
  tn,
  fn,
  indeterminate,
  missedFailures: failures.length - tp,
  precision: ratio(tp, tp + fp),
  recall: ratio(tp, failures.length),
  falsePositiveRate: ratio(fp, controls.length),
  isolation: {
    correct: failures.filter((item) => item.isolationMatched).length,
    total: failures.length,
  },
  meanExecutionMs: Math.round(
    measurements.reduce((total, item) => total + item.elapsedMs, 0) / measurements.length,
  ),
  generated: {
    failuresReproduced: reproductions,
    total: generated.length,
    repairedPassed: patchedPasses,
    repairSpecs: repairs.filter(({ generatedFile }) => generatedFile).length,
    originalExit: original?.exitCode,
    repairedExit: patched?.exitCode,
  },
  repair: { verified: repairs.filter(({ run }) => run.repair?.passed).length, eligible: repairs.length },
};
await writeFile(join(target, 'summary.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (
  indeterminate ||
  fp ||
  tp !== failures.length ||
  reproductions !== generated.length ||
  patchedPasses !== report.generated.repairSpecs ||
  report.repair.verified !== repairs.length ||
  report.isolation.correct !== failures.length
)
  process.exitCode = 1;
