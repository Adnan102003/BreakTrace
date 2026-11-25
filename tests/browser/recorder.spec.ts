import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createControlPlane } from '../../apps/api/app';
import { TargetAuthority } from '../../apps/api/targets';
import { StaticRepairs } from '../../apps/api/static-repair';
import { startRoomBoard } from '../../apps/demo/room-board';
import type { Recording } from '../../packages/shared/contracts';

test('records a real browser session, masks an input, validates edits and saves the replayable draft', async ({
  request,
}) => {
  test.setTimeout(60_000);
  const previousInput = process.env.BREAKTRACE_INPUT_ROOM_FILTER;
  await mkdir('.data', { recursive: true });
  const fixture = await startRoomBoard();
  const root = await mkdtemp(resolve('.data/room-recording-'));
  const source = resolve(root, 'approved-site');
  const control = createControlPlane(await mkdtemp(resolve('.data/room-recording-')), {
    targets: new TargetAuthority([], undefined, undefined, [fixture.url]),
    staticRepairs: new StaticRepairs(JSON.stringify({ rooms: source })),
  });
  try {
    await new Promise<void>((done) => control.server.listen(0, '127.0.0.1', done));
    const address = control.server.address();
    if (!address || typeof address === 'string') throw new Error('API failed to start');
    const api = `http://127.0.0.1:${address.port}/api`;
    const project = {
      kind: 'external',
      id: 'rooms',
      name: 'Room Board',
      url: fixture.url,
      endpoints: [{ method: 'GET', path: '/availability/quiet-lab' }],
    };
    expect((await request.put(`${api}/projects`, { data: project })).ok()).toBe(true);
    expect(
      (await request.post(`${api}/recordings`, { data: { projectId: 'rooms', start: '/' } })).status(),
    ).toBe(400);
    const challenge = await request.post(`${api}/projects/rooms/challenge`, { data: { staging: true } });
    fixture.setProof((await challenge.json()).contents);
    expect((await request.post(`${api}/projects/rooms/verify`)).ok()).toBe(true);
    const opened = await request.post(`${api}/recordings`, { data: { projectId: 'rooms', start: '/' } });
    expect(opened.status()).toBe(201);
    const recording = (await opened.json()) as Recording;
    expect(recording.screenshot).toMatch(/^data:image\/png;base64,/);
    const base = `${api}/recordings/${recording.id}`;
    const input = await request.post(`${base}/steps`, {
      data: { action: 'fill', target: 'room-filter', value: 'quiet' },
    });
    expect(input.ok()).toBe(true);
    expect((await input.json()).draft.steps).toEqual([
      { action: 'fill', target: 'room-filter', input: 'BREAKTRACE_INPUT_ROOM_FILTER' },
    ]);
    expect(await input.text()).not.toContain('"value":"quiet"');
    expect(
      (
        await request.post(`${base}/steps`, {
          data: { action: 'step', step: { action: 'click', target: 'view-availability' } },
        })
      ).ok(),
    ).toBe(true);
    const assertion = await request.post(`${base}/steps`, {
      data: { action: 'step', step: { action: 'text', target: 'free-seats', value: '5' } },
    });
    expect(assertion.ok()).toBe(true);
    const draft = (await assertion.json()) as Recording;
    expect(draft.operations).toContainEqual({
      method: 'GET',
      path: '/availability/quiet-lab',
      status: 200,
    });
    const workflow = { ...draft.draft, name: 'Edited Room Board replay' };
    const replay = await request.post(`${base}/replay`, { data: workflow });
    expect(replay.ok()).toBe(true);
    expect((await replay.json()).validated).toBe(true);
    expect((await request.put(`${api}/workflows`, { data: workflow })).ok()).toBe(true);
    expect((await request.delete(base)).ok()).toBe(true);
    const config = await (await request.get(`${api}/config`)).text();
    expect(config).toContain('Edited Room Board replay');
    expect(config).not.toContain('"value":"quiet"');
    process.env.BREAKTRACE_INPUT_ROOM_FILTER = 'quiet';
    const scenario = {
      id: 'rename-capacity',
      name: 'Rename capacity',
      projectId: 'rooms',
      seed: 42,
      mutations: [
        {
          method: 'GET',
          endpoint: '/availability/quiet-lab',
          operator: 'rename',
          path: 'room.capacity',
          to: 'limit',
        },
      ],
    };
    expect((await request.put(`${api}/scenarios`, { data: scenario })).ok()).toBe(true);
    const inputRun = { projectId: 'rooms', workflowId: workflow.id, scenarioId: scenario.id };
    const submitted = await Promise.all([
      request.post(`${api}/runs`, { data: inputRun }),
      request.post(`${api}/runs`, { data: inputRun }),
    ]);
    expect(submitted.map((response) => response.status())).toEqual([202, 202]);
    const [first, second] = await Promise.all(submitted.map((response) => response.json()));
    expect(first.id).toBe(second.id);
    await expect
      .poll(async () => (await (await request.get(`${api}/runs/${first.id}`)).json()).status)
      .toBe('failed');
    const history = await (await request.get(`${api}/runs?projectId=rooms`)).json();
    expect(history).toHaveLength(1);
    expect(await (await request.get(`${api}/runs?projectId=fieldwork-shop`)).json()).toEqual([]);

    await mkdir(resolve(source, 'availability'), { recursive: true });
    const original = await (await request.get(`${fixture.url}/room-board.js`)).text();
    await writeFile(resolve(source, 'room-board.js'), original);
    await writeFile(resolve(source, 'index.html'), await (await request.get(fixture.url)).text());
    await writeFile(
      resolve(source, 'availability/quiet-lab.json'),
      await (await request.get(`${fixture.url}/availability/quiet-lab`)).text(),
    );
    const repaired = original.replace(
      'payload.room.capacity || 0',
      'payload.room.capacity ?? payload.room.limit ?? 0',
    );
    const repair = `${api}/runs/${first.id}/repair`;
    const invalid = await request.post(`${repair}/preview`, {
      data: { changes: [{ path: '../room-board.js', content: repaired }] },
    });
    expect(invalid.status()).toBe(400);
    const response = await request.post(`${repair}/preview`, {
      data: { changes: [{ path: 'room-board.js', content: repaired }] },
    });
    expect(response.ok()).toBe(true);
    const preview = await response.json();
    expect(preview.files).toEqual(['room-board.js']);
    expect(preview.diff).toContain(
      '+  const capacity = Number(payload.room.capacity ?? payload.room.limit ?? 0);',
    );
    expect(
      (await request.post(repair, { data: { approved: false, reviewId: preview.id } })).status(),
    ).toBe(400);
    expect(
      (await request.post(repair, { data: { approved: true, reviewId: preview.id } })).status(),
    ).toBe(202);
    const runResult = async () => (await request.get(`${api}/runs/${first.id}`)).json();
    await expect.poll(async () => (await runResult()).repair?.passed).toBe(true);
    const { repair: result } = await runResult();
    expect(result.before.issueLog).toHaveLength(1);
    expect(result.after.issueLog).toEqual([]);
    expect(result.review.diff).toBe(preview.diff);
    expect(result.checks).toContainEqual({ name: 'Original source preserved', passed: true });
    expect(await readFile(resolve(source, 'room-board.js'), 'utf8')).toBe(original);
    expect(
      (await request.post(repair, { data: { approved: true, reviewId: preview.id } })).status(),
    ).toBe(400);
    expect((await request.delete(`${api}/projects/rooms`, { data: { approved: true } })).ok()).toBe(
      true,
    );
    expect(await (await request.get(`${api}/runs?projectId=rooms`)).json()).toHaveLength(1);
  } finally {
    if (previousInput === undefined) delete process.env.BREAKTRACE_INPUT_ROOM_FILTER;
    else process.env.BREAKTRACE_INPUT_ROOM_FILTER = previousInput;
    await control.close();
    await fixture.close();
  }
});
