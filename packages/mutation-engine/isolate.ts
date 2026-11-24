import type { Experiment, Isolation } from '../shared/contracts';

export async function isolate(
  size: number,
  target: string[],
  execute: (indices: number[]) => Promise<string[]>,
  budget = 24,
): Promise<Isolation> {
  const history: Experiment[] = [];
  let subset = Array.from({ length: size }, (_, index) => index);
  const signature = (keys: string[]) => JSON.stringify([...new Set(keys)].sort());
  const expected = signature(target);
  const conclude = (status: Isolation['status']): Isolation => ({
    status,
    indices: subset,
    history,
    target,
  });
  const trial = async (indices: number[]) => {
    const start = performance.now();
    let findings: string[] = [];
    let outcome: Experiment['outcome'];
    try {
      findings = await execute(indices);
      outcome =
        signature(findings) === expected ? 'reproduced' : findings.length ? 'different' : 'passed';
    } catch {
      outcome = 'error';
    }
    history.push({ indices, outcome, findings, durationMs: Math.round(performance.now() - start) });
    return outcome;
  };
  const control = await trial([]);
  if (control === 'error') return conclude('inconclusive');
  if (control !== 'passed') return conclude('flaky');
  for (let repeat = 0; repeat < 2; repeat++) {
    const original = await trial(subset);
    if (original === 'error') return conclude('inconclusive');
    if (original !== 'reproduced') return conclude('flaky');
  }
  let granularity = 2;
  while (subset.length > 1) {
    const width = Math.ceil(subset.length / granularity);
    const chunks = Array.from({ length: Math.ceil(subset.length / width) }, (_, index) =>
      subset.slice(index * width, (index + 1) * width),
    );
    const candidates = [
      ...chunks,
      ...chunks.map((chunk) => subset.filter((index) => !chunk.includes(index))),
    ];
    const attempted = new Set<string>();
    let reduced = false;
    for (const candidate of candidates) {
      const key = candidate.join(',');
      if (attempted.has(key)) continue;
      attempted.add(key);
      if (history.length >= budget - 2) return conclude('budget');
      const outcome = await trial(candidate);
      if (outcome === 'error') return conclude('inconclusive');
      if (outcome !== 'reproduced') continue;
      if (history.length >= budget - 2) return conclude('budget');
      const confirmation = await trial(candidate);
      if (confirmation === 'error') return conclude('inconclusive');
      if (confirmation !== 'reproduced') return conclude('flaky');
      subset = candidate;
      granularity = Math.max(2, granularity - 1);
      reduced = true;
      break;
    }
    if (reduced) continue;
    if (granularity >= subset.length) break;
    granularity = Math.min(subset.length, granularity * 2);
  }
  for (let repeat = 0; repeat < 2; repeat++) {
    const confirmation = await trial(subset);
    if (confirmation === 'error') return conclude('inconclusive');
    if (confirmation !== 'reproduced') return conclude('flaky');
  }
  return conclude('verified');
}
