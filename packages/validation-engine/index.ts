import type { Rule, RuleResult } from '../shared/contracts';

type Value = { from: 'dom'; key: string } | { from: 'literal'; value: number };
export async function evaluate(
  rule: Rule,
  lookup: (key: string) => Promise<number | null>,
): Promise<RuleResult> {
  const resolve = (value: Value) =>
    value.from === 'literal' ? Promise.resolve(value.value) : lookup(value.key);
  const result = (actual: number | null, expected: string, passed: boolean) => ({
    id: rule.id,
    name: rule.name,
    actual,
    expected,
    passed,
  });
  if (rule.op === 'range') {
    const value = await resolve(rule.source);
    return result(
      value,
      `between ${rule.min} and ${rule.max}`,
      value !== null && value >= rule.min && value <= rule.max,
    );
  }
  if (rule.op === 'equal') {
    const [left, right] = await Promise.all([resolve(rule.left), resolve(rule.right)]);
    return result(
      left,
      right === null ? 'a present comparison value' : String(right),
      left !== null && right !== null && left === right,
    );
  }
  const amounts = await Promise.all(
    rule.terms.map(async ({ price, quantity }) => {
      const [p, q] = await Promise.all([resolve(price), resolve(quantity)]);
      return p === null || q === null ? null : p * q;
    }),
  );
  const [total, discount] = await Promise.all([
    resolve(rule.total),
    rule.subtract ? resolve(rule.subtract) : Promise.resolve(0),
  ]);
  const expected = amounts.reduce<number | null>(
    (sum, next) => (sum === null || next === null ? null : sum + next),
    0,
  );
  if (expected === null || discount === null || !Number.isFinite(expected - discount))
    return result(total, 'all arithmetic inputs present and finite', false);
  return result(total, String(expected - discount), total !== null && total === expected - discount);
}
