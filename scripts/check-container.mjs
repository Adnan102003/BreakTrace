const origin = new URL(process.argv[2] || 'http://127.0.0.1:4311');
if (
  origin.protocol !== 'http:' ||
  origin.hostname !== '127.0.0.1' ||
  origin.origin !== origin.href.slice(0, -1)
) {
  throw new Error('Use the loopback origin of the local BreakTrace instance.');
}

const password = process.env.BREAKTRACE_OPERATOR_PASSWORD;
async function read(path, options) {
  const response = await fetch(new URL(path, origin), {
    ...options,
    headers: {
      ...options?.headers,
      ...(password && { authorization: `Basic ${Buffer.from(`operator:${password}`).toString('base64')}` }),
    },
    redirect: 'error',
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.headers.get('content-type')?.includes('application/json')
    ? response.json()
    : response.text();
}

const html = await read('/');
if (!html.includes('<title>BreakTrace')) throw new Error('The compiled dashboard did not load');
const health = await read('/api/health');
if (health.status !== 'ok') throw new Error('The control plane is unavailable');
if (process.argv[3] && health.storage !== process.argv[3])
  throw new Error(`Expected ${process.argv[3]} storage, received ${health.storage}`);
const { id } = await read('/api/runs', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ projectId: 'fieldwork-shop', workflowId: 'checkout', scenarioId: 'baseline' }),
});

const deadline = Date.now() + 50_000;
while (Date.now() < deadline) {
  const run = await read(`/api/runs/${id}`);
  if (run.status === 'passed' && run.risk?.gate === 'PASS') {
    console.log(
      JSON.stringify({ id, storage: health.storage, status: run.status, gate: run.risk.gate }),
    );
    process.exit(0);
  }
  if (['error', 'failed', 'inconclusive'].includes(run.status))
    throw new Error(`Baseline ended with ${run.status}`);
  await new Promise((resolve) => setTimeout(resolve, 650));
}
throw new Error('Timed out waiting for the demo browser baseline');
