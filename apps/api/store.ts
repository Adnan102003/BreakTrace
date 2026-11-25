import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import type {
  ApiOperation,
  Gate,
  Project,
  Run,
  Scenario,
  Workflow,
} from '../../packages/shared/contracts';
import { projects, scenarios, thresholds, workflows } from '../../packages/shared/demo';
import type { TargetProof } from './targets';
import type { RepositoryLink } from './repositories';

export type Catalog = {
  projects: Project[];
  scenarios: Scenario[];
  workflows: Workflow[];
  imported: ApiOperation[];
  thresholds: Gate;
  targetProofs: TargetProof[];
  projectImports: { projectId: string; operations: ApiOperation[] }[];
  repositories: RepositoryLink[];
};
export const defaults = (): Catalog =>
  structuredClone({
    projects,
    scenarios,
    workflows,
    imported: [],
    thresholds,
    targetProofs: [],
    projectImports: [],
    repositories: [],
  });

type Stored<T> = T | Promise<T>;
export interface Persistence {
  readonly mode: 'json' | 'mongo';
  catalog(): Stored<Catalog>;
  saveCatalog(catalog: Catalog): Stored<void>;
  runs(): Stored<Run[]>;
  directory(id: string): string;
  getRun(id: string): Stored<Run | undefined>;
  saveRun(run: Run): Stored<void>;
  close?(): Promise<void>;
}

export class Store implements Persistence {
  readonly mode = 'json' as const;
  readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
    mkdirSync(this.root, { recursive: true });
  }
  private read<T>(file: string): T {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  }
  private async write(file: string, data: unknown) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2), { flag: 'wx' });
    const retryDelays = [25, 75, 150, 300, 600, 1200];
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          await rename(temporary, file);
          return;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (attempt >= retryDelays.length || !['EPERM', 'EBUSY', 'EACCES'].includes(code ?? ''))
            throw error;
          await pause(retryDelays[attempt]);
        }
      }
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  catalog(): Catalog {
    const target = join(this.root, 'catalog.json');
    return existsSync(target) ? { ...defaults(), ...this.read<Catalog>(target) } : defaults();
  }
  saveCatalog(catalog: Catalog) {
    return this.write(join(this.root, 'catalog.json'), catalog);
  }
  runs() {
    return readdirSync(this.root)
      .filter((name) => /^[a-f0-9-]{36}$/.test(name))
      .map((id) => this.getRun(id))
      .filter((run): run is Run => Boolean(run))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  directory(id: string) {
    return join(this.root, id);
  }
  getRun(id: string) {
    const path = join(this.directory(id), 'run.json');
    return existsSync(path) ? this.read<Run>(path) : undefined;
  }
  saveRun(run: Run) {
    const directory = this.directory(run.id);
    mkdirSync(directory, { recursive: true });
    return this.write(join(directory, 'run.json'), run);
  }
}
