import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import type { Execution, Run } from '../../packages/shared/contracts';

const html = (value: unknown) =>
  String(value ?? '—').replace(
    /[&<>"']/g,
    (key) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[key]!,
  );
const table = (head: string[], rows: unknown[][]) =>
  rows.length
    ? `<table><thead><tr>${head.map((cell) => `<th scope="col">${html(cell)}</th>`).join('')}</tr></thead><tbody>${rows
        .map((row) => `<tr>${row.map((cell) => `<td>${html(cell)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`
    : '<p>No evidence was recorded for this section.</p>';

const screenshots = [
  'baseline.png',
  'variant.png',
  'difference.png',
  'repair-before.png',
  'repair-after.png',
];
async function images(directory: string, entries: [string, string | undefined][]) {
  const pictures = await Promise.all(
    entries.map(async ([label, filename]) => {
      if (!filename || !screenshots.includes(filename)) return '';
      const path = join(directory, filename);
      const info = await stat(path).catch(() => undefined);
      if (!info?.isFile() || info.size > 2_000_000) return '';
      const data = await readFile(path);
      if (!data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '';
      return `<figure><img alt="${html(label)}" src="data:image/png;base64,${data.toString('base64')}"><figcaption>${html(label)}</figcaption></figure>`;
    }),
  );
  return pictures.filter(Boolean).join('');
}

function observed(execution: Execution | undefined) {
  return (
    execution?.observations.map((item) => [
      item.method,
      item.path,
      item.page,
      item.status ?? 'Aborted',
      `${item.durationMs} ms`,
      Object.keys(item.shape).join(', '),
    ]) ?? []
  );
}

export async function renderReport(run: Run, directory: string) {
  const before = run.baseline;
  const after = run.variant;
  const evidence = await images(directory, [
    ['Baseline screen', before?.screenshot],
    ['Mutated screen', after?.screenshot],
    ['Screenshot difference', run.screenshots?.diff],
    ['Before the repair', run.repair?.before.screenshot],
    ['After the repair', run.repair?.after.screenshot],
  ]);
  const ruleRows = [
    ['Baseline', before],
    ['Mutated', after],
  ].flatMap(
    ([label, execution]) =>
      (execution as Execution | undefined)?.rules.map((rule) => [
        label,
        rule.name,
        rule.actual,
        rule.expected,
        rule.passed ? 'Pass' : 'Fail',
      ]) ?? [],
  );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>BreakTrace execution report</title><style>
body{max-width:1050px;margin:32px auto;padding:0 24px;font:14px/1.5 system-ui,sans-serif;color:#182235;background:#fff}
header{border-bottom:3px solid #394b91;padding-bottom:16px}h1{font-size:32px;margin:.3em 0}h2{font-size:19px;margin:26px 0 8px}
h3{font-size:15px;margin:16px 0 6px}table{border-collapse:collapse;width:100%;overflow-wrap:anywhere;margin-bottom:12px}
th,td{padding:7px 9px;text-align:left;vertical-align:top;border-bottom:1px solid #dbe1eb}th{background:#eef1f8}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5fa;padding:10px}figure{margin:0 0 14px;break-inside:avoid}
img{max-width:100%;height:auto;border:1px solid #dbe1eb}figcaption{font-size:12px}p{margin:6px 0}tr{break-inside:avoid}
@media print{body{margin:0;padding:0;font-size:11px}h2,h3{break-after:avoid}}
</style></head><body>
<header><p>BREAKTRACE · EXECUTION REPORT</p><h1>${html(run.scenario.name)}</h1>
<p>${html(run.project.name)} · ${html(run.workflow.name)}</p><p>${html(run.createdAt)} · Run ${html(run.id)}</p></header>
<h2>Execution summary</h2>${table(['Status', 'Project origin', 'Seed', 'Mutation count', 'Phase'], [[run.status, run.project.kind === 'external' ? run.project.url : 'Bundled Fieldwork fixture', run.scenario.seed, run.scenario.mutations.length, run.phase]])}
${run.error ? `<p>${html(run.error)}</p>` : ''}
<h2>Baseline and mutated behavior</h2>${table(
    ['Run', 'Duration', 'Pages', 'Issues'],
    [
      ['Baseline', before?.durationMs, before?.pages.join(', '), before?.issueLog.length],
      ['Mutated', after?.durationMs, after?.pages.join(', '), after?.issueLog.length],
    ],
  )}
<h2>Detected findings</h2>${table(
    ['Kind', 'Page', 'Evidence'],
    (run.findings ?? []).map((item) => [item.kind, item.page, item.message]),
  )}
<h2>Business rules</h2>${table(['Run', 'Rule', 'Measured', 'Expected', 'Result'], ruleRows)}
<h2>Observed API dependencies</h2><h3>Baseline</h3>${table(['Method', 'Path', 'Page', 'Status', 'Time', 'Observed fields'], observed(before))}
<h3>Mutated</h3>${table(['Method', 'Path', 'Page', 'Status', 'Time', 'Observed fields'], observed(after))}
<h2>Mutation isolation</h2><p>${html(run.isolation?.status)} · Selected indices ${html(run.isolation?.indices.join(', '))}</p>
${table(
  ['Applied indices', 'Outcome', 'Findings', 'Milliseconds'],
  (run.isolation?.history ?? []).map((trial) => [
    trial.indices.join(', '),
    trial.outcome,
    trial.findings.join(', '),
    trial.durationMs,
  ]),
)}
<h2>Screenshots</h2>${evidence || '<p>No screenshots were captured.</p>'}
<h2>Repair verification</h2>${
    run.repair
      ? `<p>${html(run.repair.patch)}</p>${table(
          ['Check', 'Result'],
          run.repair.checks.map((check) => [check.name, check.passed ? 'Pass' : 'Fail']),
        )}${run.repair.review ? `<p>Affected files ${html(run.repair.review.files.join(', '))}</p><pre>${html(run.repair.review.diff)}</pre>` : ''}`
      : '<p>No repair was verified.</p>'
  }
<h2>Deployment risk</h2><p>${html(run.risk?.gate)} · ${html(run.risk?.score)} / 100</p>
${table(
  ['Factor', 'Points'],
  (run.risk?.factors ?? []).map((item) => [item.label, item.points]),
)}
<h2>Known limitations</h2><p>Evidence covers the workflows and API paths recorded in this run. Associations do not establish code-level causality. The score is an execution policy result.</p>
</body></html>`;
}

export async function printReport(document: string) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(document, { waitUntil: 'load', timeout: 8000 });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      tagged: true,
      margin: { top: '14mm', bottom: '14mm', left: '13mm', right: '13mm' },
    });
  } finally {
    await browser.close();
  }
}
