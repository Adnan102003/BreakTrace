import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Braces,
  CircleCheck,
  FlaskConical,
  GitPullRequestArrow,
  Network,
  Play,
  ShieldCheck,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useState } from 'react';
import type { Project } from '../../packages/shared/contracts';
import type { Summary } from './client';
import { href } from './client';
import { Badge, Empty, Panel, RunTable } from './ui';

export function Welcome() {
  return (
    <div className="welcome">
      <div className="hero-card landing">
        <div className="hero-copy">
          <span className="eyebrow">
            <Activity size={15} /> API REGRESSION LAB
          </span>
          <h1>
            Find what will break
            <br />
            before you deploy.
          </h1>
          <p>
            Compare browser workflows under controlled response changes, isolate a reproducible failure,
            and turn the evidence into a Playwright test.
          </p>
          <a className="button primary" href={href('overview')}>
            Open workspace <ArrowRight size={17} />
          </a>
        </div>
        <Pipeline />
      </div>
      <div className="welcome-cards">
        <Panel title="Replay actual workflows">
          <p>
            Playwright compares independent baseline and mutated browser sessions against a synthetic
            e-commerce application.
          </p>
        </Panel>
        <Panel title="Detect silent regressions">
          <p>
            Check quantities, prices, discounts and checkout totals even when the response status is 200.
          </p>
        </Panel>
        <Panel title="Verify a fix">
          <p>Export a reproducible test or run the reviewed storefront patch in an isolated copy.</p>
        </Panel>
      </div>
    </div>
  );
}

function Pipeline() {
  return (
    <div className="pipeline" aria-label="Experiment flow">
      <div className="pipe-node">
        <Braces size={18} />
        <span>API response</span>
      </div>
      <div className="pipe-line">
        <span />
      </div>
      <div className="pipe-node featured">
        <FlaskConical size={18} />
        <span>Mutation</span>
      </div>
      <div className="pipe-line">
        <span />
      </div>
      <div className="pipe-node">
        <CircleCheck size={18} />
        <span>Browser evidence</span>
      </div>
    </div>
  );
}

export function Overview({
  runs,
  projects,
  runDemo,
  busy,
}: {
  runs: Summary[];
  projects: Project[];
  runDemo: () => void;
  busy: boolean;
}) {
  const [projectId, setProjectId] = useState('');
  const scoped = projectId ? runs.filter((run) => run.projectId === projectId) : runs;
  const completed = scoped.filter(
    (run) => run.risk && ['passed', 'failed', 'inconclusive'].includes(run.status),
  );
  const recent = completed[0];
  const metrics = [
    {
      name: 'Total executions',
      value: scoped.length,
      hint: `${scoped.filter((run) => ['queued', 'running'].includes(run.status)).length} queued or running`,
      icon: Activity,
      tone: 'purple',
    },
    {
      name: 'Detected regressions',
      value: scoped.filter((run) => run.status === 'failed').length,
      hint: 'Runs with new findings',
      icon: GitPullRequestArrow,
      tone: 'red',
    },
    {
      name: 'Endpoint coverage',
      value: recent?.risk ? `${recent.risk.coverage.observed}/${recent.risk.coverage.total}` : '—',
      hint: 'Latest completed execution',
      icon: Network,
      tone: 'blue',
    },
    {
      name: 'Quality gate',
      value: recent?.risk?.gate ?? '—',
      hint: 'Latest completed execution',
      icon: ShieldCheck,
      tone:
        recent?.risk?.gate === 'BLOCK' ? 'red' : recent?.risk?.gate === 'WARNING' ? 'amber' : 'green',
    },
  ];
  const series = completed
    .slice(0, 12)
    .reverse()
    .map((item, index) => ({ name: `Run ${index + 1}`, risk: item.risk?.score }));
  return (
    <>
      <div className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">
            <FlaskConical size={14} /> CONTROLLED EXPERIMENTS
          </span>
          <h2>
            Find what will break
            <br />
            before you deploy.
          </h2>
          <p>Inject API failures, replay user workflows, and verify the impact with browser evidence.</p>
          <button className="button primary" onClick={runDemo} disabled={busy}>
            <Play size={15} fill="currentColor" /> {busy ? 'Queuing experiment…' : 'Run demo experiment'}
          </button>
        </div>
        <Pipeline />
      </div>
      <div className="actions dashboard-filter">
        <label>
          Dashboard project{' '}
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="metrics">
        {metrics.map(({ name, value, hint, icon: Icon, tone }) => (
          <section className="metric" key={name}>
            <div className="metric-label">
              <span className={`metric-icon ${tone}`}>
                <Icon size={17} />
              </span>
              {name}
            </div>
            <strong>{value}</strong>
            <span>{hint}</span>
          </section>
        ))}
      </div>
      <div className="dashboard-columns">
        <Panel
          title="Recent executions"
          description="Baseline and mutation runs in this workspace"
          actions={
            <a
              className="button ghost compact"
              href={`${href('runs')}${projectId ? `?project=${projectId}` : ''}`}
            >
              All runs <ArrowUpRight size={14} />
            </a>
          }
        >
          <RunTable rows={scoped.slice(0, 5)} />
        </Panel>
        <Panel
          title="Risk trend"
          description="Scores from completed runs"
          actions={recent?.risk && <Badge value={recent.risk.gate} />}
        >
          {series.length ? (
            <div
              className="chart"
              role="img"
              aria-label={`Risk scores in execution order: ${series.map((p) => p.risk).join(', ')}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 6, right: 10, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--muted)" hide />
                  <YAxis width={45} domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--muted)" />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="risk"
                    stroke="var(--accent)"
                    fill="var(--accent)"
                    fillOpacity={0.13}
                    strokeWidth={2}
                    dot
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty title="Awaiting evidence" detail="Executed scenarios will populate this chart." />
          )}
          <a className="panel-foot" href={href('risk', recent?.id)}>
            View deployment risk <ArrowDownRight size={14} />
          </a>
        </Panel>
      </div>
    </>
  );
}
