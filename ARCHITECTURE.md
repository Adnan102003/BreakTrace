# BreakTrace architecture

The local workspace uses React and Vite for the operator UI, Express for the control plane, and a separately runnable synthetic storefront. Shared TypeScript contracts define projects, workflows, scenarios, evidence, and rules. Each run compares a fresh baseline browser context with a second context using Playwright response interception. The service emits run changes over Socket.IO and stores reports in JSON or MongoDB.

The request boundary always enforces loopback Host and same-origin browser requests. When configured, the operator password is checked on HTTP requests and Socket.IO transports. The private VM configuration requires that password and keeps the service reachable through an SSH tunnel.

| Boundary    | Responsibility                                                                               |
| ----------- | -------------------------------------------------------------------------------------------- |
| `apps/demo` | Synthetic catalog, checkout quote, mock payment and deliberately vulnerable cart calculation |
| `apps/api`  | Bounded execution, discovery, evidence storage, risk gates, repair verification              |
| `apps/web`  | Project cockpit, scenario authoring, observed dependency graph and reports                   |
| `packages`  | Contracts, mutation operators, business rules, minimization, generated tests                 |

Demo project versions select fixture servers started by BreakTrace. External projects bind workflows, scenarios, and an endpoint list to one explicitly permitted local or staging origin. OpenAPI servers and references remain descriptive input. Importing a document can register its GET and HEAD paths within an existing project after opt-in. Room Board exercises the same external target path separately from Fieldwork.

## External target boundary

An operator configures exact allowed HTTPS origins and, separately, literal loopback HTTP origins with explicit ports. The owner proves control by serving a short-lived challenge on the selected origin. The proof receipt is stored privately and rechecked when a run starts. For staging, the control plane resolves all DNS answers, rejects non-public addresses, and pins a public address. The HTTPS client validates the certificate against the project hostname. The local path pins `127.0.0.1` and the approved port without a DNS lookup.

External Chromium uses a separate sandboxed process behind a deny-by-default loopback proxy. Playwright intercepts requests and forwards registered same-origin API reads through the pinned HTTP transport. Same-origin documents and static assets can load. Requests that leave the approved origin, use write methods, request an unlisted fetch endpoint, redirect, or exceed resource limits are blocked. The browser profile has no service workers, WebSockets, or downloads. Screenshots are opt-in for external projects.

## Execution and storage

The control plane validates and saves a snapshot before enqueueing work. Each run snapshots its project, workflow, scenario and thresholds before experiments begin. Identical active run requests reuse the existing ID. Executions have a six-minute deadline. The JSON adapter writes through a uniquely named temporary file, then atomically replaces the prior record, with bounded retries for transient file locks. The MongoDB adapter stores catalog and per-run documents in separate collections, with indexes on run identity and start time. Both adapters keep screenshot and repair assets in the configured artifact directory. A restart marks unfinished runs interrupted.

The browser captures the method, path, status and elapsed time. Persisted previews redact strings and sensitive field names. Declarative rules read bounded DOM, API and independent values at the workflow step. A recorder session keeps form inputs in memory and saves references to operator-supplied environment variables. It replays edited workflows in a fresh browser context.

HTML and PDF render the saved run and allowlisted PNGs. The PDF renderer blocks network requests. Optional model adapters submit a reduced evidence summary on request. The GitHub client verifies allowlisted repository metadata with a read-only token. Repository drafts render directly from completed runs.

For external repair, the operator authorizes a static directory per project. The API previews bounded replacements as a diff and issues an expiring review ID. After explicit approval, the runner serves isolated before-and-after snapshots through its in-memory Playwright transport. It checks the original failure signature, the patched mutation, the baseline suite and source integrity.

## Risk policy

Add 25 points per failed business rule up to 50, 40 for broken browser steps or exceptions, 15 for failed transport or console errors, 10 for an affected workflow and 15 for an independently reproduced failure. Add up to 15 points in proportion to missing registered endpoint coverage. Unavailable evidence adds the warning threshold. Cap the sum at 100. The default thresholds are WARNING at 25 and BLOCK at 60. The CLI returns 0 for PASS/WARNING, 1 for BLOCK and 2 for invalid or inconclusive evidence.

The queue runs one browser job at a time. A shared tenancy would need separate identities, per-project permissions, a durable queue with leases, database transactions around job state, and an object store for evidence. The dashboard uses CSS and accessible native controls.

Playwright supplies the response interception primitives. The release uses Node 24 for builds and CI. The package also accepts Node 22.13 and later 22.x releases. [Playwright API mocking](https://playwright.dev/docs/mock), [ESLint runtime compatibility](https://eslint.org/docs/latest/use/getting-started/#prerequisites)
