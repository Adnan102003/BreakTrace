import type { BrowserContext, Route } from 'playwright';
import { safeKey, type Mutation, type Shape } from '../shared/contracts';

function randomNumber(seed: number, index: number) {
  let value = (seed + Math.imul(index + 1, 0x9e3779b1)) | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return 100_000 + ((value >>> 0) % 100_000);
}

type Container = Record<string, unknown>;
function findField(body: unknown, path: string) {
  const parts = path.split('.');
  const key = parts.pop();
  if (!key || !safeKey(key)) return;
  let parent = body as Container;
  for (const part of parts) {
    if (!safeKey(part) || !parent || typeof parent !== 'object' || !Object.hasOwn(parent, part)) return;
    parent = parent[part] as Container;
  }
  if (parent && typeof parent === 'object' && Object.hasOwn(parent, key)) return { parent, key };
}

export function mutate(
  body: unknown,
  config: Mutation[],
  seed: number,
  status = 200,
  indices = config.map((_, index) => index),
) {
  let json = structuredClone(body);
  let mode: 'json' | 'empty' | 'malformed' | 'timeout' = 'json';
  let delay = 0;
  const applied: number[] = [];
  for (const [position, step] of config.entries()) {
    const index = indices[position];
    if ('path' in step) {
      const ref = findField(json, step.path);
      if (!ref || mode !== 'json') continue;
      const { parent, key } = ref;
      switch (step.operator) {
        case 'remove':
          if (Array.isArray(parent)) parent.splice(Number(key), 1);
          else delete parent[key];
          break;
        case 'rename':
          if (Array.isArray(parent) || !safeKey(step.to) || Object.hasOwn(parent, step.to)) continue;
          parent[step.to] = parent[key];
          delete parent[key];
          break;
        case 'null':
          parent[key] = null;
          break;
        case 'type':
          parent[key] = typeof parent[key] === 'string' ? { unexpected: true } : 'unexpected-type';
          break;
        case 'empty-array':
          parent[key] = [];
          break;
        case 'number':
          parent[key] = randomNumber(seed, index);
          break;
        case 'negative':
          parent[key] = -Math.max(1, Math.abs(Number(parent[key])) || 1);
          break;
        case 'replace':
          parent[key] = structuredClone(step.value);
          break;
      }
    } else {
      switch (step.operator) {
        case 'delay':
          delay = Math.min(2500, delay + step.ms);
          break;
        case 'status':
          status = step.status;
          json = { error: 'Simulated response' };
          mode = 'json';
          break;
        case 'empty':
          mode = 'empty';
          break;
        case 'malformed':
          mode = 'malformed';
          break;
        case 'timeout':
          mode = 'timeout';
          break;
      }
    }
    applied.push(index);
  }
  return { json, mode, status, delay, applied };
}

export function responseShape(body: unknown): Shape {
  const entries: Shape = Object.create(null);
  const secret = /password|passwd|secret|token|api.?key|authoriz|cookie|credential|session|signature/i;
  function walk(value: unknown, path: string, depth: number) {
    if (Object.keys(entries).length >= 100 || depth > 6) return;
    entries[path] = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (Array.isArray(value)) {
      if (value.length) walk(value[0], `${path}[]`, depth + 1);
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value).slice(0, 100)) {
        if (secret.test(key) || !safeKey(key) || !/^[a-zA-Z_][\w-]{0,50}$/.test(key)) continue;
        walk(child, path === '$' ? key : `${path}.${key}`, depth + 1);
      }
    }
  }
  walk(body, '$', 0);
  return entries;
}

type NetworkEvent = {
  method: string;
  path: string;
  url: string;
  status: number | null;
  durationMs: number;
  shape: Shape;
  applied: number[];
};

function targetUrl(origin: string, raw: string) {
  const url = new URL(raw);
  if (url.origin !== origin || url.username || url.password) return null;
  return url;
}

export async function installInterception(
  context: BrowserContext,
  origin: string,
  mutations: Mutation[],
  seed: number,
  record: (event: NetworkEvent) => void = () => {},
  activeIndices = mutations.map((_, index) => index),
) {
  const base = new URL(origin);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port || base.origin !== origin)
    throw new Error('A pinned IPv4 loopback origin is required');
  await context.routeWebSocket('**/*', (socket) => socket.close());
  await context.route('**/*', async (route: Route) => {
    const request = route.request();
    const url = targetUrl(origin, request.url());
    if (!url || !['GET', 'POST'].includes(request.method())) return route.abort('blockedbyclient');
    const isApi = url.pathname.startsWith('/api/store/');
    const start = performance.now();
    let status: number | null = null;
    let shape: Shape = {};
    let applied: number[] = [];
    try {
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 4000 });
      status = response.status();
      if (status >= 300 && status < 400) {
        await route.abort('blockedbyclient');
      } else if (!isApi) {
        await route.fulfill({ response });
      } else {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          payload = undefined;
        }
        const matching = activeIndices.filter((index) => {
          const item = mutations[index];
          return item.endpoint === url.pathname && item.method === request.method();
        });
        const output = mutate(
          payload,
          matching.map((index) => mutations[index]),
          seed,
          status,
          matching,
        );
        ({ applied } = output);
        if (output.delay) await new Promise((resolve) => setTimeout(resolve, output.delay));
        const contentType = 'application/json';
        status = output.mode === 'timeout' ? null : output.status;
        if (output.mode === 'timeout') {
          await route.abort('timedout');
        } else if (output.mode === 'empty' || output.mode === 'malformed') {
          await route.fulfill({
            status: output.status,
            contentType,
            body: output.mode === 'empty' ? '' : '{',
          });
        } else if (output.applied.length) {
          shape = responseShape(output.json);
          await route.fulfill({
            status: output.status,
            contentType,
            body: JSON.stringify(output.json) ?? '',
          });
        } else {
          if (payload !== undefined) shape = responseShape(payload);
          await route.fulfill({ response });
        }
      }
    } catch {
      status = null;
      await route.abort('failed').catch(() => {});
    } finally {
      if (isApi) {
        let page = '/';
        try {
          page = new URL(request.frame().url()).pathname;
        } catch {
          /* frame may have closed */
        }
        record({
          method: request.method(),
          path: url.pathname,
          url: page,
          status,
          shape,
          durationMs: Math.round(performance.now() - start),
          applied,
        });
      }
    }
  });
}
