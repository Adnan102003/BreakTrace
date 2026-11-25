import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import request from 'supertest';
import { createControlPlane } from '../../apps/api/app';
import { connectMongo } from '../../apps/api/mongo';
import { checkout, projects, thresholds } from '../../packages/shared/demo';
import type { Run } from '../../packages/shared/contracts';

const uri = process.env.BREAKTRACE_TEST_MONGO_URI;

it.skipIf(!uri)(
  'persists MongoDB catalog and run snapshots across separate API connections',
  async () => {
    const id = randomUUID();
    const dbName = `breaktrace_test_${id.replaceAll('-', '')}`;
    const root = resolve('.data', dbName);
    const firstStore = await connectMongo(uri!, root, dbName);
    const first = createControlPlane(root, { store: firstStore });
    try {
      await request(first.app)
        .get('/api/health')
        .expect(200)
        .expect(({ body }) => expect(body.storage).toBe('mongo'));
      await request(first.app).put('/api/settings/gate').send({ warning: 30, block: 72 }).expect(200);
      const run: Run = {
        id,
        createdAt: new Date().toISOString(),
        status: 'running',
        phase: 'Recording baseline',
        project: projects[0],
        workflow: checkout,
        scenario: { id: 'base', name: 'Base', seed: 1, mutations: [] },
        thresholds,
      };
      await firstStore.saveRun(run);
    } finally {
      await first.close();
    }
    const second = createControlPlane(root, { store: await connectMongo(uri!, root, dbName) });
    try {
      const config = await request(second.app).get('/api/config').expect(200);
      expect(config.body.thresholds).toEqual({ warning: 30, block: 72 });
      const report = await request(second.app).get(`/api/runs/${id}`).expect(200);
      expect(report.body.phase).toBe('Interrupted');
      expect(report.body.workflow).toEqual(checkout);
    } finally {
      await second.close();
    }
  },
  20_000,
);
