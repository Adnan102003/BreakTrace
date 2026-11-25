import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Braces, Cable, ChevronRight, FileUp, Plus, Save, Trash2 } from 'lucide-react';
import type { ExternalProject, Mutation, Project, Run } from '../../packages/shared/contracts';
import { api, href, type Catalog, type Summary } from './client';
import { Badge, Empty, ErrorMessage, Panel } from './ui';
import { WorkflowRecorder } from './recorder';
import { RuleBuilder } from './rule-builder';

const format = (data: unknown) => JSON.stringify(data, null, 2);
export function useSave() {
  const cache = useQueryClient();
  const [status, setStatus] = useState<{ error?: string; message?: string; busy?: boolean }>({});
  const save = async (path: string, body: unknown, method: 'PUT' | 'POST' = 'PUT') => {
    setStatus({ busy: true });
    try {
      await api(path, { method, body });
      await cache.invalidateQueries({ queryKey: ['config'] });
      setStatus({ message: 'Saved to this workspace.' });
    } catch (error) {
      setStatus({ error: (error as Error).message });
    }
  };
  const fail = (error: unknown) => setStatus({ error: (error as Error).message });
  const feedback = status.error ? (
    <ErrorMessage error={status.error} />
  ) : status.message ? (
    <p role="status" className="message success">
      {status.message}
    </p>
  ) : null;
  return { save, fail, feedback, busy: status.busy };
}

export function Projects({ catalog }: { catalog: Catalog }) {
  const [selected, setSelected] = useState<Project>(catalog.projects[0]);
  const [operations, setOperations] = useState('');
  const [deletePending, setDeletePending] = useState(false);
  const cache = useQueryClient();
  const saved = catalog.projects.find((project) => project.id === selected.id);
  const action = useSave();
  function edit(project: Project) {
    setDeletePending(false);
    setSelected(project);
    setOperations(
      project.kind === 'external'
        ? project.endpoints.map(({ method, path }) => `${method} ${path}`).join('\n')
        : '',
    );
  }
  async function removeProject() {
    try {
      await api(`/projects/${selected.id}`, { method: 'DELETE', body: { approved: true } });
      edit(catalog.projects[0]);
      await cache.invalidateQueries({ queryKey: ['config'] });
    } catch (error) {
      action.fail(error);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const endpoints = operations
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const match = /^(GET|HEAD)\s+(\S+)$/.exec(line);
          if (!match) throw new Error('Enter one GET or HEAD and a path per line.');
          return { method: match[1] as 'GET' | 'HEAD', path: match[2] };
        });
      void action.save(
        '/projects',
        selected.kind === 'external' ? { ...selected, endpoints } : selected,
      );
    } catch (error) {
      action.fail(error);
    }
  }
  return (
    <div className="split">
      <Panel
        title="Registered projects"
        description="Run the bundled storefront or configure a developer-owned local or staging origin."
        actions={
          <button
            className="button ghost compact"
            onClick={() => edit({ id: '', name: '', version: 'original' })}
          >
            <Plus size={15} /> Add project
          </button>
        }
      >
        <div className="list">
          {catalog.projects.map((item) => (
            <button
              className="list-item"
              key={item.id}
              onClick={() => edit(item)}
              aria-pressed={selected.id === item.id}
            >
              <Cable size={18} />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.id} · {item.kind === 'external' ? item.url : item.version}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      </Panel>
      <div className="stack">
        <Panel title="Project settings">
          <form onSubmit={submit} className="form">
            <label>
              Name
              <input
                required
                value={selected.name}
                onChange={(e) => setSelected({ ...selected, name: e.target.value })}
              />
            </label>
            <label>
              Project ID
              <input
                required
                pattern="[a-z0-9][a-z0-9\-]{0,63}"
                readOnly={Boolean(saved)}
                value={selected.id}
                onChange={(e) => setSelected({ ...selected, id: e.target.value })}
              />
            </label>
            {!saved && (
              <label>
                Target type
                <select
                  value={selected.kind === 'external' ? 'external' : 'demo'}
                  onChange={(e) => {
                    const { id, name } = selected;
                    edit(
                      e.target.value === 'external'
                        ? { id, name, kind: 'external', url: '', endpoints: [] }
                        : { id, name, version: 'original' },
                    );
                  }}
                >
                  <option value="demo">Bundled storefront</option>
                  <option value="external">Developer-owned application</option>
                </select>
              </label>
            )}
            {selected.kind === 'external' ? (
              <>
                <label>
                  Environment
                  <select
                    value={selected.environment ?? ''}
                    onChange={(event) => {
                      const environment = event.target.value as 'local' | 'staging' | '';
                      setSelected({ ...selected, environment: environment || undefined });
                    }}
                  >
                    <option value="">Infer from origin</option>
                    <option value="local">Local</option>
                    <option value="staging">Staging</option>
                  </select>
                </label>
                <label>
                  HTTPS origin or loopback HTTP origin
                  <input
                    type="url"
                    required
                    placeholder="https://staging.example.com"
                    value={selected.url}
                    onChange={(e) => setSelected({ ...selected, url: e.target.value })}
                  />
                </label>
                <label>
                  Read-only API operations
                  <textarea
                    value={operations}
                    rows={5}
                    spellCheck={false}
                    placeholder="GET /api/items/{id}"
                    onChange={(e) => setOperations(e.target.value)}
                  />
                </label>
                <p className="muted">
                  Enter one operation per line. You can also register read-only operations from an
                  OpenAPI import.
                </p>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(selected.captureScreenshots)}
                    onChange={(e) => setSelected({ ...selected, captureScreenshots: e.target.checked })}
                  />{' '}
                  Save screenshots from this target
                </label>
              </>
            ) : (
              <label>
                Storefront version
                <select
                  value={selected.version}
                  onChange={(e) =>
                    setSelected({ ...selected, version: e.target.value as typeof selected.version })
                  }
                >
                  <option value="original">Original · pricing defect</option>
                  <option value="resilient">Resilient · reviewed pricing patch</option>
                </select>
              </label>
            )}
            <button className="button primary" disabled={action.busy}>
              <Save size={15} /> Save project
            </button>
            {action.feedback}
          </form>
          {saved && !['fieldwork-shop', 'fieldwork-resilient'].includes(saved.id) && (
            <div className="actions">
              <a className="button ghost compact" href={`${href('runs')}?project=${saved.id}`}>
                Project history
              </a>
              <button className="button ghost compact" onClick={() => setDeletePending(!deletePending)}>
                {deletePending ? 'Cancel deletion' : 'Delete project'}
              </button>
              {deletePending && (
                <button className="button ghost compact" onClick={() => void removeProject()}>
                  Confirm deletion
                </button>
              )}
            </div>
          )}
        </Panel>
        {saved?.kind === 'external' &&
          selected.kind === 'external' &&
          saved.url === selected.url.replace(/\/$/, '') && (
            <TargetAuthorization
              key={`${saved.id}:${saved.url}`}
              project={saved}
              authorization={catalog.authorization.find((entry) => entry.projectId === saved.id)}
            />
          )}
        {saved && <RepositoryConnection key={saved.id} projectId={saved.id} catalog={catalog} />}
      </div>
    </div>
  );
}

function RepositoryConnection({ projectId, catalog }: { projectId: string; catalog: Catalog }) {
  const repositories = catalog.githubRepositories;
  const linked = catalog.repositories.find((item) => item.projectId === projectId);
  const [selected, setSelected] = useState(linked?.repository ?? repositories[0] ?? '');
  const action = useSave();
  if (!repositories.length && !linked) return null;
  return (
    <Panel
      title="GitHub repository"
      description="Choose an operator-approved repository to include its name and default branch in draft exports."
    >
      {linked && (
        <p className="muted">
          {linked.repository} · {linked.branch}
        </p>
      )}
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void action.save(`/projects/${projectId}/repository`, { repository: selected });
        }}
      >
        <label>
          Approved repository{' '}
          <select value={selected} onChange={(event) => setSelected(event.target.value)}>
            {!repositories.includes(selected) && <option value={selected}>Select a repository</option>}
            {repositories.map((repository) => (
              <option key={repository}>{repository}</option>
            ))}
          </select>
        </label>
        <button
          className="button ghost compact"
          disabled={!repositories.includes(selected) || action.busy}
        >
          Connect repository
        </button>
        {action.feedback}
      </form>
    </Panel>
  );
}

function TargetAuthorization({
  project,
  authorization,
}: {
  project: ExternalProject;
  authorization?: Catalog['authorization'][number];
}) {
  const cache = useQueryClient();
  const [staging, setStaging] = useState(false);
  const [challenge, setChallenge] = useState<{ path: string; contents: string; expiresAt: string }>();
  const [confirmation, setConfirmation] = useState(false);
  const [request, setRequest] = useState<{ busy?: boolean; error?: string; message?: string }>({});
  async function checkConnection() {
    setRequest({ busy: true });
    try {
      await api(`/projects/${project.id}/connection`, { method: 'POST' });
      setRequest({ message: 'Connection and target proof verified.' });
    } catch (error) {
      setRequest({ error: (error as Error).message });
    }
  }
  async function submit(action: 'challenge' | 'verify' | 'revoke') {
    setRequest({ busy: true });
    try {
      const base = `/projects/${project.id}`;
      if (action === 'challenge') {
        setChallenge(await api(`${base}/challenge`, { method: 'POST', body: { staging } }));
      } else {
        await api(`${base}/${action === 'verify' ? 'verify' : 'authorization'}`, {
          method: action === 'verify' ? 'POST' : 'DELETE',
        });
        await cache.invalidateQueries({ queryKey: ['config'] });
        setChallenge(undefined);
        setConfirmation(false);
      }
      setRequest({
        message:
          action === 'verify'
            ? 'Target verified.'
            : action === 'revoke'
              ? 'Authorization revoked for future runs.'
              : undefined,
      });
    } catch (error) {
      setRequest({ error: (error as Error).message });
    }
  }
  return (
    <Panel title="Target authorization">
      <div className="form">
        {authorization?.verifiedAt && authorization.allowlisted ? (
          <Badge value="verified" />
        ) : (
          <p className="muted">
            External runs require both an operator allowlist entry and proof served by the staging
            application.
          </p>
        )}
        {!authorization?.allowlisted ? (
          <p>
            Add <code>{project.url}</code> to{' '}
            <code>
              {project.url.startsWith('http:')
                ? 'BREAKTRACE_ALLOWED_LOCAL_ORIGINS'
                : 'BREAKTRACE_ALLOWED_ORIGINS'}
            </code>
            , then restart the API.
          </p>
        ) : (
          <>
            <label className="check">
              <input type="checkbox" checked={staging} onChange={(e) => setStaging(e.target.checked)} />{' '}
              I control this staging application and authorize read-only browser runs.
            </label>
            <div className="actions">
              <button
                className="button ghost"
                disabled={!staging || request.busy}
                onClick={() => void submit('challenge')}
              >
                Create challenge
              </button>
              {authorization.verifiedAt && (
                <button
                  className="button ghost"
                  disabled={request.busy}
                  onClick={() => setConfirmation(!confirmation)}
                >
                  {confirmation ? 'Cancel revocation' : 'Revoke authorization'}
                </button>
              )}
              {confirmation && (
                <button
                  className="button primary"
                  disabled={request.busy}
                  onClick={() => void submit('revoke')}
                >
                  Confirm revocation
                </button>
              )}
            </div>
          </>
        )}
        {challenge && (
          <>
            <p>
              Serve this text as HTTP 200 <code>text/plain</code> at <code>{challenge.path}</code> by{' '}
              {new Date(challenge.expiresAt).toLocaleTimeString()}.
            </p>
            <pre>{challenge.contents}</pre>
            <button
              className="button primary"
              disabled={request.busy}
              onClick={() => void submit('verify')}
            >
              Verify proof
            </button>
          </>
        )}
        {authorization?.allowlisted && authorization.verifiedAt && (
          <button
            className="button ghost"
            disabled={request.busy}
            onClick={() => void checkConnection()}
          >
            Check connection
          </button>
        )}
        {request.error && <ErrorMessage error={request.error} />}
        {request.message && <p role="status">{request.message}</p>}
      </div>
    </Panel>
  );
}

export function Workflows({ catalog }: { catalog: Catalog }) {
  const [json, setJson] = useState(format(catalog.workflows[0]));
  const action = useSave();
  return (
    <div className="stack">
      <details className="panel">
        <summary>Open workflow recorder</summary>
        <WorkflowRecorder catalog={catalog} draft={json} update={setJson} />
      </details>
      <details className="panel">
        <summary>Open visual rule builder</summary>
        <RuleBuilder draft={json} update={setJson} />
      </details>
      <div className="split">
        <Panel
          title="Registered workflows"
          description="Browser interactions and declarative checks"
          actions={
            <button
              className="button ghost compact"
              onClick={() =>
                setJson(
                  format({
                    id: '',
                    name: '',
                    start: '/',
                    steps: [{ action: 'visible', target: 'page-title' }],
                  }),
                )
              }
            >
              <Plus size={15} /> New workflow
            </button>
          }
        >
          <div className="list">
            {catalog.workflows.map((item) => (
              <button className="list-item" key={item.id} onClick={() => setJson(format(item))}>
                <Braces size={18} />
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.steps.length} steps · starts at {item.start}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </Panel>
        <Panel
          title="Workflow and business rules"
          description="Supported steps are navigate, click, fill, visible, text and rules."
        >
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                void action.save('/workflows', JSON.parse(json));
              } catch (error) {
                action.fail(error);
              }
            }}
          >
            <label>
              Workflow JSON
              <textarea
                rows={21}
                spellCheck={false}
                value={json}
                onChange={(e) => setJson(e.target.value)}
              />
            </label>
            <p className="muted">
              Steps use same-origin paths and data-testid selectors. Use the visual rule builder to add
              checks against DOM values, captured API fields or an independent reference.
            </p>
            {catalog.projects.some((project) => project.kind === 'external') && (
              <label>
                New external workflow template
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value)
                      setJson(
                        format({
                          id: '',
                          name: '',
                          projectId: e.target.value,
                          start: '/',
                          steps: [{ action: 'visible', target: 'page-title' }],
                        }),
                      );
                  }}
                >
                  <option value="">Choose a project to start a new workflow</option>
                  {catalog.projects
                    .filter((project) => project.kind === 'external')
                    .map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <button className="button primary" disabled={action.busy}>
              <Save size={15} /> Save workflow
            </button>
            {action.feedback}
          </form>
        </Panel>
      </div>
    </div>
  );
}

const operatorNames: Record<Mutation['operator'], string> = {
  remove: 'Remove field',
  rename: 'Rename field',
  null: 'Set null',
  type: 'Change data type',
  'empty-array': 'Empty array',
  number: 'Seeded numeric value',
  negative: 'Negative number',
  replace: 'Replace with JSON',
  status: 'HTTP status',
  delay: 'Delay response',
  timeout: 'Network timeout',
  malformed: 'Malformed JSON',
  empty: 'Empty response',
};
function MutationEditor({
  item,
  index,
  operations,
  onChange,
  remove,
}: {
  item: Mutation;
  index: number;
  operations: Catalog['endpoints'];
  onChange: (item: Mutation) => void;
  remove: () => void;
}) {
  const [replacement, setReplacement] = useState(
    item.operator === 'replace' ? format(item.value) : '{}',
  );
  const [invalid, setInvalid] = useState(false);
  const changeOperator = (operator: Mutation['operator']) => {
    const base = { endpoint: item.endpoint, method: item.method };
    const path = 'path' in item ? item.path : 'price';
    setReplacement('{}');
    setInvalid(false);
    switch (operator) {
      case 'status':
        return onChange({ ...base, operator, status: 503 });
      case 'delay':
        return onChange({ ...base, operator, ms: 1500 });
      case 'rename':
        return onChange({ ...base, operator, path, to: 'productPrice' });
      case 'replace':
        return onChange({ ...base, operator, path, value: {} });
      case 'empty':
      case 'timeout':
      case 'malformed':
        return onChange({ ...base, operator });
      default:
        return onChange({ ...base, operator, path });
    }
  };
  return (
    <fieldset className="mutation-editor">
      <legend>Mutation {index + 1}</legend>
      <div className="field-grid">
        <label>
          Operation
          <select
            value={`${item.method} ${item.endpoint}`}
            onChange={(e) => {
              const [method, endpoint] = e.target.value.split(' ');
              onChange({ ...item, method: method as Mutation['method'], endpoint });
            }}
          >
            {!operations.some(
              ({ method, path }) => method === item.method && path === item.endpoint,
            ) && (
              <option value={`${item.method} ${item.endpoint}`} disabled>
                {item.method} {item.endpoint} (removed)
              </option>
            )}
            {operations.map(({ method, path }) => (
              <option key={`${method} ${path}`}>
                {method} {path}
              </option>
            ))}
          </select>
        </label>
        <label>
          Operator
          <select
            value={item.operator}
            onChange={(e) => changeOperator(e.target.value as Mutation['operator'])}
          >
            {Object.entries(operatorNames).map(([id, name]) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {'path' in item && (
          <label>
            Field path
            <input
              required
              value={item.path}
              onChange={(e) => onChange({ ...item, path: e.target.value })}
            />
          </label>
        )}
        {item.operator === 'rename' && (
          <label>
            New field
            <input
              required
              value={item.to}
              onChange={(e) => onChange({ ...item, to: e.target.value })}
            />
          </label>
        )}
        {item.operator === 'status' && (
          <label>
            HTTP status
            <select
              value={item.status}
              onChange={(e) =>
                onChange({ ...item, status: Number(e.target.value) as typeof item.status })
              }
            >
              {[400, 401, 403, 404, 429, 500, 503].map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
        )}
        {item.operator === 'delay' && (
          <label>
            Delay (ms)
            <input
              type="number"
              min={1}
              max={2500}
              value={item.ms}
              onChange={(e) => onChange({ ...item, ms: Number(e.target.value) })}
            />
          </label>
        )}
        {item.operator === 'replace' && (
          <label>
            Replacement JSON
            <textarea
              required
              rows={2}
              value={replacement}
              aria-invalid={invalid}
              onChange={(e) => {
                setReplacement(e.target.value);
                try {
                  onChange({ ...item, value: JSON.parse(e.target.value) });
                  setInvalid(false);
                  e.target.setCustomValidity('');
                } catch {
                  setInvalid(true);
                  e.target.setCustomValidity('Enter a valid JSON value.');
                }
              }}
            />
          </label>
        )}
      </div>
      <button className="button ghost compact" type="button" onClick={remove}>
        <Trash2 size={14} /> Remove mutation
      </button>
    </fieldset>
  );
}

export function Scenarios({ catalog, runs }: { catalog: Catalog; runs: Summary[] }) {
  const [draft, setDraft] = useState(
    catalog.scenarios.find((item) => item.id === 'multi-field-drift') ?? catalog.scenarios[0],
  );
  const [revision, setRevision] = useState(0);
  const load = (value: typeof draft) => {
    setDraft(value);
    setRevision(revision + 1);
  };
  const action = useSave();
  const project = catalog.projects.find((item) => item.id === draft.projectId);
  const operations = project?.kind === 'external' ? project.endpoints : catalog.endpoints;
  const defaultOperation =
    project?.kind === 'external'
      ? operations[0]
      : operations.find(({ path }) => path === '/api/store/product/field-pack');
  const saved = catalog.scenarios.some((item) => item.id === draft.id);
  return (
    <div className="split">
      <Panel
        title="Scenario library"
        description="Saved mutation sets with reproducible seeds"
        actions={
          <button
            className="button ghost compact"
            onClick={() => load({ id: '', name: '', seed: 42, mutations: [] })}
          >
            <Plus size={15} /> New
          </button>
        }
      >
        <div className="list">
          {catalog.scenarios.map((item) => (
            <button
              className="list-item"
              key={item.id}
              aria-pressed={draft.id === item.id}
              onClick={() => load(item)}
            >
              <Braces size={18} />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.mutations.length} mutations · seed {item.seed}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      </Panel>
      <Panel
        title="Scenario builder"
        description="Mutations apply to matching responses in the selected project."
      >
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void action.save('/scenarios', draft);
          }}
        >
          <div className="field-grid">
            <label>
              Name
              <input
                required
                maxLength={80}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              Scenario ID
              <input
                required
                pattern="[a-z0-9][a-z0-9\-]{0,63}"
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
              />
            </label>
            <label>
              Project scope
              <select
                value={draft.projectId ?? ''}
                disabled={saved || draft.mutations.length > 0}
                onChange={(e) => load({ ...draft, projectId: e.target.value || undefined })}
              >
                <option value="">Bundled storefront</option>
                {catalog.projects
                  .filter((item) => item.kind === 'external')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Seed
              <input
                type="number"
                min={0}
                max={2147483647}
                required
                value={draft.seed}
                onChange={(e) => setDraft({ ...draft, seed: Number(e.target.value) })}
              />
            </label>
          </div>
          {draft.mutations.map((item, index) => (
            <MutationEditor
              key={`${revision}-${index}`}
              item={item}
              index={index}
              operations={operations}
              onChange={(next) =>
                setDraft({
                  ...draft,
                  mutations: draft.mutations.map((mutation, i) => (i === index ? next : mutation)),
                })
              }
              remove={() => load({ ...draft, mutations: draft.mutations.filter((_, i) => i !== index) })}
            />
          ))}
          <div className="actions">
            <button
              type="button"
              className="button ghost"
              disabled={!defaultOperation || draft.mutations.length >= 8}
              onClick={() =>
                defaultOperation &&
                setDraft({
                  ...draft,
                  mutations: [
                    ...draft.mutations,
                    {
                      method: defaultOperation.method as Mutation['method'],
                      endpoint: defaultOperation.path,
                      operator: 'remove',
                      path: 'price',
                    },
                  ],
                })
              }
            >
              <Plus size={15} /> Add mutation
            </button>
            <button className="button primary" disabled={action.busy}>
              <Save size={15} /> Save scenario
            </button>
          </div>
          {!defaultOperation && (
            <p className="muted">
              Register a read-only operation to add a mutation.{' '}
              <a className="table-link" href={href('projects')}>
                Project settings
              </a>
            </p>
          )}
          {action.feedback}
        </form>
        <CapturedPreviews
          runs={runs.filter(
            (item) =>
              item.risk &&
              (draft.projectId
                ? item.projectId === draft.projectId
                : catalog.projects.some(
                    (entry) => entry.kind !== 'external' && entry.id === item.projectId,
                  )),
          )}
          choose={(method, endpoint, field) =>
            setDraft({
              ...draft,
              mutations: draft.mutations.map((mutation) =>
                mutation.method === method && mutation.endpoint === endpoint && 'path' in mutation
                  ? { ...mutation, path: field }
                  : mutation,
              ),
            })
          }
          canChoose={(method, endpoint) =>
            draft.mutations.some(
              (mutation) =>
                mutation.method === method && mutation.endpoint === endpoint && 'path' in mutation,
            )
          }
        />
      </Panel>
    </div>
  );
}

function CapturedPreviews({
  runs,
  choose,
  canChoose,
}: {
  runs: Summary[];
  choose: (method: string, endpoint: string, field: string) => void;
  canChoose: (method: string, endpoint: string) => boolean;
}) {
  const [id, setId] = useState('');
  const [operation, setOperation] = useState('');
  const active = runs.some((item) => item.id === id);
  const evidence = useQuery({
    queryKey: ['run', id],
    enabled: active,
    queryFn: () => api<Run>(`/runs/${id}`),
  });
  const before = active ? (evidence.data?.baseline?.observations ?? []) : [];
  const after = active ? (evidence.data?.variant?.observations ?? []) : [];
  const key = (item: { method: string; path: string }) => `${item.method} ${item.path}`;
  const choices = [...new Set([...before, ...after].map(key))];
  const selected = choices.includes(operation) ? operation : choices[0];
  const original = before.find((item) => key(item) === selected);
  const mutated = after.find((item) => key(item) === selected);
  return (
    <details className="panel">
      <summary>Captured response previews</summary>
      <p className="muted">Select real execution evidence. Text and sensitive fields are redacted.</p>
      <div className="field-grid">
        <label>
          Evidence run
          <select
            value={active ? id : ''}
            onChange={(event) => {
              setId(event.target.value);
              setOperation('');
            }}
          >
            <option value="">Choose a completed run</option>
            {runs.map((item) => (
              <option value={item.id} key={item.id}>
                {item.scenario} · {item.createdAt.slice(11, 19)}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <label>
            Captured operation
            <select value={selected} onChange={(event) => setOperation(event.target.value)}>
              {choices.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {active && evidence.isLoading && <p role="status">Loading response evidence…</p>}
      {active && evidence.error && <ErrorMessage error={evidence.error} />}
      {selected && (
        <div className="field-grid">
          <div>
            <h3>Original response</h3>
            <pre className="code-block">
              {original?.sample !== undefined ? format(original.sample) : 'No JSON sample captured'}
            </pre>
          </div>
          <div>
            <h3>Mutated response</h3>
            <pre className="code-block">
              {mutated?.sample !== undefined ? format(mutated.sample) : 'No JSON sample captured'}
            </pre>
          </div>
        </div>
      )}
      {original && canChoose(original.method, original.path) && (
        <label>
          Use a captured JSON path
          <select
            value=""
            onChange={(event) => choose(original.method, original.path, event.target.value)}
          >
            <option value="" disabled>
              Choose a field for matching mutations
            </option>
            {[
              ...new Set(
                Object.keys(original.shape)
                  .filter((item) => item !== '$')
                  .map((item) => item.replaceAll('[]', '.0')),
              ),
            ].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      )}
    </details>
  );
}

export function Explorer({ catalog, run, runs }: { catalog: Catalog; run?: Run; runs: Summary[] }) {
  const [spec, setSpec] = useState('');
  const [projectId, setProjectId] = useState('');
  const [register, setRegister] = useState(false);
  const imported = projectId
    ? (catalog.projectImports.find((item) => item.projectId === projectId)?.operations ?? [])
    : catalog.imported;
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const action = useSave();
  const comparison = useQuery({
    queryKey: ['compare', before, after],
    queryFn: () =>
      api<{
        changes: { field: string; endpoint: string; before: string | null; after: string | null }[];
        onlyBefore: string[];
        onlyAfter: string[];
      }>(`/compare?before=${before}&after=${after}`),
    enabled: Boolean(before && after && before !== after),
  });
  const rows = [
    ...(run?.baseline?.observations ?? []).map((record) => ({ ...record, execution: 'Baseline' })),
    ...(run?.variant?.observations ?? []).map((record) => ({ ...record, execution: 'Mutation' })),
  ];
  return (
    <div className="stack">
      <Panel
        title="Observed API traffic"
        description={run ? run.scenario.name : 'Browser evidence will appear after the first execution.'}
      >
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Operation</th>
                  <th>Page</th>
                  <th>Execution</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Response shape</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td>
                      <code>
                        {row.method} {row.path}
                      </code>
                    </td>
                    <td>{row.page}</td>
                    <td>{row.execution}</td>
                    <td>{row.status ?? 'Aborted'}</td>
                    <td>{row.durationMs} ms</td>
                    <td>
                      <details>
                        <summary>{Object.keys(row.shape).length} paths</summary>
                        <pre>{format(row.shape)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No observed requests"
            detail="Execute a storefront workflow to capture API dependencies."
          />
        )}
      </Panel>
      <Panel
        title="Compare response shapes"
        description="Compare observed baseline contracts across saved runs and project versions."
      >
        <div className="field-grid">
          <label>
            Before run
            <select value={before} onChange={(e) => setBefore(e.target.value)}>
              <option value="">Select a run</option>
              {runs
                .filter((item) => item.risk)
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.project} · {item.scenario} · {item.createdAt.slice(11, 19)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            After run
            <select value={after} onChange={(e) => setAfter(e.target.value)}>
              <option value="">Select a run</option>
              {runs
                .filter((item) => item.risk)
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.project} · {item.scenario} · {item.createdAt.slice(11, 19)}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {comparison.isFetching && <p role="status">Comparing contracts…</p>}
        {comparison.error && <ErrorMessage error={comparison.error} />}
        {comparison.data && (
          <div className="list">
            {comparison.data.changes.map((change) => (
              <p key={`${change.endpoint}:${change.field}`}>
                <code>
                  {change.endpoint} · {change.field}
                </code>{' '}
                {change.before ?? 'absent'} → {change.after ?? 'absent'}
              </p>
            ))}
            {comparison.data.onlyBefore.map((item) => (
              <p key={item}>Observed only before · {item}</p>
            ))}
            {comparison.data.onlyAfter.map((item) => (
              <p key={item}>Observed only after · {item}</p>
            ))}
            {!comparison.data.changes.length &&
              !comparison.data.onlyBefore.length &&
              !comparison.data.onlyAfter.length && (
                <p className="muted">No differences in observed response shapes.</p>
              )}
          </div>
        )}
      </Panel>
      <div className="split">
        <Panel
          title="Imported OpenAPI operations"
          description="Inferred from the document. Browser coverage is recorded independently."
        >
          {imported.length ? (
            <div className="list">
              {imported.map((item) => (
                <div className="list-item" key={`${item.method} ${item.path}`}>
                  <span>
                    <strong>
                      {item.method} {item.path}
                    </strong>
                    <small>{item.summary}</small>
                  </span>
                  <Badge value="inferred" />
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No OpenAPI document imported.</p>
          )}
        </Panel>
        <Panel title="Import OpenAPI 3.x" description="Paste JSON or YAML or choose a local file.">
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const query = projectId ? `?projectId=${projectId}${register ? '&register=1' : ''}` : '';
              void action.save(`/openapi${query}`, { document: spec }, 'POST');
            }}
          >
            <label>
              Import scope
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setRegister(false);
                }}
              >
                <option value="">Workspace reference</option>
                {catalog.projects
                  .filter((item) => item.kind === 'external')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            {projectId && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={register}
                  onChange={(e) => setRegister(e.target.checked)}
                />{' '}
                Register imported GET and HEAD operations for this project
              </label>
            )}
            <label>
              Specification file
              <input
                type="file"
                accept=".json,.yaml,.yml,application/json,application/yaml"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file && file.size <= 320_000) {
                    try {
                      setSpec(await file.text());
                    } catch (error) {
                      action.fail(error);
                    }
                  } else if (file)
                    action.fail(new Error('Choose a JSON or YAML file smaller than 320 KB.'));
                }}
              />
            </label>
            <label>
              Specification document
              <textarea
                rows={6}
                required
                spellCheck={false}
                value={spec}
                onChange={(e) => setSpec(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={action.busy}>
              <FileUp size={15} /> Import operations
            </button>
            {action.feedback}
          </form>
        </Panel>
      </div>
    </div>
  );
}
