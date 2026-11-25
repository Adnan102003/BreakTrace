import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createControlPlane } from '../../apps/api/app';
import { randomBytes } from 'node:crypto';

let plane: ReturnType<typeof createControlPlane>;
beforeAll(async () => {
  await mkdir('.data', { recursive: true });
  plane = createControlPlane(await mkdtemp(resolve('.data/unit-test-')));
});

it('authenticates workspace and Socket.IO requests without relaxing the origin guard', async () => {
  const password = randomBytes(32).toString('base64url');
  const locked = createControlPlane(await mkdtemp(resolve('.data/operator-test-')), {
    operatorPassword: password,
  });
  const http = request(locked.server);
  const socket = '/socket.io/?EIO=4&transport=polling';
  try {
    await http.get('/api/config').expect('WWW-Authenticate', /Basic realm="BreakTrace"/).expect(401);
    await http.get('/api/config').auth('operator', 'incorrect').expect(401);
    await http.put('/api/settings/gate').send({ warning: 30, block: 65 }).expect(401);
    await http.get('/api/config').auth('operator', password).expect('Cache-Control', 'no-store').expect(200);
    await http.get('/api/config').auth('operator', password).set('Origin', 'https://foreign.invalid').expect(403);
    await http.get(socket).expect(401);
    await http.get(socket).auth('operator', password).set('Origin', 'https://foreign.invalid').expect(403);
    const { text } = await http.get(socket).auth('operator', password).expect(200);
    expect(text).toMatch(/^0\{"sid":/);
    const { sid } = JSON.parse(text.slice(1)) as { sid: string };
    await http.post(`${socket}&sid=${sid}`).send('40').expect(401);
  } finally {
    await locked.close();
  }
});
afterAll(async () => {
  await plane.close();
});

describe('local API', () => {
  it('returns registered synthetic fixtures and rejects foreign origins', async () => {
    const response = await request(plane.app).get('/api/config').expect(200);
    expect(response.body.projects).toHaveLength(2);
    await request(plane.app).get('/api/config').set('Host', 'not-local.invalid').expect(403);
    await request(plane.app)
      .put('/api/settings/gate')
      .set('Origin', 'https://not-local.invalid')
      .send({ warning: 30, block: 65 })
      .expect(403);
    await request(plane.app).post('/api/runs').set('Sec-Fetch-Site', 'cross-site').send({}).expect(403);
  });
  it('validates gates, run IDs, execution destinations and mutation limits', async () => {
    await request(plane.app).put('/api/settings/gate').send({ warning: 95, block: 30 }).expect(400);
    await request(plane.app)
      .post('/api/runs')
      .send({
        projectId: 'fieldwork-shop',
        workflowId: 'checkout',
        scenarioId: 'baseline',
        url: 'https://untrusted.invalid',
      })
      .expect(400);
    await request(plane.app).get('/api/runs/malformed-id').expect(400);
    await request(plane.app)
      .put('/api/scenarios')
      .send({
        id: 'invalid',
        name: 'Invalid',
        seed: 1,
        mutations: Array.from({ length: 9 }, () => ({
          operator: 'empty',
          endpoint: '/api/store/catalog',
          method: 'GET',
        })),
      })
      .expect(400);
  });
  it('imports only paths and refuses arbitrary run targets', async () => {
    await request(plane.app)
      .post('/api/openapi')
      .send({
        openapi: '3.0.3',
        servers: [{ url: 'http://not-local.invalid' }],
        paths: { '/items': { get: { summary: 'Items' } } },
      })
      .expect(200, [{ method: 'GET', path: '/items', summary: 'Items' }]);
    await request(plane.app)
      .post('/api/runs')
      .send({ projectId: 'not-registered', workflowId: 'checkout', scenarioId: 'baseline' })
      .expect(404);
  });
});
