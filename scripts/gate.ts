import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const input = process.argv[2];
const report = z.object({
  status: z.enum(['passed', 'failed', 'inconclusive', 'error']),
  risk: z.object({
    gate: z.enum(['PASS', 'WARNING', 'BLOCK']),
    score: z.number().int().min(0).max(100),
  }),
});
try {
  if (!input) throw new Error('Usage: npm run gate -- <report.json>');
  const { status, risk } = report.parse(JSON.parse(await readFile(input, 'utf8')));
  console.log(JSON.stringify({ status, ...risk }));
  process.exitCode = status === 'inconclusive' || status === 'error' ? 2 : risk.gate === 'BLOCK' ? 1 : 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Report unavailable');
  process.exitCode = 2;
}
