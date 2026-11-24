import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Braces, Cable, ChevronRight, FileUp, Plus, Save, Trash2 } from 'lucide-react';
import type { Mutation, Run } from '../../packages/shared/contracts';
import { api, type Catalog, type Summary } from './client';
import { Badge, Empty, ErrorMessage, Panel } from './ui';

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
  const [selected, setSelected] = useState(catalog.projects[0]);
  const action = useSave();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action.save('/projects', selected);
  }
  return (
    <div className="split">
      <Panel
        title="Registered projects"
        description="Projects bind each run to a version of the synthetic storefront."
        actions={
          <button
            className="button ghost compact"
            onClick={() => setSelected({ id: '', name: '', version: 'original' })}
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
              onClick={() => setSelected(item)}
              aria-pressed={selected.id === item.id}
            >
              <Cable size={18} />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.id} · {item.version}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      </Panel>
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
              pattern="[a-z0-9][a-z0-9-]{0,63}"
              value={selected.id}
              onChange={(e) => setSelected({ ...selected, id: e.target.value })}
            />
          </label>
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
          <button className="button primary" disabled={action.busy}>
            <Save size={15} /> Save project
          </button>
          {action.feedback}
        </form>
      </Panel>
    </div>
  );
}

export function Workflows({ catalog }: { catalog: Catalog }) {
  const [json, setJson] = useState(format(catalog.workflows[0]));
  const action = useSave();
  return (
    <div className="split">
      <Panel title="Registered workflows" description="Browser interactions and declarative checks">
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
        description="Edit the ID to create a new workflow. Supported steps are click, visible, text and rules."
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
            Rules support range, equal and sum-products. DOM operands read numeric data-value attributes.
            Currency uses integer cents.
          </p>
          <button className="button primary" disabled={action.busy}>
            <Save size={15} /> Save workflow
          </button>
          {action.feedback}
        </form>
      </Panel>
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
  catalog,
  onChange,
  remove,
}: {
  item: Mutation;
  index: number;
  catalog: Catalog;
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
            {catalog.endpoints.map(({ method, path }) => (
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

export function Scenarios({ catalog }: { catalog: Catalog }) {
  const [draft, setDraft] = useState(
    catalog.scenarios.find((item) => item.id === 'multi-field-drift') ?? catalog.scenarios[0],
  );
  const [revision, setRevision] = useState(0);
  const load = (value: typeof draft) => {
    setDraft(value);
    setRevision(revision + 1);
  };
  const action = useSave();
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
        description="Mutations run in the listed order on matching fixture responses."
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
                pattern="[a-z0-9][a-z0-9-]{0,63}"
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
              />
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
              catalog={catalog}
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
              disabled={draft.mutations.length >= 8}
              onClick={() =>
                setDraft({
                  ...draft,
                  mutations: [
                    ...draft.mutations,
                    {
                      method: 'GET',
                      endpoint: '/api/store/product/field-pack',
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
          {action.feedback}
        </form>
      </Panel>
    </div>
  );
}

export function Explorer({ catalog, run, runs }: { catalog: Catalog; run?: Run; runs: Summary[] }) {
  const [spec, setSpec] = useState('');
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
          {catalog.imported.length ? (
            <div className="list">
              {catalog.imported.map((item) => (
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
        <Panel title="Import OpenAPI 3.x" description="Paste a JSON document or choose a local file.">
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                void action.save('/openapi', JSON.parse(spec), 'POST');
              } catch (error) {
                action.fail(error);
              }
            }}
          >
            <label>
              JSON file
              <input
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file && file.size <= 49152) setSpec(await file.text());
                  else if (file) action.fail(new Error('Choose a JSON file smaller than 48 KB.'));
                }}
              />
            </label>
            <label>
              Specification JSON
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
