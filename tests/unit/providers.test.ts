import { afterEach, expect, it, vi } from 'vitest';
import { analysisEvidence, configuredProviders } from '../../apps/api/analysis';
import { githubRepositories } from '../../apps/api/repositories';
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
  expect(evidence).toContain('"failingRules":[{"id":"quote"}]');
  expect(evidence).not.toContain('8640');
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
  expect(payload.input).not.toContain('8640');
  expect(payload.input).not.toContain('Never send this body');
});

it('uses the configured local Ollama and hosted Gemini request contracts', async () => {
  const send = vi
    .fn<(url: string, options: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(Response.json({ response: 'Inspect the recorded rule.' }))
    .mockResolvedValueOnce(Response.json({
      candidates: [{ content: { parts: [{ text: 'Compare the response shape.' }] } }],
    }));
  vi.stubGlobal('fetch', send);
  const providers = configuredProviders('local-model', {
    BREAKTRACE_GEMINI_MODEL: 'fixture-gemini',
    BREAKTRACE_GEMINI_API_KEY: 'fixture-key',
  });
  expect((await providers.get('ollama')!.describe(run)).text).toBe('Inspect the recorded rule.');
  expect((await providers.get('gemini')!.describe(run)).text).toBe('Compare the response shape.');
  const [[local, localRequest], [hosted, hostedRequest]] = send.mock.calls;
  expect(local).toBe('http://127.0.0.1:11434/api/generate');
  expect(hosted).toBe('https://generativelanguage.googleapis.com/v1beta/models/fixture-gemini:generateContent');
  expect(hostedRequest.headers).toMatchObject({ 'x-goog-api-key': 'fixture-key' });
  for (const request of [localRequest, hostedRequest]) {
    expect(request.redirect).toBe('error');
    expect(String(request.body)).toContain('rule:quote');
    expect(String(request.body)).not.toContain('8640');
  }
});

it('reads only allowlisted GitHub metadata and checks the returned repository identity', async () => {
  const send = vi
    .fn<(url: string, options: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(Response.json({ full_name: 'fixture/allowed', default_branch: 'main' }))
    .mockResolvedValueOnce(Response.json({ full_name: 'fixture/different', default_branch: 'main' }));
  vi.stubGlobal('fetch', send);
  const github = githubRepositories({
    BREAKTRACE_GITHUB_REPOSITORIES: 'fixture/allowed',
    BREAKTRACE_GITHUB_TOKEN: 'fixture-token',
  });
  await expect(github.connect('demo', 'fixture/different')).rejects.toThrow('not authorized');
  expect(send).not.toHaveBeenCalled();
  await expect(github.connect('demo', 'fixture/allowed')).resolves.toMatchObject({
    projectId: 'demo',
    repository: 'fixture/allowed',
    branch: 'main',
  });
  const [[url, options]] = send.mock.calls;
  expect(url).toBe('https://api.github.com/repos/fixture/allowed');
  expect(options.method ?? 'GET').toBe('GET');
  expect(options.redirect).toBe('error');
  await expect(github.connect('demo', 'fixture/allowed')).rejects.toThrow('identity differs');
});
