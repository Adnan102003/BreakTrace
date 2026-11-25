import { StrictMode, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import {
  Activity,
  BookOpen,
  Boxes,
  Braces,
  ChevronRight,
  CircleAlert,
  Code2,
  FlaskConical,
  GitFork,
  History,
  LayoutDashboard,
  Menu,
  Moon,
  Play,
  Radar,
  ScanLine,
  Settings,
  ShieldCheck,
  Sun,
  Workflow,
  Wrench,
  X,
} from 'lucide-react';
import { Explorer, Projects, Scenarios, Workflows, useSave } from './configuration';
import {
  DependencyGraph,
  DeploymentRisk,
  Experiments,
  FailureDetails,
  NeedRun,
  Regression,
  Repair,
  RootCause,
} from './evidence';
import { Overview, Welcome } from './overview';
import { api, href, type Catalog, type Summary } from './client';
import { Badge, ErrorMessage, Loading, Panel, RunTable } from './ui';
import type { Run } from '../../packages/shared/contracts';
import './styles.css';

const groups = [
  {
    title: 'Workspace',
    items: [
      { id: 'overview', name: 'Overview', icon: LayoutDashboard },
      { id: 'projects', name: 'Projects', icon: Boxes },
      { id: 'api', name: 'API explorer', icon: Braces },
      { id: 'workflows', name: 'Workflows', icon: Workflow },
    ],
  },
  {
    title: 'Analysis',
    items: [
      { id: 'scenarios', name: 'Failure scenarios', icon: FlaskConical },
      { id: 'runs', name: 'Test executions', icon: Activity },
      { id: 'graph', name: 'Dependency graph', icon: GitFork },
      { id: 'failures', name: 'Failure details', icon: CircleAlert },
      { id: 'analysis', name: 'Root cause analysis', icon: Radar },
      { id: 'experiments', name: 'Experiment history', icon: History },
    ],
  },
  {
    title: 'Release',
    items: [
      { id: 'regression', name: 'Regression tests', icon: Code2 },
      { id: 'repair', name: 'Repair verification', icon: Wrench },
      { id: 'risk', name: 'Deployment risk', icon: ShieldCheck },
    ],
  },
];
const pages = [
  ...groups.flatMap(({ items }) => items),
  { id: 'settings', name: 'Settings & docs', icon: Settings },
  { id: 'welcome', name: 'Welcome', icon: BookOpen },
];
const copy: Record<string, string> = {
  overview: 'Monitor API regressions across your tested workflows.',
  projects: 'Choose the synthetic application version each experiment will use.',
  api: 'Inspect captured requests, imported operations, and response shape changes.',
  workflows: 'Register browser steps and the rules that define correct behavior.',
  scenarios: 'Build deterministic API response mutations.',
  runs: 'Run a baseline and a mutated workflow in independent browsers.',
  graph: 'Trace how endpoints, fields and workflows connect to a run.',
  failures: 'Inspect the screenshots, rule checks and logs behind each finding.',
  analysis: 'Explore likely causes from the observed failure evidence.',
  experiments: 'Review the trials behind the isolated failure-inducing subset.',
  regression: 'Export browser assertions for a reproducible scenario.',
  repair: 'Compare a reviewed patch in the synthetic storefront.',
  risk: 'Review the run evidence behind the release gate.',
  settings: 'Configure local quality thresholds and learn how the lab works.',
};
const getRoute = () => {
  const [tab = 'overview', id] = window.location.hash.slice(2).split('/');
  return {
    tab: pages.some((page) => page.id === tab) ? tab : 'overview',
    id: /^[a-f0-9-]{36}$/.test(id ?? '') ? id : undefined,
  };
};
const runPages = [
  'runs',
  'api',
  'graph',
  'failures',
  'analysis',
  'experiments',
  'regression',
  'repair',
  'risk',
];
const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5000 } } });

function LaunchForm({
  catalog,
  busy,
  execute,
}: {
  catalog: Catalog;
  busy: boolean;
  execute: (data: { projectId: string; workflowId: string; scenarioId: string }) => void;
}) {
  const [projectId, setProjectId] = useState('fieldwork-shop');
  const project = catalog.projects.find((item) => item.id === projectId);
  const scope = project?.kind === 'external' ? project.id : undefined;
  const workflows = catalog.workflows.filter((item) => item.projectId === scope);
  const scenarios = catalog.scenarios.filter((item) => item.projectId === scope);
  const auth = catalog.authorization.find((entry) => entry.projectId === projectId);
  const authorized = !scope || Boolean(auth?.allowlisted && auth.verifiedAt);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    execute({
      projectId: String(form.get('project')),
      workflowId: String(form.get('workflow')),
      scenarioId: String(form.get('scenario')),
    });
  }
  return (
    <Panel
      title="New execution"
      description="Choose a project, workflow and scenario to replay in Chromium."
    >
      <form className="run-form" onSubmit={submit}>
        <label>
          Project
          <select
            name="project"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            {catalog.projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Workflow
          <select
            key={`${projectId}:workflow`}
            name="workflow"
            defaultValue={scope ? workflows[0]?.id : 'checkout'}
            required
          >
            {!workflows.length && <option value="">No workflows for this project</option>}
            {workflows.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Scenario
          <select
            key={`${projectId}:scenario`}
            name="scenario"
            defaultValue={scope ? scenarios[0]?.id : 'multi-field-drift'}
            required
          >
            {!scenarios.length && <option value="">No scenarios for this project</option>}
            {scenarios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button primary"
          disabled={busy || !authorized || !workflows.length || !scenarios.length}
        >
          <Play size={15} fill="currentColor" /> {busy ? 'Queuing…' : 'Start execution'}
        </button>
      </form>
      {scope && !authorized && (
        <p className="message">
          Verify this staging origin in{' '}
          <a className="table-link" href={href('projects')}>
            Projects
          </a>{' '}
          before running a workflow.
        </p>
      )}
      {scope && (!workflows.length || !scenarios.length) && (
        <p className="message">
          Add a project-scoped{' '}
          <a className="table-link" href={href('workflows')}>
            workflow
          </a>{' '}
          and{' '}
          <a className="table-link" href={href('scenarios')}>
            scenario
          </a>
          .
        </p>
      )}
    </Panel>
  );
}

function SettingsView({ catalog }: { catalog: Catalog }) {
  const [gate, setGate] = useState(catalog.thresholds);
  const action = useSave();
  return (
    <div className="split">
      <Panel
        title="CI quality gate"
        description="New runs snapshot these thresholds. Scores at or above the block threshold exit with code 1."
      >
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void action.save('/settings/gate', gate);
          }}
        >
          <label>
            Warning threshold
            <input
              type="number"
              required
              min={1}
              max={99}
              value={gate.warning}
              onChange={(e) => setGate({ ...gate, warning: Number(e.target.value) })}
            />
          </label>
          <label>
            Block threshold
            <input
              type="number"
              required
              min={2}
              max={100}
              value={gate.block}
              onChange={(e) => setGate({ ...gate, block: Number(e.target.value) })}
            />
          </label>
          <button className="button primary" disabled={action.busy}>
            Save thresholds
          </button>
          {action.feedback}
        </form>
      </Panel>
      <Panel
        title="Workspace documentation"
        description={`Local workspace · ${catalog.storage === 'mongo' ? 'MongoDB' : 'JSON'} storage`}
      >
        <ol className="docs-list">
          <li>In Test executions, select a fixture version, workflow and mutation scenario.</li>
          <li>Use Failure details and Dependency graph to inspect the new findings.</li>
          <li>
            Export a Playwright spec and save it under <code>tests/generated/</code>.
          </li>
          <li>
            Use <code>npm run gate -- report.json</code> on an exported deployment report.
          </li>
        </ol>
        <p className="muted">
          The repository includes the API contract, benchmark procedure and a guided demo.
        </p>
        <a className="button ghost" href={href('welcome')}>
          <BookOpen size={15} /> Product overview
        </a>
      </Panel>
    </div>
  );
}

function App() {
  const [route, setRoute] = useState(getRoute);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const toggle = document.getElementById('workspace-menu');
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('#workspace-sidebar a'));
    links[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenu(false);
        toggle?.focus();
      }
      if (event.key !== 'Tab' || !links.length) return;
      if (event.shiftKey && document.activeElement === links[0]) {
        event.preventDefault();
        links.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === links.at(-1)) {
        event.preventDefault();
        links[0].focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);
  const [connected, setConnected] = useState(false);
  const [theme, setTheme] = useState(() =>
    localStorage.getItem('breaktrace-theme') === 'light' ? 'light' : 'dark',
  );
  useEffect(() => {
    const onHash = () => {
      setRoute(getRoute());
      setMenu(false);
    };
    window.addEventListener('hashchange', onHash);
    const socket = io({ transports: ['websocket', 'polling'] });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('run:update', ({ id }: { id: string }) => {
      void client.invalidateQueries({ queryKey: ['runs'] });
      void client.invalidateQueries({ queryKey: ['run', id] });
    });
    return () => {
      window.removeEventListener('hashchange', onHash);
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('breaktrace-theme', theme);
  }, [theme]);
  useEffect(() => {
    document.title = `BreakTrace · ${pages.find((page) => page.id === route.tab)?.name}`;
  }, [route.tab]);
  const config = useQuery({ queryKey: ['config'], queryFn: () => api<Catalog>('/config') });
  const list = useQuery({
    queryKey: ['runs'],
    queryFn: () => api<Summary[]>('/runs'),
    refetchInterval: 4000,
  });
  const runs = list.data ?? [];
  const id = route.id ?? runs[0]?.id;
  const detail = useQuery({
    queryKey: ['run', id],
    queryFn: () => api<Run>(`/runs/${id}`),
    enabled: Boolean(id && runPages.includes(route.tab)),
    refetchInterval: (query) => {
      const item = query.state.data;
      return item &&
        (['queued', 'running'].includes(item.status) ||
          item.phase.includes('patch') ||
          item.phase === 'Repair queued')
        ? 1100
        : 4000;
    },
  });
  const execute = useMutation({
    mutationFn: (body: { projectId: string; workflowId: string; scenarioId: string }) =>
      api<{ id: string }>('/runs', { method: 'POST', body }),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ['runs'] });
      window.location.hash = href('runs', result.id);
    },
  });
  const run = detail.data;
  const catalog = config.data;
  const active = pages.find((page) => page.id === route.tab)!;
  const launchDemo = () =>
    execute.mutate({
      projectId: 'fieldwork-shop',
      workflowId: 'checkout',
      scenarioId: 'multi-field-drift',
    });
  const launchButton = (
    <a className="button primary" href={href('runs')}>
      <Play size={14} fill="currentColor" /> New execution
    </a>
  );
  let body: ReactNode;
  if (route.tab === 'welcome') body = <Welcome />;
  else if (config.isLoading || list.isLoading) body = <Loading />;
  else if (config.error || list.error) body = <ErrorMessage error={(config.error ?? list.error)!} />;
  else if (catalog) {
    switch (route.tab) {
      case 'overview':
        body = <Overview runs={runs} runDemo={launchDemo} busy={execute.isPending} />;
        break;
      case 'projects':
        body = <Projects catalog={catalog} />;
        break;
      case 'workflows':
        body = <Workflows catalog={catalog} />;
        break;
      case 'scenarios':
        body = <Scenarios catalog={catalog} />;
        break;
      case 'api':
        body = <Explorer catalog={catalog} run={run} runs={runs} />;
        break;
      case 'settings':
        body = <SettingsView catalog={catalog} />;
        break;
      case 'runs':
        body = (
          <div className="stack">
            <LaunchForm catalog={catalog} busy={execute.isPending} execute={execute.mutate} />
            {detail.error && <ErrorMessage error={detail.error} />}
            {run && (
              <Panel
                title={run.scenario.name}
                description={`${run.workflow.name} · ${run.project.name}`}
                actions={<Badge value={run.status} />}
              >
                <div className="run-summary">
                  <p role="status">
                    <Activity size={17} /> {run.phase}
                    {run.status === 'running' ? '…' : ''}
                  </p>
                  {run.variant && !['queued', 'running'].includes(run.status) && (
                    <a className="button ghost compact" href={href('failures', run.id)}>
                      Inspect evidence <ChevronRight size={16} />
                    </a>
                  )}
                </div>
                {run.error && <ErrorMessage error={run.error} />}
              </Panel>
            )}
            <Panel title="Execution history">
              <RunTable rows={runs} />
            </Panel>
          </div>
        );
        break;
      default:
        if (detail.isLoading) body = <Loading />;
        else if (detail.error) body = <ErrorMessage error={detail.error} />;
        else if (!run) body = <NeedRun />;
        else if (route.tab === 'graph') body = <DependencyGraph key={run.id} run={run} />;
        else if (route.tab === 'failures') body = <FailureDetails run={run} />;
        else if (route.tab === 'experiments') body = <Experiments run={run} />;
        else if (route.tab === 'analysis') body = <RootCause key={run.id} run={run} ai={catalog.ai} />;
        else if (route.tab === 'regression') body = <Regression run={run} />;
        else if (route.tab === 'repair') body = <Repair key={run.id} run={run} />;
        else if (route.tab === 'risk') body = <DeploymentRisk run={run} />;
    }
  }
  return (
    <div className="shell">
      <a
        className="skip"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      {menu && (
        <button
          type="button"
          className="veil"
          onClick={() => {
            setMenu(false);
            document.getElementById('workspace-menu')?.focus();
          }}
          aria-label="Close navigation"
        />
      )}
      <aside id="workspace-sidebar" className={`sidebar ${menu ? 'open' : ''}`}>
        <a className="brand" href={href('welcome')}>
          <span className="brand-icon">
            <ScanLine size={23} strokeWidth={2.1} />
          </span>
          <span>
            Break<span>Trace</span>
            <small>REGRESSION LAB</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Boxes size={16} />
          </span>
          <div>
            <strong>Local workspace</strong>
            <small>
              {catalog?.projects.some((project) => project.kind === 'external')
                ? 'Demo and staging targets'
                : 'Fieldwork sandbox'}
            </small>
          </div>
        </div>
        <nav aria-label="Workspace navigation">
          {groups.map((group) => (
            <div className="nav-group" key={group.title}>
              <span>{group.title}</span>
              {group.items.map(({ id, name, icon: Icon }) => (
                <a
                  key={id}
                  className={route.tab === id ? 'active' : ''}
                  href={href(id, runPages.includes(id) ? route.id : undefined)}
                  aria-current={route.tab === id ? 'page' : undefined}
                >
                  <Icon size={16} />
                  {name}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a
            href={href('settings')}
            aria-current={route.tab === 'settings' ? 'page' : undefined}
            className={route.tab === 'settings' ? 'active' : ''}
          >
            <Settings size={16} /> Settings & docs
          </a>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              id="workspace-menu"
              aria-controls="workspace-sidebar"
              className="icon-btn menu-btn"
              aria-label={menu ? 'Close navigation' : 'Open navigation'}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{active.name}</strong>
          </div>
          <div className="top-actions">
            <span className="connection">
              <span data-live={connected} />
              {connected ? 'Live' : 'Polling'}
            </span>
            <button
              className="icon-btn"
              aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {route.tab !== 'welcome' && (
            <div className="page-heading">
              <div>
                <h1>{active.name}</h1>
                <p>{copy[route.tab]}</p>
              </div>
              {route.tab === 'overview' ? (
                launchButton
              ) : runPages.includes(route.tab) && runs.length > 0 ? (
                <label className="run-picker">
                  Execution
                  <select
                    value={id ?? ''}
                    onChange={(e) => {
                      window.location.hash = href(route.tab, e.target.value);
                    }}
                  >
                    {runs.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.scenario} · {item.createdAt.slice(11, 19)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          )}
          {execute.error && <ErrorMessage error={execute.error} />}
          {body}
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
