import { mkdir, mkdtemp, readdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { Store } from '../../apps/api/store';

vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return { ...fs, rename: vi.fn(fs.rename) };
});

it('retries a transient Windows-style lock and preserves the atomic catalog write', async () => {
  await mkdir('.data', { recursive: true });
  const root = await mkdtemp(resolve('.data/atomic-write-'));
  const store = new Store(root);
  const catalog = store.catalog();
  catalog.thresholds = { warning: 27, block: 64 };
  vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('Locked file'), { code: 'EPERM' }));
  await store.saveCatalog(catalog);
  expect(vi.mocked(rename)).toHaveBeenCalledTimes(2);
  expect(store.catalog().thresholds).toEqual(catalog.thresholds);
  expect(await readdir(root)).toEqual(['catalog.json']);
});
