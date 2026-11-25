import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import { expect, it } from 'vitest';
import { createControlPlane } from '../../apps/api/app';
import { TargetAuthority, targetOrigin } from '../../apps/api/targets';
import { startRoomBoard } from '../../apps/demo/room-board';

it('authorizes a real loopback application, refuses redirects and removes its configuration', async () => {
  await mkdir('.data', { recursive: true });
  const fixture = await startRoomBoard();
  const targets = new TargetAuthority([], undefined, undefined, [fixture.url]);
  const control = createControlPlane(await mkdtemp(resolve('.data/projects-v2-')), { targets });
  try {
    const api = request(control.app);
    expect(() => targetOrigin('http://192.168.10.22:8080')).toThrow();
    expect(() => targetOrigin('http://127.0.0.1:4313/../')).toThrow();
    expect(targets.includes('http://127.0.0.1:1')).toBe(false);
    const project = {
      id: 'room-board',
      name: 'Room Board',
      kind: 'external',
      url: fixture.url,
      endpoints: [{ method: 'GET', path: '/availability/quiet-lab' }],
    };
    await api.put('/api/projects').send(project).expect(200);
    await api.post('/api/projects/room-board/connection').expect(400);
    const challenge = await api
      .post('/api/projects/room-board/challenge')
      .send({ staging: true })
      .expect(200);
    fixture.setProof(challenge.body.contents);
    await api.post('/api/projects/room-board/verify').expect(200);
    await api.post('/api/projects/room-board/connection').expect(200);
    const pinned = await targets.authorized(fixture.url, challenge.body.contents.split(':')[1]);
    await expect(pinned.read(new URL('/redirect', fixture.url), 'GET')).rejects.toThrow('redirect');
    await expect(pinned.read(new URL('http://127.0.0.1:4311/api/config'), 'GET')).rejects.toThrow(
      'outside',
    );
    await api
      .put('/api/projects')
      .send({ ...project, name: 'Operations Room Board' })
      .expect(200);
    await api.get('/api/runs?projectId=room-board').expect(200, []);
    await api.delete('/api/projects/room-board').send({ approved: false }).expect(400);
    await api.delete('/api/projects/room-board').send({ approved: true }).expect(200);
    await api.post('/api/projects/room-board/connection').expect(404);
    await api.delete('/api/projects/fieldwork-shop').send({ approved: true }).expect(409);
  } finally {
    await control.close();
    await fixture.close();
  }
});
