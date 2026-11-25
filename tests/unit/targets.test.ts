import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createControlPlane } from '../../apps/api/app';
import {
  externalOrigin,
  publicAddress,
  TargetAuthority,
  type TargetResponse,
} from '../../apps/api/targets';

const origin = 'https://staging.example.test';
const address = '93.184.216.34';
const project = {
  kind: 'external',
  id: 'staging',
  name: 'Staging',
  url: origin,
  endpoints: [{ method: 'GET', path: '/v1/products/{id}' }],
};
let control: ReturnType<typeof createControlPlane> | undefined;
afterEach(async () => {
  await control?.close();
  control = undefined;
});

describe('external target authorization', () => {
  it('rejects non-HTTPS origins, IP literals, credentials and non-public addresses', () => {
    for (const url of [
      'http://staging.example.test',
      'https://127.0.0.1',
      'https://127.1',
      'https://[::1]',
      'https://user@staging.example.test',
      'https://staging.example.test:444',
      'https://staging.example.test/admin',
    ]) {
      expect(() => externalOrigin(url)).toThrow();
    }
    for (const ip of [
      '127.0.0.2',
      '10.0.0.5',
      '100.64.0.4',
      '169.254.169.254',
      '192.168.1.1',
      '::1',
      '::ffff:127.0.0.1',
      'fd00::1',
      'fe80::1',
      '2001:db8::1',
      '0.0.0.0',
      '224.0.0.1',
    ]) {
      expect(publicAddress(ip)).toBe(false);
    }
    expect(publicAddress(address)).toBe(true);
  });

  it('rejects a mixed public/private DNS response before sending HTTPS traffic', async () => {
    const targets = new TargetAuthority(
      [origin],
      async () => [
        { address, family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
      async () => {
        throw new Error('Transport must not be called');
      },
    );
    targets.issue('staging', origin);
    await expect(targets.verify('staging', origin)).rejects.toThrow('public addresses');
  });

  it('binds proof to its project, uses the same IP for the pinned target, and refuses redirects', async () => {
    let proofPath = '';
    let proofText = '';
    const targets = new TargetAuthority(
      [origin],
      async () => [{ address, family: 4 }],
      async (url, ip): Promise<TargetResponse> => {
        expect(ip).toBe(address);
        return url.pathname === proofPath
          ? { status: 200, headers: { 'content-type': 'text/plain' }, body: Buffer.from(proofText) }
          : { status: 302, headers: { location: 'http://127.0.0.1/' }, body: Buffer.alloc(0) };
      },
    );
    expect(() => targets.issue('staging', 'https://other.example.test')).toThrow();
    const challenge = targets.issue('staging', origin);
    proofPath = challenge.path;
    proofText = challenge.contents;
    await expect(targets.verify('different', origin)).rejects.toThrow('fresh verification');
    const proof = await targets.verify('staging', origin);
    const pinned = await targets.authorized(origin, proof.token);
    await expect(pinned.read(new URL('http://127.0.0.1/'), 'GET')).rejects.toThrow('outside');
    await expect(pinned.read(new URL('/redirect', origin), 'GET')).rejects.toThrow('redirect');
  });

  it('scopes YAML imports and workflows, blocks unauthenticated runs, and redacts proof in config', async () => {
    let proofPath = '';
    let proofText = '';
    let fetches = 0;
    const targets = new TargetAuthority(
      [origin],
      async () => [{ address, family: 4 }],
      async (url): Promise<TargetResponse> => {
        fetches++;
        return url.pathname === proofPath
          ? { status: 200, headers: { 'content-type': 'text/plain' }, body: Buffer.from(proofText) }
          : { status: 404, headers: {}, body: Buffer.alloc(0) };
      },
    );
    await mkdir('.data', { recursive: true });
    control = createControlPlane(await mkdtemp(resolve('.data/target-test-')), { targets });
    const api = request(control.app);
    await api.put('/api/projects').send(project).expect(200);
    await api.post('/api/projects/staging/challenge').send({ staging: false }).expect(400);
    await api
      .post('/api/openapi?projectId=staging&register=1')
      .send({
        document:
          'openapi: 3.1.0\nservers:\n  - url: http://127.0.0.1\npaths:\n  /catalog:\n    get: {summary: Catalog}\n    post: {summary: Write}\n',
      })
      .expect(200);
    await api
      .post('/api/openapi')
      .send({
        document: 'openapi: 3.1.0\nentry: &a { get: {} }\npaths: { /catalog: *a }\n',
      })
      .expect(400);
    expect(fetches).toBe(0);
    const workflow = {
      id: 'staging-check',
      name: 'Staging check',
      projectId: 'staging',
      start: '/products',
      steps: [{ action: 'visible', target: 'title' }],
    };
    await api.put('/api/workflows').send(workflow).expect(200);
    await api
      .put('/api/workflows')
      .send({ ...workflow, id: 'checkout' })
      .expect(409);
    const scenario = {
      id: 'staging-base',
      name: 'Staging baseline',
      projectId: 'staging',
      seed: 42,
      mutations: [],
    };
    await api.put('/api/scenarios').send(scenario).expect(200);
    await api
      .post('/api/runs')
      .send({ projectId: 'staging', workflowId: workflow.id, scenarioId: scenario.id })
      .expect(403);
    const challenge = await api
      .post('/api/projects/staging/challenge')
      .send({ staging: true })
      .expect(200);
    proofPath = challenge.body.path;
    proofText = challenge.body.contents;
    await api.post('/api/projects/staging/verify').send({}).expect(200);
    const config = await api.get('/api/config').expect(200);
    const saved = config.body.projects.find((item: { id: string }) => item.id === 'staging');
    expect(
      saved.endpoints.map((entry: { method: string; path: string }) => [entry.method, entry.path]),
    ).toEqual([
      ['GET', '/v1/products/{id}'],
      ['GET', '/catalog'],
    ]);
    expect(config.body.authorization[0].verifiedAt).toBeTruthy();
    expect(config.text).not.toContain(proofText);
    expect(config.body.targetProofs).toBeUndefined();
    await api.delete('/api/projects/staging/authorization').expect(200);
    await api
      .post('/api/runs')
      .send({ projectId: 'staging', workflowId: workflow.id, scenarioId: scenario.id })
      .expect(403);
  });
});
