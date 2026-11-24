import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CircleCheck,
  Code2,
  Download,
  FlaskConical,
  Radar,
  ShieldCheck,
} from 'lucide-react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Run } from '../../packages/shared/contracts';
import { api, artifact, href } from './client';
import { Badge, Empty, ErrorMessage, Loading, Panel } from './ui';

export function NeedRun() {
  return (
    <Empty
      title="Select an execution"
      detail="Run a scenario to collect this evidence."
      action={
        <a className="button primary compact" href={href('runs')}>
          Go to executions <ArrowRight size={15} />
        </a>
      }
    />
  );
}
const detailsLink = (tab: string, id: string, title: string) => (
  <a className="button ghost compact" href={href(tab, id)}>
    {title} <ArrowRight size={14} />
  </a>
);

export function FailureDetails({ run }: { run: Run }) {
  const columns = [
    ['Baseline', run.baseline],
    ['Mutated', run.variant],
  ] as const;
  return (
    <div className="stack">
      <Panel
        title={run.scenario.name}
        description={`${run.project.name} · ${run.workflow.name} · seed ${run.scenario.seed}`}
        actions={<Badge value={run.status} />}
      >
        {run.error && <ErrorMessage error={run.error} />}
        {run.status === 'inconclusive' && (
          <p className="message">
            The baseline produced findings or a mutation did not reach its target.
          </p>
        )}
        <div className="actions">
          {detailsLink('analysis', run.id, 'Root cause')}
          {detailsLink('graph', run.id, 'Dependency graph')}
          {detailsLink('experiments', run.id, 'Experiments')}
        </div>
      </Panel>
      <div className="split equal">
        {columns.map(([title, result]) => (
          <Panel
            key={title}
            title={title}
            description={
              result
                ? `${result.durationMs} ms · ${result.observations.length} observed requests · ${result.issueLog.length} findings`
                : 'Awaiting browser evidence'
            }
          >
            {result?.screenshot && (
              <figure>
                <a
                  className="evidence-image"
                  href={artifact(run.id, result.screenshot)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img src={artifact(run.id, result.screenshot)} alt={`${title} browser checkpoint`} />
                </a>
                {result.screenshotPage && (
                  <figcaption className="muted">
                    <code>{result.screenshotPage}</code>
                  </figcaption>
                )}
              </figure>
            )}
            {result && (
              <div className="rule-list">
                {result.rules.map((rule) => (
                  <div key={rule.id}>
                    <span>
                      {rule.name}
                      <small>
                        Measured {rule.actual ?? 'missing'} · expected {rule.expected}
                      </small>
                    </span>
                    <Badge value={rule.passed ? 'passed' : 'failed'} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        ))}
      </div>
      <Panel
        title="New findings"
        description={
          run.screenshots
            ? `${run.screenshots.changedPixels.toLocaleString()} of ${run.screenshots.totalPixels.toLocaleString()} screenshot pixels differ`
            : undefined
        }
        actions={
          run.screenshots?.diff && (
            <a
              className="button ghost compact"
              href={artifact(run.id, run.screenshots.diff)}
              target="_blank"
              rel="noreferrer"
            >
              Open visual diff
            </a>
          )
        }
      >
        {run.findings?.length ? (
          <div className="rule-list">
            {run.findings.map((issue) => (
              <div key={issue.key}>
                <span>
                  <strong>{issue.message}</strong>
                  <small>
                    {issue.page} · {issue.kind} ·{' '}
                    {issue.severity ??
                      (issue.kind === 'console' || issue.kind === 'network' ? 'medium' : 'high')}{' '}
                    severity
                  </small>
                </span>
                <Badge value="failed" />
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No new findings recorded.</p>
        )}
      </Panel>
      <Panel title="Mutation configuration">
        <div className="rule-list">
          {run.scenario.mutations.map((mutation, index) => (
            <div key={index}>
              <span>
                <strong>
                  {mutation.method} {mutation.endpoint}
                </strong>
                <small>
                  {mutation.operator}
                  {'path' in mutation && ` · ${mutation.path}`}
                </small>
              </span>
              <Badge value={run.variant?.applied.includes(index) ? 'applied' : 'unobserved'} />
            </div>
          ))}
        </div>
        {!run.scenario.mutations.length && (
          <p className="muted">This run used baseline responses only.</p>
        )}
      </Panel>
    </div>
  );
}

export function Experiments({ run }: { run: Run }) {
  if (!run.isolation)
    return (
      <Empty
        title="No minimization evidence"
        detail="Completed runs with a new failure record their controlled experiments here."
      />
    );
  return (
    <div className="stack">
      <Panel
        title="Minimum failure isolation"
        description="Fresh contexts reproduce the same normalized finding signature."
        actions={<Badge value={run.isolation.status} />}
      >
        <p className="muted">
          {run.isolation.status === 'verified'
            ? 'Verified inclusion-minimal scenario under tested single-removal checks.'
            : 'The experiment did not establish a stable minimal subset.'}
        </p>
        <div className="rule-list">
          {run.isolation.indices.map((index) => {
            const item = run.scenario.mutations[index];
            return (
              <div key={index}>
                <span>
                  <strong>
                    {item.operator} {'path' in item ? item.path : ''}
                  </strong>
                  <small>
                    {item.method} {item.endpoint}
                  </small>
                </span>
                <code>#{index + 1}</code>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel
        title="Experiment history"
        description={`${run.isolation.history.length} controlled trials`}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Trial</th>
                <th>Mutations</th>
                <th>Outcome</th>
                <th>Findings</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {run.isolation.history.map((row, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>
                    <code>{row.indices.map((item) => `#${item + 1}`).join(', ') || 'Control'}</code>
                  </td>
                  <td>
                    <Badge value={row.outcome} />
                  </td>
                  <td>{row.findings.join(', ') || '—'}</td>
                  <td>{row.durationMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

export function RootCause({ run, ai }: { run: Run; ai: boolean }) {
  const analysis = useQuery({
    queryKey: ['analysis', run.id, run.phase],
    queryFn: () =>
      api<{ source: string; text: string; repairAvailable: boolean }>(`/runs/${run.id}/analysis`),
  });
  const suggestion = useMutation({
    mutationFn: () =>
      api<{ source: string; text: string }>(`/runs/${run.id}/analysis`, { method: 'POST' }),
  });
  return (
    <div className="stack">
      <Panel
        title="Evidence-based recommendation"
        description={analysis.data?.source}
        actions={<Radar size={21} className="accent" />}
      >
        {analysis.isLoading && <Loading />}
        {analysis.error && <ErrorMessage error={analysis.error} />}
        {analysis.data && <p>{analysis.data.text}</p>}
        <div className="actions">
          {detailsLink('experiments', run.id, 'Inspect trials')}
          {analysis.data?.repairAvailable && detailsLink('repair', run.id, 'Verify reviewed patch')}
        </div>
      </Panel>
      <Panel
        title="Local AI analysis"
        description={
          ai
            ? 'Suggestions are unverified until exercised in the browser.'
            : 'Set BREAKTRACE_OLLAMA_MODEL to use a locally installed Ollama model.'
        }
      >
        <button
          className="button ghost"
          disabled={!ai || suggestion.isPending}
          onClick={() => suggestion.mutate()}
        >
          {suggestion.isPending ? 'Analyzing…' : 'Analyze with Ollama'}
        </button>
        {suggestion.error && <ErrorMessage error={suggestion.error} />}
        {suggestion.data && (
          <>
            <p className="muted">{suggestion.data.source}</p>
            <p className="preline">{suggestion.data.text}</p>
          </>
        )}
      </Panel>
    </div>
  );
}

export function Regression({ run }: { run: Run }) {
  const ready = Boolean(run.variant) && !['queued', 'running', 'error'].includes(run.status);
  const code = useQuery({
    queryKey: ['test', run.id],
    queryFn: () => api<string>(`/runs/${run.id}/test`),
    enabled: ready,
  });
  return (
    <Panel
      title="Playwright TypeScript regression"
      description="Save the generated spec under tests/generated/ and run it from the project root."
      actions={
        ready && (
          <a className="button primary compact" href={`/api/runs/${run.id}/test?download=1`}>
            <Download size={15} /> Export .spec.ts
          </a>
        )
      }
    >
      {!ready && <p className="muted">A completed execution is required.</p>}
      {ready && code.isLoading && <Loading />}
      {code.error && <ErrorMessage error={code.error} />}
      {code.data && (
        <pre className="code-block">
          <Code2 size={16} aria-hidden="true" />
          <code>{code.data}</code>
        </pre>
      )}
    </Panel>
  );
}

export function Repair({ run }: { run: Run }) {
  const cache = useQueryClient();
  const [approved, setApproved] = useState(false);
  const supported =
    run.project.version === 'original' &&
    run.status === 'failed' &&
    run.isolation?.status === 'verified' &&
    run.isolation.indices.some((index) => {
      const item = run.scenario.mutations[index];
      return item.operator === 'rename' && item.path === 'price' && item.to === 'productPrice';
    });
  const verification = useMutation({
    mutationFn: () => api(`/runs/${run.id}/repair`, { method: 'POST', body: { approved: true } }),
    onSuccess: () => {
      setApproved(false);
      void cache.invalidateQueries({ queryKey: ['run', run.id] });
    },
  });
  return (
    <div className="stack">
      <Panel
        title="Reviewed pricing patch"
        description="Accept integer cents from the original or renamed price field. Verify the patch in an isolated copy of the demo."
      >
        {supported ? (
          <div className="form">
            <label className="check">
              <input
                type="checkbox"
                checked={approved}
                onChange={(e) => setApproved(e.target.checked)}
              />{' '}
              Apply the reviewed patch to the isolated copy
            </label>
            <button
              className="button primary"
              disabled={!approved || verification.isPending || run.phase !== 'Complete'}
              onClick={() => verification.mutate()}
            >
              <FlaskConical size={16} /> Verify repair
            </button>
            {run.phase !== 'Complete' && <p role="status">{run.phase}…</p>}
          </div>
        ) : (
          <p className="muted">
            Available after the original demo reproduces an isolated price-field rename.
          </p>
        )}
        {verification.error && <ErrorMessage error={verification.error} />}
        {run.error && <ErrorMessage error={run.error} />}
      </Panel>
      {run.repair && (
        <Panel
          title="Verification results"
          description={run.repair.patch}
          actions={<Badge value={run.repair.passed ? 'passed' : 'failed'} />}
        >
          <div className="rule-list">
            {run.repair.checks.map((check) => (
              <div key={check.name}>
                <span>{check.name}</span>
                <Badge value={check.passed ? 'passed' : 'failed'} />
              </div>
            ))}
          </div>
          <div className="split equal">
            {[run.repair.before, run.repair.after].map(
              (result, index) =>
                result.screenshot && (
                  <a
                    className="evidence-image"
                    key={index}
                    href={artifact(run.id, result.screenshot)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={artifact(run.id, result.screenshot)}
                      alt={index === 0 ? 'Browser before repair' : 'Browser after repair'}
                    />
                  </a>
                ),
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

export function DeploymentRisk({ run }: { run: Run }) {
  if (!run.risk)
    return <Empty title="Risk is pending" detail="The score is computed after evidence is recorded." />;
  return (
    <div className="stack">
      <Panel
        title="Deployment assessment"
        description="Deterministic score from the selected synthetic execution"
        actions={<Badge value={run.risk.gate} />}
      >
        <div className="risk-heading">
          <span className="metric-icon purple">
            <ShieldCheck size={19} />
          </span>
          <strong>
            {run.risk.score}
            <small> / 100</small>
          </strong>
        </div>
        <progress value={run.risk.score} max={100} aria-label="Evidence risk score" />
        <p className="muted">
          {run.risk.coverage.observed} of {run.risk.coverage.total} registered endpoints observed ·
          Warning at {run.risk.thresholds.warning} · Block at {run.risk.thresholds.block}
        </p>
        <a className="button ghost" href={`/api/runs/${run.id}/report`}>
          <Download size={15} /> Export JSON report
        </a>
      </Panel>
      <Panel title="Score breakdown">
        <div className="rule-list">
          {run.risk.factors.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <code>+{item.points}</code>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

type GraphNode = Node<{ label: string; detail: string; kind: string; affected?: boolean }, 'evidence'>;
function EvidenceNode({ data, selected }: NodeProps<GraphNode>) {
  return (
    <div className={`graph-node ${data.affected ? 'affected' : ''} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <small>{data.kind}</small>
      <strong>{data.label}</strong>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { evidence: EvidenceNode };
function graph(run: Run) {
  const nodes: GraphNode[] = [];
  const edges: Edge[] = [];
  const link = (source: string, target: string, inference = false) => {
    const id = `${source}→${target}`;
    if (!edges.some((edge) => edge.id === id))
      edges.push({
        id,
        source,
        target,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke: inference ? '#c99a6b' : '#8173c7',
          strokeDasharray: inference ? '5 4' : undefined,
        },
        ariaLabel: inference ? 'Inferred association' : 'Observed association',
      });
  };
  const add = (
    id: string,
    column: number,
    kind: string,
    label: string,
    detail: string,
    affected = false,
  ) => {
    if (nodes.some((node) => node.id === id)) return;
    const row = nodes.filter((node) => node.position.x === column * 245).length;
    nodes.push({
      id,
      type: 'evidence',
      position: { x: column * 245, y: row * 91 },
      data: { kind, label, detail, affected },
    });
  };
  const observations = [...(run.baseline?.observations ?? []), ...(run.variant?.observations ?? [])];
  const issues = run.findings ?? [];
  const active =
    run.isolation?.status === 'verified' ? run.isolation.indices : (run.variant?.applied ?? []);
  for (const row of observations) {
    const endpoint = `${row.method} ${row.path}`;
    const affected =
      active.some(
        (index) =>
          run.scenario.mutations[index].endpoint === row.path &&
          run.scenario.mutations[index].method === row.method,
      ) && issues.length > 0;
    add(endpoint, 1, 'API ENDPOINT', endpoint, 'Observed in a captured browser request.', affected);
    add(
      `page:${row.page}`,
      0,
      'PAGE',
      row.page,
      'Initiator page recorded during interception.',
      issues.some((issue) => issue.page === row.page),
    );
    link(`page:${row.page}`, endpoint);
    for (const [field, type] of Object.entries(row.shape)
      .filter(([key]) => key !== '$')
      .slice(0, 8)) {
      const normalized = field.replaceAll('[]', '.0');
      const affectedField =
        affected &&
        active.some((index) => {
          const mutation = run.scenario.mutations[index];
          return mutation.endpoint === row.path && 'path' in mutation && mutation.path === normalized;
        });
      add(
        `${endpoint}:${field}`,
        2,
        'RESPONSE FIELD',
        field,
        `${type} · observed in ${endpoint}`,
        affectedField,
      );
      link(endpoint, `${endpoint}:${field}`);
    }
  }
  for (const path of [...new Set([...(run.baseline?.pages ?? []), ...(run.variant?.pages ?? [])])])
    add(
      `page:${path}`,
      0,
      'PAGE',
      path,
      'Navigation observed during the workflow.',
      issues.some((issue) => issue.page === path),
    );
  add('workflow', 3, 'WORKFLOW', run.workflow.name, `${run.workflow.steps.length} registered steps`);
  add('result', 4, 'TEST RESULT', run.status, `${issues.length} new findings`, issues.length > 0);
  link('workflow', 'result');
  for (const node of nodes.filter((node) => node.id.startsWith('page:'))) link(node.id, 'workflow');
  for (const issue of issues) {
    const id = `issue:${issue.key}`;
    add(id, 5, 'DETECTED FAILURE', issue.key, issue.message, true);
    link('result', id);
    for (const index of active) {
      const item = run.scenario.mutations[index];
      const endpoint = `${item.method} ${item.endpoint}`;
      if (nodes.some((node) => node.id === endpoint)) link(endpoint, id, true);
    }
  }
  return { nodes, edges };
}

export function DependencyGraph({ run }: { run: Run }) {
  const { nodes, edges } = graph(run);
  const [selectedId, setSelectedId] = useState('');
  const selected = nodes.find((node) => node.id === selectedId)?.data;
  return (
    <div className="stack">
      <Panel
        title="Observed dependencies"
        description="Solid edges come from execution evidence. Dashed edges associate applied mutations with findings."
        actions={<Badge value="observed" />}
      >
        <div className="flow">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            onNodeClick={(_event, node) => setSelectedId(node.id)}
            minZoom={0.15}
            maxZoom={1.4}
            colorMode="system"
          >
            <Background color="var(--border)" gap={18} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </Panel>
      <Panel title="Node evidence">
        <label>
          Inspect node
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            <option value="">Choose a node</option>
            {nodes.map(({ id, data }) => (
              <option key={id} value={id}>
                {data.kind} · {data.label}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <p>
            <strong>{selected.label}</strong> · {selected.detail}
          </p>
        ) : (
          <p className="muted">
            <CircleCheck size={14} /> Select a graph node to inspect its evidence.
          </p>
        )}
      </Panel>
    </div>
  );
}
