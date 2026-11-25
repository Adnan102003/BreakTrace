import { afterEach, expect, it, vi } from 'vitest';
import { analysisEvidence, configuredProviders } from '../../apps/api/analysis';
import type { Run } from '../../packages/shared/contracts';
import { projects, workflows, scenarios, thresholds } from '../../packages/shared/demo';

const run: Run = {
  id: 'recorded-test',
  project: projects[0],
  workflow: workflows[0],
  scenario: scenarios[1],
  createdAt: '',
  phase: 'Complete',
  status: 'failed',
  thresholds,
  variant: {
    durationMs: 1,
    pages: [],
    applied: [0],
    issueLog: [],
    observations: [
      {
        method: 'GET',
        path: '/api/store/catalog',
        page: '/',
        status: 200,
        durationMs: 1,
        shape: { price: 'number' },
        sample: { privateNote: 'Never send this body' },
      },
    ],
    rules: [
      { id: 'quote', name: 'A user-provided rule name', passed: false, actual: 0, expected: '8640' },
    ],
  },
  findings: [{ key: 'rule:quote', kind: 'rule', message: 'Captured display text', page: '/checkout' }],
  isolation: {
    status: 'verified',
    indices: [0],
    history: [{ indices: [0], outcome: 'reproduced', durationMs: 1, findings: ['rule:quote'] }],
    target: ['rule:quote'],
  },
};
afterEach(() => vi.unstubAllGlobals());

it('keeps payloads and raw browser messages out of model evidence', () => {
  const evidence = JSON.stringify(analysisEvidence(run));
  expect(evidence).toContain('rule:quote');
  expect(evidence).toContain('8640');
  expect(evidence).toContain('reproduced');
  expect(evidence).not.toContain('Never send this body');
  expect(evidence).not.toContain('Captured display text');
});

it('uses the OpenAI Responses contract only when the operator configures it', async () => {
  const send = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(
    async () =>
      new Response(
        JSON.stringify({
          output: [{ content: [{ type: 'output_text', text: 'Inspect the quote calculation.' }] }],
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', send);
  expect(configuredProviders(undefined, {}).size).toBe(0);
  const configured = configuredProviders(undefined, {
    BREAKTRACE_OPENAI_MODEL: 'fixture-model',
    BREAKTRACE_OPENAI_API_KEY: 'fixture-key',
  });
  const suggestion = await configured.get('openai')!.describe(run);
  expect(suggestion.source).toContain('unverified');
  expect(send.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
  const payload = JSON.parse(String(send.mock.calls[0][1].body));
  expect(payload.store).toBe(false);
  expect(payload.input).toContain('reproduced');
  expect(payload.input).not.toContain('Never send this body');
});
