import type { Mutation, Scenario } from '../packages/shared/contracts';
import { renamePrice, scenarios } from '../packages/shared/demo';

const catalog = '/api/store/catalog';
const product = '/api/store/product/field-pack';
const get = { method: 'GET', endpoint: product } as const;
type Case = {
  scenario: Scenario;
  expected: 'failure' | 'control';
  expectedIsolation?: number[];
  resilient?: boolean;
  repair?: boolean;
};
const failure = (
  id: string,
  name: string,
  mutations: Mutation[],
  expectedIsolation = [0],
  repair = false,
): Case => ({
  scenario: { id, name, seed: 42, mutations },
  expected: 'failure',
  expectedIsolation,
  repair,
});
const control = (id: string, name: string, mutations: Mutation[], resilient = false): Case => ({
  scenario: { id, name, seed: 42, mutations },
  expected: 'control',
  resilient,
});

export const cases: Case[] = [
  failure('missing-price', 'Missing price', [{ ...get, operator: 'remove', path: 'price' }]),
  failure('rename-price', 'Price renamed', renamePrice.mutations, [0], true),
  failure('null-price', 'Null price', [{ ...get, operator: 'null', path: 'price' }]),
  failure('price-type', 'Incorrect price type', [{ ...get, operator: 'type', path: 'price' }]),
  failure('empty-body', 'Empty product response', [{ ...get, operator: 'empty' }]),
  failure('empty-catalog', 'Empty catalog', [
    { ...get, endpoint: catalog, operator: 'empty-array', path: 'products' },
  ]),
  failure('large-price', 'Unexpected seeded price', [{ ...get, operator: 'number', path: 'price' }]),
  failure('negative-price', 'Negative price', [{ ...get, operator: 'negative', path: 'price' }]),
  ...([400, 401, 403, 404, 429, 500, 503] as const).map((status) =>
    failure(`http-${status}`, `Product returns HTTP ${status}`, [
      { ...get, operator: 'status', status },
    ]),
  ),
  failure('slow-product', 'Response exceeds client deadline', [{ ...get, operator: 'delay', ms: 1900 }]),
  failure('timeout', 'Product transport timeout', [{ ...get, operator: 'timeout' }]),
  failure('malformed', 'Malformed product JSON', [{ ...get, operator: 'malformed' }]),
  failure('nested-product', 'Nested catalog contract changes', [
    {
      ...get,
      endpoint: catalog,
      operator: 'replace',
      path: 'products.0',
      value: { product: { id: 'field-pack' } },
    },
  ]),
  failure('combined-drift', 'Price rename with benign mutations', scenarios[2].mutations, [1], true),
  control('baseline-control', 'Baseline replay', []),
  control('badge-omission', 'Omit optional badge', [{ ...get, operator: 'remove', path: 'badge' }]),
  control('badge-null', 'Null optional badge', [{ ...get, operator: 'null', path: 'badge' }]),
  control('details-empty', 'Missing optional detail labels', [
    { ...get, operator: 'replace', path: 'details', value: {} },
  ]),
  control('delay-short', '38 ms response latency', [{ ...get, operator: 'delay', ms: 38 }]),
  control('catalog-badge', 'Omit optional catalog badge', [
    { ...get, endpoint: catalog, operator: 'remove', path: 'products.0.badge' },
  ]),
  control('resilient-price', 'Resilient version accepts renamed price', renamePrice.mutations, true),
  control(
    'resilient-decorated',
    'Resilient version handles combined changes',
    scenarios[2].mutations,
    true,
  ),
  control('inventory-still-available', 'Inventory remains sufficient', [
    { ...get, operator: 'replace', path: 'stock', value: 7 },
  ]),
  control('same-price', 'Set existing price to the same amount', [
    { ...get, operator: 'replace', path: 'price', value: 4800 },
  ]),
];
