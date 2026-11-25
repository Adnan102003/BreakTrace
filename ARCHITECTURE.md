# BreakTrace architecture

The local workspace uses React and Vite for the operator UI, Express for the control plane, and a separately runnable synthetic storefront. Shared TypeScript contracts define projects, workflows, scenarios, evidence, and rules. Each run compares a fresh baseline browser context with a second context using Playwright response interception. The service emits run changes over Socket.IO and stores reports in JSON or MongoDB.

| Boundary    | Responsibility                                                                               |
| ----------- | -------------------------------------------------------------------------------------------- |
| `apps/demo` | Synthetic catalog, checkout quote, mock payment and deliberately vulnerable cart calculation |
| `apps/api`  | Bounded execution, discovery, evidence storage, risk gates, repair verification              |
| `apps/web`  | Project cockpit, scenario authoring, observed dependency graph and reports                   |
| `packages`  | Contracts, mutation operators, business rules, minimization, generated tests                 |

Demo project versions select fixture servers started by BreakTrace. External projects bind a workflow, scenario, and endpoint list to one explicitly permitted staging origin. OpenAPI servers and references remain descriptive input. Importing a document can register its GET and HEAD paths within an existing project after opt-in.

## External target boundary

An operator configures allowed HTTPS origins in the environment. A staging owner proves control by serving a short-lived challenge on the selected origin. The proof receipt is stored privately and the file is fetched again before each run. The control plane resolves all DNS answers, rejects non-public addresses, and pins a public address for the duration of that run. The HTTPS client connects to the numeric address and validates the certificate against the project hostname.

External Chromium uses a separate sandboxed process behind a deny-by-default loopback proxy. Playwright intercepts requests and forwards registered same-origin API reads through the pinned HTTPS client. Same-origin documents and static assets can load. Requests that leave the approved origin, use write methods, request an unlisted fetch endpoint, redirect, or exceed resource limits are blocked. The browser profile has no service workers, WebSockets, or downloads. Screenshots are opt-in for external projects.

## Execution and storage

The control plane validates and saves a snapshot before enqueueing work. Each run snapshots its project, workflow, scenario and thresholds before experiments begin. The JSON adapter writes through a uniquely named temporary file, then atomically replaces the prior record, with bounded retries for transient file locks. The MongoDB adapter stores catalog and per-run documents in separate collections, with indexes on run identity and start time. Both adapters keep screenshot and repair assets in the configured artifact directory. A restart marks unfinished runs interrupted.

The browser captures the exact request origin, method, path, status and elapsed time. The persisted shape retains bounded field names and types, with sensitive names removed. It links a page to an observed endpoint and that endpoint to sample response fields. Highlighted mutation-to-finding edges express an inferred relationship.

## Risk policy

Add 25 points per failed business rule up to 50, 40 for broken browser steps or exceptions, 15 for failed transport or console errors, 10 for an affected workflow and 15 for an independently reproduced failure. Add up to 15 points in proportion to missing registered endpoint coverage. Unavailable evidence adds the warning threshold. Cap the sum at 100. The default thresholds are WARNING at 25 and BLOCK at 60. The CLI returns 0 for PASS/WARNING, 1 for BLOCK and 2 for invalid or inconclusive evidence.

The queue runs one browser job at a time. A hosted version would need authenticated operators, per-project permissions, a durable queue with leases, a database transaction around job state and an object store for evidence. The local application uses CSS and accessible native controls for the UI components.

Playwright supplies the response interception primitives. See [Playwright API mocking](https://playwright.dev/docs/mock). Local builds use Node 22.12+ or 24 with Vite. See [Vite compatibility](https://vite.dev/guide/).
