import { z } from 'zod';

export const fieldPattern = /^(?:[A-Za-z_][\w-]*|\d+)(?:\.(?:[A-Za-z_][\w-]*|\d+)){0,7}$/;
export const safeKey = (key: string) => !['__proto__', 'prototype', 'constructor'].includes(key);
export const field = z
  .string()
  .max(100)
  .regex(fieldPattern)
  .refine((value) => value.split('.').every(safeKey));
const endpoint = z
  .string()
  .max(120)
  .regex(/^\/api\/store\/[a-zA-Z0-9/_-]+$/);
const name = z.string().trim().min(1).max(80);
const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const method = z.enum(['GET', 'POST']);

const onField = { endpoint, method, path: field };
const onResponse = { endpoint, method };
export const mutationSchema = z.discriminatedUnion('operator', [
  z.object({
    ...onField,
    operator: z.enum(['remove', 'null', 'type', 'empty-array', 'number', 'negative']),
  }),
  z.object({
    ...onField,
    operator: z.literal('rename'),
    to: z
      .string()
      .regex(/^[A-Za-z_][\w-]{0,39}$/)
      .refine(safeKey),
  }),
  z.object({ ...onField, operator: z.literal('replace'), value: z.json() }),
  z.object({ ...onResponse, operator: z.enum(['empty', 'timeout', 'malformed']) }),
  z.object({
    ...onResponse,
    operator: z.literal('status'),
    status: z.union([
      z.literal(400),
      z.literal(401),
      z.literal(403),
      z.literal(404),
      z.literal(429),
      z.literal(500),
      z.literal(503),
    ]),
  }),
  z.object({ ...onResponse, operator: z.literal('delay'), ms: z.number().int().min(1).max(2500) }),
]);
export type Mutation = z.infer<typeof mutationSchema>;
export const scenarioSchema = z.object({
  id,
  name,
  seed: z.number().int().min(0).max(2147483647),
  mutations: z.array(mutationSchema).max(8),
});
export type Scenario = z.infer<typeof scenarioSchema>;

const testId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/);
const pagePath = z.enum(['/', '/product/field-pack', '/cart', '/checkout', '/confirmation']);
const source = z.discriminatedUnion('from', [
  z.object({ from: z.literal('dom'), key: testId }),
  z.object({ from: z.literal('literal'), value: z.number().finite() }),
]);
export const ruleSchema = z.discriminatedUnion('op', [
  z
    .object({
      id,
      name,
      op: z.literal('range'),
      source,
      min: z.number().finite(),
      max: z.number().finite(),
    })
    .refine((rule) => rule.min <= rule.max),
  z.object({ id, name, op: z.literal('equal'), left: source, right: source }),
  z.object({
    id,
    name,
    op: z.literal('sum-products'),
    total: source,
    terms: z
      .array(z.object({ price: source, quantity: source }))
      .min(1)
      .max(10),
    subtract: source.optional(),
  }),
]);
export type Rule = z.infer<typeof ruleSchema>;
export const stepSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('click'), target: testId, path: pagePath.optional() }),
  z.object({ action: z.literal('visible'), target: testId }),
  z.object({ action: z.literal('text'), target: testId, value: z.string().max(100) }),
  z.object({ action: z.literal('rules'), rules: z.array(ruleSchema).min(1).max(10) }),
]);
export type Step = z.infer<typeof stepSchema>;
export const workflowSchema = z
  .object({ id, name, start: pagePath, steps: z.array(stepSchema).min(1).max(16) })
  .refine(
    (workflow) =>
      workflow.steps.reduce(
        (count, step) => count + (step.action === 'rules' ? step.rules.length : 0),
        0,
      ) <= 16,
  )
  .refine((workflow) => {
    const ids = workflow.steps.flatMap((step) =>
      step.action === 'rules' ? step.rules.map((rule) => rule.id) : [],
    );
    return new Set(ids).size === ids.length;
  }, 'Rule IDs must be unique within a workflow');
export type Workflow = z.infer<typeof workflowSchema>;
export const projectSchema = z.object({ id, name, version: z.enum(['original', 'resilient']) });
export type Project = z.infer<typeof projectSchema>;
export const gateSchema = z
  .object({ warning: z.number().int().min(1).max(99), block: z.number().int().min(2).max(100) })
  .refine((gate) => gate.warning < gate.block);
export type Gate = z.infer<typeof gateSchema>;
export type ApiOperation = { method: string; path: string; summary?: string };
export type Shape = Record<string, string>;
export type Observation = {
  method: string;
  path: string;
  page: string;
  status: number | null;
  durationMs: number;
  shape: Shape;
};
export type Issue = {
  key: string;
  kind: 'rule' | 'assertion' | 'navigation' | 'runtime' | 'network' | 'console';
  severity?: 'high' | 'medium';
  message: string;
  page: string;
};
export type RuleResult = {
  id: string;
  name: string;
  passed: boolean;
  actual: number | null;
  expected: string;
};
export type Execution = {
  durationMs: number;
  issueLog: Issue[];
  observations: Observation[];
  rules: RuleResult[];
  pages: string[];
  applied: number[];
  screenshot?: string;
  screenshotPage?: string;
};
export type Experiment = {
  indices: number[];
  outcome: 'reproduced' | 'passed' | 'different' | 'error';
  findings: string[];
  durationMs: number;
};
export type Isolation = {
  status: 'verified' | 'flaky' | 'budget' | 'inconclusive';
  indices: number[];
  history: Experiment[];
  target: string[];
};
export type Risk = {
  score: number;
  gate: 'PASS' | 'WARNING' | 'BLOCK';
  factors: { label: string; points: number }[];
  thresholds: Gate;
  coverage: { observed: number; total: number };
};
export type Repair = {
  before: Execution;
  after: Execution;
  checks: { name: string; passed: boolean }[];
  passed: boolean;
  patch: string;
};
export type Run = {
  id: string;
  createdAt: string;
  status: 'queued' | 'running' | 'passed' | 'failed' | 'inconclusive' | 'error';
  phase: string;
  workflow: Workflow;
  project: Project;
  scenario: Scenario;
  thresholds: Gate;
  baseline?: Execution;
  variant?: Execution;
  findings?: Issue[];
  isolation?: Isolation;
  screenshots?: { changedPixels: number; totalPixels: number; diff?: string };
  risk?: Risk;
  repair?: Repair;
  error?: string;
};
