import type { Rule, RuleResult, RuleSource } from '../shared/contracts';

type ApiSource = Extract<RuleSource, { from: 'api' }>;
const numeric = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const kind = (value: unknown) =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const describe = (value: unknown) =>
  typeof value === 'number' || typeof value === 'boolean' ? String(value) : kind(value);
export async function evaluate(
  rule: Rule,
  lookup: (key: string, read?: 'data-value' | 'text' | 'string') => Promise<unknown>,
  readApi: (source: ApiSource) => unknown = () => undefined,
): Promise<RuleResult> {
  const resolve = async (value: RuleSource) =>
    value.from === 'literal'
      ? value.value
      : value.from === 'api'
        ? readApi(value)
        : lookup(value.key, value.read);
  const result = (actual: number | null, expected: string, passed: boolean) => ({
    id: rule.id,
    name: rule.name,
    actual,
    expected,
    passed,
  });
  if (rule.op === 'range') {
    const value = numeric(await resolve(rule.source));
    return result(
      value,
      `between ${rule.min} and ${rule.max}`,
      value !== null && value >= rule.min && value <= rule.max,
    );
  }
  if (rule.op === 'required' || rule.op === 'type') {
    const value = await resolve(rule.source);
    const present =
      value !== null && value !== undefined && (typeof value !== 'string' || value.trim().length > 0);
    return rule.op === 'type'
      ? result(numeric(value), `type ${rule.expected}`, kind(value) === rule.expected)
      : result(numeric(value), 'a present value', present);
  }
  if (rule.op === 'compare') {
    const [left, right] = await Promise.all([resolve(rule.left), resolve(rule.right)]);
    const a = numeric(left);
    const b = numeric(right);
    const comparisons =
      a === null || b === null ? null : { lt: a < b, lte: a <= b, gt: a > b, gte: a >= b };
    const passed =
      rule.comparison === 'neq'
        ? left !== undefined && right !== undefined && !Object.is(left, right)
        : Boolean(comparisons?.[rule.comparison]);
    return result(a, `${rule.comparison} ${describe(right)}`, passed);
  }
  if (rule.op === 'equal') {
    const [left, right] = await Promise.all([resolve(rule.left), resolve(rule.right)]);
    return result(
      numeric(left),
      right === undefined ? 'a present comparison value' : describe(right),
      left !== undefined && right !== undefined && Object.is(left, right),
    );
  }
  const amounts = await Promise.all(
    rule.terms.map(async ({ price, quantity }) => {
      const [p, q] = (await Promise.all([resolve(price), resolve(quantity)])).map(numeric);
      return p === null || q === null ? null : p * q;
    }),
  );
  const [total, discount] = (
    await Promise.all([resolve(rule.total), rule.subtract ? resolve(rule.subtract) : Promise.resolve(0)])
  ).map(numeric);
  const expected = amounts.reduce<number | null>(
    (sum, next) => (sum === null || next === null ? null : sum + next),
    0,
  );
  if (expected === null || discount === null || !Number.isFinite(expected - discount))
    return result(total, 'all arithmetic inputs present and finite', false);
  return result(total, String(expected - discount), total !== null && total === expected - discount);
}
