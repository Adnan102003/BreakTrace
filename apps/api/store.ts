import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  ApiOperation,
  Gate,
  Project,
  Run,
  Scenario,
  Workflow,
} from '../../packages/shared/contracts';
import { projects, scenarios, thresholds, workflows } from '../../packages/shared/demo';

type Catalog = {
  projects: Project[];
  scenarios: Scenario[];
  workflows: Workflow[];
  imported: ApiOperation[];
  thresholds: Gate;
};
const defaults = (): Catalog =>
  structuredClone({ projects, scenarios, workflows, imported: [], thresholds });

export class Store {
  readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
    mkdirSync(this.root, { recursive: true });
  }
  private read<T>(file: string): T {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  }
  private write(file: string, data: unknown) {
    writeFileSync(file + '.tmp', JSON.stringify(data, null, 2));
    renameSync(file + '.tmp', file);
  }
  catalog(): Catalog {
    const target = join(this.root, 'catalog.json');
    return existsSync(target) ? this.read<Catalog>(target) : defaults();
  }
  saveCatalog(catalog: Catalog) {
    this.write(join(this.root, 'catalog.json'), catalog);
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
    this.write(join(directory, 'run.json'), run);
  }
}
