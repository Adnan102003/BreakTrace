import type {
  ApiOperation,
  Gate,
  Project,
  Risk,
  Run,
  Scenario,
  Workflow,
} from '../../packages/shared/contracts';

export type Catalog = {
  projects: Project[];
  workflows: Workflow[];
  scenarios: Scenario[];
  endpoints: ApiOperation[];
  imported: ApiOperation[];
  thresholds: Gate;
  ai: boolean;
};
export type Summary = {
  id: string;
  createdAt: string;
  phase: string;
  status: Run['status'];
  risk?: Risk;
  project: string;
  workflow: string;
  scenario: string;
  findings: number;
};

export async function api<T>(
  path: string,
  options?: { method: 'PUT' | 'POST'; body?: unknown },
): Promise<T> {
  const response = await fetch(
    '/api' + path,
    options
      ? {
          method: options.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options.body ?? {}),
        }
      : undefined,
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Request failed (HTTP ${response.status})`);
  }
  return (
    response.headers.get('content-type')?.includes('application/json')
      ? response.json()
      : response.text()
  ) as Promise<T>;
}

export const href = (page: string, id?: string) => `#/${page}${id ? `/${id}` : ''}`;
export const artifact = (id: string, file: string) => `/api/runs/${id}/artifact/${file}`;
export const date = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
