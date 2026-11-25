import { expect, test } from './dashboard';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { createControlPlane } from '../../apps/api/app';
import { TargetAuthority } from '../../apps/api/targets';
import { StaticRepairs } from '../../apps/api/static-repair';
import { startRoomBoard } from '../../apps/demo/room-board';
import type { Recording } from '../../packages/shared/contracts';

test('records a real browser session, masks an input, validates edits and saves the replayable draft', async ({
  request,
  page,
}) => {
  test.setTimeout(60_000);
  const previousInput = process.env.BREAKTRACE_INPUT_ROOM_FILTER;
  await mkdir('.data', { recursive: true });
  const fixture = await startRoomBoard();
  const root = await mkdtemp(resolve('.data/room-recording-'));
  const source = resolve(root, 'approved-site');
  const control = createControlPlane(await mkdtemp(resolve('.data/room-recording-')), {
    serveWeb: true,
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
    await page.goto(api.slice(0, -4));
    await page.getByRole('link', { name: 'Workflows' }).click();
    await page.getByText('Open workflow recorder').click();
    await page.getByLabel('Recording project').selectOption('rooms');
    const recordingResponse = page.waitForResponse((response) => response.url() === `${api}/recordings`);
    await page.getByRole('button', { name: 'Start recording' }).click();
    const opened = await recordingResponse;
    expect(opened.status()).toBe(201);
    const recording = (await opened.json()) as Recording;
    expect(recording.screenshot).toMatch(/^data:image\/png;base64,/);
    const base = `${api}/recordings/${recording.id}`;
    const previewButton = page.getByRole('button', { name: 'Interact with the recorded page' });
    await previewButton.focus();
    await page.keyboard.press('Enter');
    const element = page.getByRole('textbox', { name: 'Element test ID', exact: true });
    await expect(element).toBeFocused();
    const action = page.getByRole('combobox', { name: 'Record action', exact: true });
    const record = page.getByRole('button', { name: 'Record action', exact: true });
    await action.selectOption('fill');
    await element.fill('room-filter');
    await page.getByLabel('Temporary input value').fill('quiet');
    const inputResponse = page.waitForResponse((response) => response.url() === `${base}/steps`);
    await record.click();
    const input = await inputResponse;
    expect(input.ok()).toBe(true);
    const entered = (await input.json()) as Recording;
    expect(entered.draft.steps).toEqual([
      { action: 'fill', target: 'room-filter', input: 'BREAKTRACE_INPUT_ROOM_FILTER' },
    ]);
    const image = PNG.sync.read(Buffer.from(entered.screenshot.split(',')[1], 'base64'));
    let masked = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      if (image.data.readUInt32BE(i) === 0x202530ff) masked++;
    }
    expect(masked).toBeGreaterThan(100);
    expect(await input.text()).not.toContain('"value":"quiet"');
    await action.selectOption('click');
    await element.fill('view-availability');
    await record.click();
    await expect(page.getByText('2 recorded steps', { exact: false })).toBeVisible();
    await action.selectOption('text');
    await element.fill('free-seats');
    await page.getByLabel('Expected text').fill('5');
    const assertionResponse = page.waitForResponse((response) => response.url() === `${base}/steps`);
    await record.click();
    const assertion = await assertionResponse;
    expect(assertion.ok()).toBe(true);
    const draft = (await assertion.json()) as Recording;
    expect(draft.operations).toContainEqual({
      method: 'GET',
      path: '/availability/quiet-lab',
      status: 200,
    });
    const workflow = { ...draft.draft, start: '/board', name: 'Edited Room Board replay' };
    await page.getByText('Recorded API requests').click();
    await expect(page.getByText('GET /availability/quiet-lab', { exact: false })).toBeVisible();
    await page.getByLabel('Workflow JSON').fill(JSON.stringify(workflow));
    await page.getByRole('button', { name: 'Validate and replay draft' }).click();
    await expect(page.getByText('Replay passed in a fresh context.')).toBeVisible();
    await page.getByRole('button', { name: 'Save workflow' }).click();
    await expect(page.getByText('Saved to this workspace.')).toBeVisible();
    await page.getByRole('button', { name: 'Close recording' }).click();
    await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible();
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

    await page.getByRole('link', { name: 'Test executions' }).click();
    await expect(page.getByRole('link', { name: 'Inspect evidence' })).toBeVisible();
    await page.getByLabel('Filter by project').selectOption('fieldwork-shop');
    await expect(page.getByRole('link', { name: 'Inspect evidence' })).toHaveCount(0);
    await page.getByLabel('Filter by project').selectOption('rooms');
    await expect(page.getByRole('link', { name: 'Inspect evidence' })).toBeVisible();
    await page.getByLabel('Filter by status').selectOption('passed');
    await expect(page.getByText('No executions yet')).toBeVisible();
    await page.getByLabel('Filter by status').selectOption('failed');
    await expect(page.getByRole('link', { name: 'Rename capacity', exact: true })).toBeVisible();

    await mkdir(resolve(source, 'availability'), { recursive: true });
    await mkdir(resolve(source, 'board'), { recursive: true });
    const original = await (await request.get(`${fixture.url}/room-board.js`)).text();
    await writeFile(resolve(source, 'room-board.js'), original);
    await writeFile(resolve(source, 'index.html'), await (await request.get(fixture.url)).text());
    await writeFile(resolve(source, 'board/index.html'), await (await request.get(`${fixture.url}/board`)).text());
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
    await page.getByRole('link', { name: 'Inspect evidence' }).click();
    await page.getByRole('link', { name: 'Repair verification' }).click();
    await page
      .getByLabel('File replacements (JSON)')
      .fill(JSON.stringify([{ path: 'room-board.js', content: repaired }]));
    const previewResponse = page.waitForResponse((item) => item.url() === `${repair}/preview`);
    await page.getByRole('button', { name: 'Preview diff' }).click();
    const response = await previewResponse;
    expect(response.ok()).toBe(true);
    const preview = await response.json();
    expect(preview.files).toEqual(['room-board.js']);
    expect(preview.diff).toContain(
      '+  const capacity = Number(payload.room.capacity ?? payload.room.limit ?? 0);',
    );
    expect(
      (await request.post(repair, { data: { approved: false, reviewId: preview.id } })).status(),
    ).toBe(400);
    const verify = page.getByRole('button', { name: 'Verify repair' });
    await expect(verify).toBeDisabled();
    await page.getByLabel('Approve these replacements for the isolated copy').check();
    const verificationResponse = page.waitForResponse((item) => item.url() === repair);
    await verify.click();
    expect((await verificationResponse).status()).toBe(202);
    const runResult = async () => (await request.get(`${api}/runs/${first.id}`)).json();
    await expect(page.getByText('Original source preserved')).toBeVisible({ timeout: 30_000 });
    const { repair: result } = await runResult();
    expect(result.passed).toBe(true);
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
