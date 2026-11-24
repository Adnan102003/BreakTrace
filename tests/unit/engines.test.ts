import { describe, expect, it } from 'vitest';
import { diffShape, importOperations, assess } from '../../apps/api/analysis';
import { mutate, responseShape } from '../../packages/mutation-engine';
import { isolate } from '../../packages/mutation-engine/isolate';
import { scenarioSchema, type Mutation, type Run } from '../../packages/shared/contracts';
import { checkout, projects, renamePrice, thresholds } from '../../packages/shared/demo';
import { evaluate } from '../../packages/validation-engine';
import { generateRegression } from '../../packages/test-generator';

const field = { method: 'GET', endpoint: '/api/store/product/field-pack', path: 'price' } as const;
const run = (): Run => ({
  id: '',
  createdAt: '',
  status: 'passed',
  phase: 'Complete',
  project: projects[0],
  workflow: checkout,
  scenario: renamePrice,
  thresholds,
});

describe('mutation engine', () => {
  it('composes mutations without mutating the fixture', () => {
    const input = { price: 4800, tags: ['forest'], metadata: { label: 'Trail' } };
    const output = mutate(
      input,
      [
        { ...field, operator: 'rename', to: 'total' },
        { ...field, operator: 'empty-array', path: 'tags' },
        { ...field, operator: 'null', path: 'metadata.label' },
      ],
      42,
    );
    expect(output.json).toEqual({ total: 4800, tags: [], metadata: { label: null } });
    expect(input.price).toBe(4800);
    expect(output.applied).toEqual([0, 1, 2]);
  });
  it('keeps seeded values stable across subset minimization', () => {
    const first: Mutation = { ...field, operator: 'remove', path: 'tags' };
    const second: Mutation = { ...field, operator: 'number' };
    expect(mutate({ price: 1 }, [first, second], 42).json).toEqual(
      mutate({ price: 1 }, [second], 42, 200, [1]).json,
    );
    expect(mutate({ price: 1 }, [second], 43, 200, [1]).json).not.toEqual(
      mutate({ price: 1 }, [second], 42, 200, [1]).json,
    );
  });
  it('rejects prototype paths and caps the combined delay', () => {
    expect(
      scenarioSchema.safeParse({
        ...renamePrice,
        mutations: [{ ...field, operator: 'remove', path: '__proto__.polluted' }],
      }).success,
    ).toBe(false);
    const { method, endpoint } = field;
    expect(
      mutate(
        {},
        [
          { method, endpoint, operator: 'delay', ms: 1800 },
          { method, endpoint, operator: 'delay', ms: 1000 },
        ],
        42,
      ).delay,
    ).toBe(2500);
  });
  it('records response types without retaining sensitive names or values', () => {
    const shape = responseShape({
      token: 'secret',
      key: 'synthetic',
      nested: { cookie: 'sensitive', quantity: 2 },
      products: [{ price: 2 }],
    });
    expect(shape).toEqual({
      $: 'object',
      key: 'string',
      nested: 'object',
      'nested.quantity': 'number',
      products: 'array',
      'products[]': 'object',
      'products[].price': 'number',
    });
    expect(JSON.stringify(shape)).not.toContain('synthetic');
  });
});

describe('failure isolation', () => {
  it('keeps interacting mutations and excludes unrelated changes', async () => {
    const result = await isolate(4, ['rule:total'], async (indices) =>
      indices.includes(0) && indices.includes(2) ? ['rule:total'] : [],
    );
    expect(result.status).toBe('verified');
    expect(result.indices).toEqual([0, 2]);
    expect(result.history.at(-1)?.outcome).toBe('reproduced');
  });
  it('does not accept a different failure signature', async () => {
    const result = await isolate(2, ['rule:expected'], async (indices) =>
      indices.length === 2 ? ['rule:expected'] : indices.length ? ['rule:other'] : [],
    );
    expect(result.indices).toEqual([0, 1]);
    expect(result.history.some((trial) => trial.outcome === 'different')).toBe(true);
  });
  it('marks an unstable failure and preserves its trial history', async () => {
    let attempts = 0;
    const result = await isolate(2, ['broken'], async (indices) =>
      indices.length && ++attempts === 1 ? ['broken'] : [],
    );
    expect(result.status).toBe('flaky');
    expect(result.history).toHaveLength(3);
  });
});

describe('analysis and rules', () => {
  it('evaluates integer arithmetic and rejects missing operands', async () => {
    const rule = {
      id: 'cart-math',
      name: 'Cart math',
      op: 'sum-products',
      total: { from: 'dom', key: 'total' },
      terms: [{ price: { from: 'literal', value: 4800 }, quantity: { from: 'literal', value: 2 } }],
      subtract: { from: 'literal', value: 960 },
    } as const;
    const withTerms = { ...rule, terms: [...rule.terms] };
    expect((await evaluate(withTerms, async () => 8640)).passed).toBe(true);
    expect((await evaluate(withTerms, async () => null)).passed).toBe(false);
  });
  it('imports only descriptive operations and identifies structural changes', () => {
    expect(
      importOperations({
        openapi: '3.1.0',
        paths: {
          '/orders': { get: { summary: 'Orders' }, parameters: [], $ref: 'https://unused.invalid' },
        },
      }),
    ).toEqual([{ method: 'GET', path: '/orders', summary: 'Orders' }]);
    expect(diffShape({ price: 'number' }, { productPrice: 'number' })).toEqual([
      { field: 'price', before: 'number', after: null },
      { field: 'productPrice', before: null, after: 'number' },
    ]);
  });
  it('explains score contributions and respects user thresholds', () => {
    expect(assess(run()).gate).toBe('PASS');
    const record = run();
    record.status = 'failed';
    record.findings = [{ key: 'rule:total', kind: 'rule', message: 'Unexpected total', page: '/cart' }];
    const assessment = assess(record);
    expect(assessment.gate).toBe('WARNING');
    expect(assessment.score).toBe(50);
    expect(assessment.factors.reduce((sum, factor) => sum + factor.points, 0)).toBe(assessment.score);
  });
  it('generates a reviewable spec using escaped strings and meaningful assertions', () => {
    const record = run();
    record.scenario = { ...record.scenario, name: 'Price "\n change' };
    const spec = generateRegression(record);
    expect(spec).toContain('Price \\"\\n change');
    expect(spec).toContain(
      'await expect(page.getByTestId("order-status")).toHaveText("Order confirmed")',
    );
    expect(spec).toContain('await installInterception');
  });
});
