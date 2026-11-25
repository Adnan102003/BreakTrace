import type { ExternalProject, Run } from '../shared/contracts';

function externalRegression(run: Run, project: ExternalProject, indices: number[], sourceRoot: string) {
  return (
    `// Save under tests/generated/ and run: npm run test:generated\n` +
    `// Set the target allowlist and BREAKTRACE_TARGET_PROOF for the verified origin.\n` +
    `import 'dotenv/config';\nimport { expect, test } from '@playwright/test';\n` +
    `import { BrowserRunner, compareIssues } from '${sourceRoot}/apps/api/browser';\n` +
    `import { TargetAuthority } from '${sourceRoot}/apps/api/targets';\n` +
    `import type { ExternalProject, Scenario, Workflow } from '${sourceRoot}/packages/shared/contracts';\n\n` +
    `const project: ExternalProject = ${JSON.stringify(project, null, 2)};\n` +
    `const workflow: Workflow = ${JSON.stringify(run.workflow, null, 2)};\n` +
    `const scenario: Scenario = ${JSON.stringify(run.scenario, null, 2)};\n` +
    `const activeMutations = ${JSON.stringify(indices)};\n\n` +
    `test(${JSON.stringify(`${run.workflow.name} handles ${run.scenario.name}`)}, async () => {\n` +
    `  // Separate Chromium contexts keep the baseline and mutation runs independent.\n` +
    `  const allowed = (process.env.BREAKTRACE_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);\n` +
    `  const token = (process.env.BREAKTRACE_TARGET_PROOF ?? '').trim().replace(/^breaktrace:/, '');\n` +
    `  const local = (process.env.BREAKTRACE_ALLOWED_LOCAL_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);\n` +
    `  const target = await new TargetAuthority(allowed, undefined, undefined, local).authorized(project.url, token);\n` +
    `  const transport = { ...target, operations: project.endpoints };\n` +
    `  const runner = new BrowserRunner();\n  try {\n` +
    `    const baseline = await runner.execute(target.origin, workflow, scenario, [], undefined, transport);\n` +
    `    expect(baseline.issueLog).toEqual([]);\n` +
    `    const variant = await runner.execute(target.origin, workflow, scenario, activeMutations, undefined, transport);\n` +
    `    expect(variant.applied).toEqual(activeMutations);\n` +
    `    expect(compareIssues(baseline, variant)).toEqual([]);\n` +
    `  } finally {\n    await runner.close();\n  }\n});\n`
  );
}

export function generateRegression(run: Run, sourceRoot = '../..') {
  const indices =
    run.isolation?.status === 'verified'
      ? run.isolation.indices
      : run.scenario.mutations.map((_, index) => index);
  if (run.project.kind === 'external') return externalRegression(run, run.project, indices, sourceRoot);
  const data = JSON.stringify(run.scenario, null, 2);
  const steps = run.workflow.steps.map((step, index) => {
    if (step.action === 'rules') {
      const definition = JSON.stringify(step, null, 2).replaceAll('\n', '\n  ');
      return (
        `  const rules${index + 1} = await checkStep(page, ${definition}, true, undefined, readApi);\n` +
        `  for (const rule of rules${index + 1}) {\n` +
        `    const message = \`\${rule.name}: measured \${rule.actual}, expected \${rule.expected}\`;\n` +
        `    expect(rule.passed, message).toBe(true);\n  }`
      );
    }
    if (step.action === 'text')
      return `  await expect(page.getByTestId(${JSON.stringify(step.target)})).toHaveText(${JSON.stringify(step.value)});`;
    if (step.action === 'visible')
      return `  await expect(page.getByTestId(${JSON.stringify(step.target)})).toBeVisible();`;
    if (step.action === 'navigate')
      return `  await page.goto(origin + ${JSON.stringify(step.path)});\n  await expect(page).toHaveURL(origin + ${JSON.stringify(step.path)});`;
    if (step.action === 'fill') return `  await checkStep(page, ${JSON.stringify(step)});`;
    const click = `  await page.getByTestId(${JSON.stringify(step.target)}).click();`;
    return step.path
      ? `${click}\n  await expect(page).toHaveURL(origin + ${JSON.stringify(step.path)});`
      : click;
  });
  return (
    `// Save under tests/generated/ and run: npm run test:generated\n` +
    `// BREAKTRACE_RESILIENT=1 selects the reviewed demo fix. Seed and indices preserve the experiment.\n` +
    `import { expect, test } from '@playwright/test';\n` +
    `import { startDemo } from '${sourceRoot}/apps/demo/server';\n` +
    `import { installInterception, responseField } from '${sourceRoot}/packages/mutation-engine';\n` +
    `import { checkStep } from '${sourceRoot}/apps/api/browser';\n` +
    `import type { RuleSource, Scenario } from '${sourceRoot}/packages/shared/contracts';\n\n` +
    `const scenario: Scenario = ${data};\nconst activeMutations = ${JSON.stringify(indices)};\n\n` +
    `test(${JSON.stringify(`${run.workflow.name} handles ${run.scenario.name}`)}, async ({ page, context }) => {\n` +
    `  const resilient = process.env.BREAKTRACE_RESILIENT === undefined\n` +
    `    ? ${run.project.version === 'resilient'} : process.env.BREAKTRACE_RESILIENT === '1';\n` +
    `  const demo = await startDemo({ resilient });\n` +
    `  const origin = demo.url;\n  const responses = new Map<string, unknown>();\n` +
    `  const readApi = (source: Extract<RuleSource, { from: 'api' }>) =>\n` +
    `    responseField(responses.get(\`\${source.method} \${source.endpoint}\`), source.path);\n` +
    `  try {\n    await installInterception(context, origin, scenario.mutations, scenario.seed, event => {\n` +
    `      responses.set(\`\${event.method} \${event.path}\`, event.data);\n    }, activeMutations);\n` +
    `    await page.goto(origin + ${JSON.stringify(run.workflow.start)});\n` +
    steps
      .map((step) =>
        step
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n'),
      )
      .join('\n') +
    `\n  } finally {\n    await demo.close();\n  }\n});\n`
  );
}
