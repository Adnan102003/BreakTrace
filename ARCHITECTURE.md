# BreakTrace architecture

The local workspace uses React and Vite for the operator UI, Express for the control plane, and a separately runnable synthetic storefront. Shared TypeScript contracts define scenarios, workflows, evidence, and rules. Each run compares a fresh baseline browser context with a second context using Playwright response interception. The service emits status changes over Socket.IO and stores reports as local JSON.

| Boundary    | Responsibility                                                                               |
| ----------- | -------------------------------------------------------------------------------------------- |
| `apps/demo` | Synthetic catalog, checkout quote, mock payment and deliberately vulnerable cart calculation |
| `apps/api`  | Bounded execution, discovery, evidence storage, risk gates, repair verification              |
| `apps/web`  | Project cockpit, scenario authoring, observed dependency graph and reports                   |
| `packages`  | Contracts, mutation operators, business rules, minimization, generated tests                 |

Targets are fixture servers started by BreakTrace. Project versions refer to the included demo versions. OpenAPI is descriptive input and never determines network destinations. Integer cents prevent floating-point ambiguity in the demo. Local file persistence keeps the default installation independent of MongoDB, Redis and AI providers.

## Execution and storage

The control plane validates and saves a snapshot before enqueueing work. A run directory holds the immutable inputs, both execution records, risk factors, minimization trials, screenshots and reviewed-patch results. Catalog entries use shared IDs. Each run snapshots its workflow, scenario and thresholds so later edits leave prior results reproducible. Saving uses a temporary file and rename. A restart marks unfinished runs interrupted.

The browser captures the exact request origin, method, path, status and elapsed time. The persisted shape retains bounded field names and types, with sensitive names removed. It links a page to an observed endpoint and that endpoint to sample response fields. Highlighted mutation-to-finding edges express an inferred relationship.

## Risk policy

Add 25 points per failed business rule up to 50, 40 for broken browser steps or exceptions, 15 for failed transport or console errors, 10 for an affected workflow and 15 for an independently reproduced failure. Add up to 15 points in proportion to missing fixture coverage. Unavailable evidence adds the warning threshold. Cap the sum at 100. The default thresholds are WARNING at 25 and BLOCK at 60. The CLI returns 0 for PASS/WARNING, 1 for BLOCK and 2 for invalid or inconclusive evidence.

The queue runs one browser job at a time. A hosted version would need authenticated operators, per-project permissions, a durable queue with leases, a database transaction around job state and an object store for evidence. The local application uses CSS and accessible native controls for the UI components.

Playwright supplies the response interception primitives. See [Playwright API mocking](https://playwright.dev/docs/mock). Local builds use Node 22.12+ or 24 with Vite. See [Vite compatibility](https://vite.dev/guide/).
