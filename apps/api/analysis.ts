import { z } from 'zod';
import { parse } from 'yaml';
import {
  operationPath,
  type ApiOperation,
  type Run,
  type Risk,
  type Shape,
} from '../../packages/shared/contracts';
import { operationsFor } from '../../packages/shared/demo';

export function assess(run: Run): Risk {
  const issues = run.findings ?? [];
  const observed = new Set(run.baseline?.observations.map((item) => `${item.method} ${item.path}`));
  const endpoints = operationsFor(run.project);
  const coverage = {
    observed: endpoints.filter((item) => observed.has(`${item.method} ${item.path}`)).length,
    total: endpoints.length,
  };
  const ambiguity = ['error', 'inconclusive'].includes(run.status);
  const factors = [
    {
      label: 'Business rules violated',
      points: Math.min(50, issues.filter((issue) => issue.kind === 'rule').length * 25),
    },
    {
      label: 'Broken workflow or uncaught exception',
      points: issues.some((issue) => ['runtime', 'navigation', 'assertion'].includes(issue.kind))
        ? 40
        : 0,
    },
    {
      label: 'Failed transport or browser console',
      points: issues.some((issue) => ['network', 'console'].includes(issue.kind)) ? 15 : 0,
    },
    { label: 'Affected workflow', points: issues.length ? 10 : 0 },
    { label: 'Failure independently reproduced', points: run.isolation?.status === 'verified' ? 15 : 0 },
    {
      label:
        run.project.kind === 'external'
          ? 'Missing registered endpoint coverage'
          : 'Missing fixture endpoint coverage',
      points: coverage.total ? Math.round(15 * (1 - coverage.observed / coverage.total)) : 15,
    },
    { label: 'Run unavailable or uncertain', points: ambiguity ? run.thresholds.warning : 0 },
  ];
  const score = Math.min(
    100,
    factors.reduce((sum, factor) => sum + factor.points, 0),
  );
  return {
    score,
    gate: score >= run.thresholds.block ? 'BLOCK' : score >= run.thresholds.warning ? 'WARNING' : 'PASS',
    factors,
    thresholds: run.thresholds,
    coverage,
  };
}

const operation = z.object({ summary: z.string().max(160).optional() });
export const openApiSchema = z
  .object({
    openapi: z.string().regex(/^3\.[012]\.\d+$/),
    paths: z.record(
      z
        .string()
        .max(160)
        .regex(/^\/[\w{}./-]*$/),
      z.record(z.string(), z.unknown()),
    ),
  })
  .refine((input) => Object.keys(input.paths).length <= 160);

export function parseOpenApiDocument(document: string) {
  return openApiSchema.parse(parse(document, { schema: 'core', maxAliasCount: 0, uniqueKeys: true }));
}

export function importOperations(input: z.infer<typeof openApiSchema>): ApiOperation[] {
  return Object.entries(input.paths)
    .flatMap(([path, entry]) =>
      Object.entries(entry).flatMap(([method, value]) => {
        if (!operationPath.safeParse(path).success) return [];
        const parsed = operation.safeParse(value);
        if (
          !['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'].includes(method) ||
          !parsed.success
        )
          return [];
        return [{ method: method.toUpperCase(), path, summary: parsed.data.summary }];
      }),
    )
    .slice(0, 160);
}

export function diffShape(before: Shape, after: Shape) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .flatMap((field) =>
      before[field] === after[field]
        ? []
        : [{ field, before: before[field] ?? null, after: after[field] ?? null }],
    );
}

export interface AnalysisProvider {
  describe(run: Run): Promise<{ source: string; text: string }>;
}

export function recommendations(run: Run) {
  const selected =
    run.isolation?.status === 'verified'
      ? run.isolation.indices.map((index) => run.scenario.mutations[index])
      : run.scenario.mutations;
  const endpoints = [...new Set(selected.map((item) => item.endpoint))].join(', ');
  if (!run.findings?.length) return 'No new application findings were captured in this run.';
  if (run.project.kind === 'external' && run.findings.some((item) => item.kind === 'rule')) {
    return `Check the response field and the business assertions for ${endpoints || run.workflow.name}. Validate the contract at the boundary and run the affected workflow with a clean control.`;
  }
  if (run.findings.some((item) => item.kind === 'rule'))
    return `Check the response fields at ${endpoints}. Validate the price contract before calculation and compare the rendered cart total with an independent checkout quote.`;
  return `Check the handling of ${endpoints}. Add an explicit, recoverable error state and cover the recorded workflow assertion with a browser regression test.`;
}

export function optionalOllama(model: string): AnalysisProvider {
  return {
    async describe(run) {
      const facts = {
        findings: run.findings?.map(({ kind, severity }) => ({ kind, severity })),
        operators: run.scenario.mutations.map(({ operator }) => operator),
      };
      const response = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          options: { num_predict: 300 },
          prompt: `Explain likely causes and propose a defensive application change for this controlled browser test. State uncertainty. Evidence: ${JSON.stringify(facts)}`,
        }),
      });
      if (!response.ok) throw new Error('Local model unavailable');
      const result = z
        .object({ response: z.string().trim().min(1).max(6000) })
        .parse(await response.json());
      return { source: 'Ollama · unverified suggestion', text: result.response };
    },
  };
}
