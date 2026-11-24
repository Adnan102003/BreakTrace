import type { Run } from '../shared/contracts';

export function generateRegression(run: Run, sourceRoot = '../..') {
  const indices =
    run.isolation?.status === 'verified'
      ? run.isolation.indices
      : run.scenario.mutations.map((_, index) => index);
  const data = JSON.stringify(run.scenario, null, 2);
  const steps = run.workflow.steps.map((step, index) => {
    if (step.action === 'rules') {
      const definition = JSON.stringify(step, null, 2).replaceAll('\n', '\n  ');
      return (
        `  const rules${index + 1} = await checkStep(page, ${definition});\n` +
        `  for (const rule of rules${index + 1}) {\n` +
        `    const message = \`\${rule.name}: measured \${rule.actual}, expected \${rule.expected}\`;\n` +
        `    expect(rule.passed, message).toBe(true);\n  }`
      );
    }
    if (step.action === 'text')
      return `  await expect(page.getByTestId(${JSON.stringify(step.target)})).toHaveText(${JSON.stringify(step.value)});`;
    if (step.action === 'visible')
      return `  await expect(page.getByTestId(${JSON.stringify(step.target)})).toBeVisible();`;
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
    `import { installInterception } from '${sourceRoot}/packages/mutation-engine';\n` +
    `import { checkStep } from '${sourceRoot}/apps/api/browser';\n` +
    `import type { Scenario } from '${sourceRoot}/packages/shared/contracts';\n\n` +
    `const scenario: Scenario = ${data};\nconst activeMutations = ${JSON.stringify(indices)};\n\n` +
    `test(${JSON.stringify(`${run.workflow.name} handles ${run.scenario.name}`)}, async ({ page, context }) => {\n` +
    `  const resilient = process.env.BREAKTRACE_RESILIENT === undefined\n` +
    `    ? ${run.project.version === 'resilient'} : process.env.BREAKTRACE_RESILIENT === '1';\n` +
    `  const demo = await startDemo({ resilient });\n` +
    `  const origin = demo.url;\n  try {\n    await installInterception(context, origin, scenario.mutations, scenario.seed, undefined, activeMutations);\n` +
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
