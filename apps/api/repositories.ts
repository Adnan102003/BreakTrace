import { z } from 'zod';
import type { Run } from '../../packages/shared/contracts';

export const repositorySlug = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/)
  .refine((value) => !['.', '..'].includes(value.split('/')[1]));
export type RepositoryLink = { projectId: string; repository: string; branch: string; linkedAt: string };

export function githubRepositories(env = process.env) {
  const token = env.BREAKTRACE_GITHUB_TOKEN?.trim();
  const list = token
    ? [
        ...new Set(
          (env.BREAKTRACE_GITHUB_REPOSITORIES ?? '')
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => repositorySlug.safeParse(entry).success),
        ),
      ].slice(0, 40)
    : [];
  return {
    list,
    async connect(projectId: string, repository: string): Promise<RepositoryLink> {
      if (!token || !list.includes(repository)) throw new Error('This repository is not authorized');
      const response = await fetch(`https://api.github.com/repos/${repository}`, {
        redirect: 'error',
        signal: AbortSignal.timeout(6500),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'BreakTrace',
        },
      });
      if (!response.ok) throw new Error('GitHub repository metadata is unavailable');
      const metadata = z
        .object({ full_name: repositorySlug, default_branch: z.string().min(1).max(200) })
        .parse(await response.json());
      if (metadata.full_name.toLowerCase() !== repository.toLowerCase())
        throw new Error('GitHub repository identity differs from the allowlist');
      return {
        projectId,
        repository,
        branch: metadata.default_branch,
        linkedAt: new Date().toISOString(),
      };
    },
  };
}

const markdown = (value: string) => value.replace(/[\r\n]/g, ' ').replace(/[\\`*_[\]()#<>]/g, '\\$&');
export function repositoryDraft(
  run: Run,
  kind: 'issue' | 'pull-request' | 'workflow',
  link?: RepositoryLink,
) {
  if (kind === 'workflow')
    return [
      'name: BreakTrace evidence gate',
      'on:',
      '  workflow_dispatch:',
      '    inputs:',
      '      report:',
      '        description: Path to an existing BreakTrace JSON report in this checkout',
      '        required: true',
      '        default: .data/gate-report.json',
      'permissions:',
      '  contents: read',
      'jobs:',
      '  gate:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v6',
      '        with:',
      '          persist-credentials: false',
      '      - uses: actions/setup-node@v6',
      '        with:',
      '          node-version: 24',
      '      - run: npm ci',
      '      - name: Apply the recorded deployment policy',
      '        env:',
      '          REPORT_PATH: ${{ inputs.report }}',
      '        run: npm run gate -- "$REPORT_PATH"',
      '',
    ].join('\n');
  const findings =
    (run.findings ?? []).map((item) => `- ${markdown(item.message)}`).join('\n') ||
    '- No new findings were recorded.';
  const mutations =
    run.scenario.mutations
      .map(
        (mutation, index) =>
          `- #${index + 1} ${mutation.method} ${markdown(mutation.endpoint)} · ${mutation.operator}${'path' in mutation ? ` · ${markdown(mutation.path)}` : ''}`,
      )
      .join('\n') || '- This run used baseline responses.';
  const checks = run.repair?.checks
    .map((check) => `- [${check.passed ? 'x' : ' '}] ${markdown(check.name)}`)
    .join('\n');
  return [
    `# ${kind === 'issue' ? 'Regression' : 'Proposed change'} · ${markdown(run.scenario.name)}`,
    '',
    ...(link
      ? [`Repository ${markdown(link.repository)} · base branch ${markdown(link.branch)}`, '']
      : []),
    `Requested workflow ${markdown(run.workflow.name)} · Project ${markdown(run.project.name)}`,
    `BreakTrace run \`${run.id}\` · Status ${run.status} · Gate ${run.risk?.gate ?? 'Pending'}`,
    '',
    '## Observed evidence',
    findings,
    '',
    '## Reproduction',
    mutations,
    `Seed \`${run.scenario.seed}\``,
    `Isolation ${run.isolation?.status ?? 'unavailable'} · Indices ${run.isolation?.indices.join(', ') ?? '—'}`,
    '',
    'Attach the downloaded BreakTrace report and the exported regression spec.',
    '',
    ...(checks ? ['## Repair verification', checks, ''] : []),
  ].join('\n');
}
