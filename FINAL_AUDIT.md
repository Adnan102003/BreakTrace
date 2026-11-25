# BreakTrace V2 technical audit

**Audit date** 25 November 2026  
**Revision** `8c53dec` plus the existing working-tree changes and audit fixes  
**Environment** Windows, Node.js 24.11.1, local Chromium, isolated MongoDB 8.2.2

## Scope and verdict

The standalone V1 and V2 prompt text was unavailable in the repository. The comparison uses the V1 modules A–I and requirements preserved in the [generalization audit](docs/GENERALIZATION_AUDIT.md), the [V1 checklist](TASKS.md), the [V2 checklist](V2_TASKS.md), and the requirements supplied for this audit. Historical benchmark files served as reference. The results below come from fresh runs.

BreakTrace is suitable for a trusted single-operator loopback workspace. Shared or public deployment is **BLOCKED** by the absence of operator authentication and project-level access control. Docker runtime and hosted CI are also **BLOCKED** pending their operating environments. No existing service was restarted. The persistence checks used separate temporary processes and stores.

**VERIFIED** indicates execution within the documented scope. **PARTIALLY VERIFIED** indicates that an important supported path still lacks execution evidence. **NOT IMPLEMENTED** indicates a missing capability. **BLOCKED** indicates an implemented path whose necessary environment, authorization, or service was unavailable.

## Feature verification

| Feature | Implementation | Actual verification | Evidence | Limitations and remaining work |
| --- | --- | --- | --- | --- |
| Custom application registration and lifecycle | Implemented | **VERIFIED** | Chromium created a scoped staging project. The project-lifecycle suite exercised real Room Board loopback registration, proof, recheck, and deletion. | Origin enrollment requires exact operator configuration and a hosted proof. |
| External authorized application testing | Implemented for owner-approved loopback and HTTPS staging | **PARTIALLY VERIFIED** | Real loopback HTTP, Chromium and pinned transport exercised Room Board. The HTTPS enrollment and run suite used controlled DNS and transport fixtures with real Chromium. | Run the real DNS, TLS and HTTP path against an operator-approved staging origin with its challenge file. |
| API discovery and version comparison | Implemented for observed workflows | **VERIFIED** | Chromium recorded requests and response shapes, and the API explorer compared Fieldwork versions. Staging assertions recorded a templated operation with 1/1 coverage. | Discovery reflects executed workflows, with bounded sampling and no exhaustive endpoint discovery. |
| OpenAPI specification import | Implemented for OpenAPI 3.x JSON and YAML | **VERIFIED** | Imported pasted JSON and uploaded YAML in Chromium. Project-scoped opt-in registered a GET template used in a run. API tests checked operation scoping and descriptive references. | Servers and references are descriptive. Only GET and HEAD may become external operations. |
| Workflow recording and replay | Implemented | **VERIFIED** | The recorder test used Room Board in Chromium, captured a fill and request, stored a variable reference, replayed the edited draft in a fresh context, saved it, and ran it. | Same-origin navigation and test-ID controls. Uploads, authentication flows, and multi-tab gestures are outside scope. |
| Custom API mutation builder | Implemented | **VERIFIED** | Chromium added, removed and saved a scoped response mutation, replayed it, inspected both response samples, and selected a captured JSON field. Fieldwork exercised the bundled mutation families. | Mutations operate on intercepted responses. External upstream requests remain read-only. |
| Custom business rule builder | Implemented | **VERIFIED** | A range rule created in the dashboard passed on the baseline and failed on the mutated staging fixture. Room Board exercised required, type, range, equality and arithmetic rules. Unit regression covers explicit null and absent values. | Visual arithmetic is limited to one price–quantity term. Workflow JSON supports up to ten. |
| Silent bug detection and frontend impact | Implemented | **VERIFIED** | Fieldwork returned HTTP 200 while displaying 0 cents against an independent 8,640-cent quote. Room Board caught both availability regressions. Recorded run evidence includes rule, console, network and browser step categories. | Accuracy depends on the workflow and rules chosen. Benchmarks use curated fixtures. |
| Minimum failure isolation | Implemented for bounded inclusion-minimal search | **VERIFIED** | Fieldwork matched 20/20 expected subsets. Room Board matched both expected subsets. Smoke isolated mutation index 1 of three. | Single-removal checks and bounded repeated trials establish the supported result. Global cardinality and exhaustive flake detection remain outside scope. |
| Dependency graph | Implemented | **VERIFIED** | Chromium rendered the response-field graph using actual run evidence and exercised node selection and viewport controls. | Graph edges represent observations or associations. Code-level field reads and causal edges are outside scope. |
| Automated regression test generation | Implemented for Fieldwork and authorized external projects | **VERIFIED** | Playwright executed all 20 generated Fieldwork regressions on the original and both reviewed cases on the resilient version. The generated Room Board baseline passed and the capacity rename failed on the expected business rule. | External exports require the approved target and proof to remain available, plus any workflow input variables. |
| Generalized repair verification | Implemented for reviewed, bounded static replacements and the Fieldwork patch | **VERIFIED** | Chromium verified Room Board before/after snapshots, the failure signature, patched scenario, baseline and original source integrity. Approval and path constraints were exercised. Smoke passed five demo repair checks. | General-purpose backend builds, source edits, and deployment verification are outside scope. |
| AI integrations | Ollama, Gemini and OpenAI adapters plus deterministic guidance | **PARTIALLY VERIFIED** | Chromium displayed deterministic guidance. The Vitest OpenAI contract test substituted the provider transport and checked the request and reduced data. The outbound model evidence regression passed. | Live Ollama, Gemini and OpenAI output is **BLOCKED** without a model service or operator credentials. |
| GitHub integration | Allowlisted metadata linking and local issue, PR and workflow drafts | **PARTIALLY VERIFIED** | Chromium previewed the drafts and downloaded a workflow. actionlint checked current CI configuration. Source review confirmed an explicit repository allowlist, metadata-only request, and client response without the token. | Live repository linking and hosted Actions are **BLOCKED** without an authorized repository and runner. Publishing is outside the implemented integration. |
| PDF, HTML and JSON reports | Implemented | **VERIFIED** | Download controls triggered all three file types. API checks parsed JSON, verified HTML findings, repair checks and embedded images, and checked the generated PDF header. | Exports inherit the selected run’s scope and evidence. |
| MongoDB persistence and JSON restart recovery | Implemented | **VERIFIED** | Real MongoDB integration passed. Two independent API processes per mode showed threshold, completed run, gate and PNG persistence. Vitest covered interrupted records and atomic JSON replacement retries. | Artifacts stay on disk in both modes. Distributed workers, shared writers and leases are outside scope. |
| Workspace authorization and request boundaries | Implemented for a trusted local operator and scoped external targets | **VERIFIED** | Negative tests rejected foreign browser Origin, unauthorized runs and writes, mixed public/private DNS, and redirects. Revocation disabled execution. | OS and loopback trust define the operator boundary. |
| Operator authentication and project permissions | Absent | **NOT IMPLEMENTED** | Architecture and API route review found no sign-in, session identity, role checks or user-specific project policy. | Add authenticated identities and enforce per-project permissions before any shared deployment. |
| Deployment risk assessment and CLI gate | Implemented | **VERIFIED** | Original Fieldwork scored 80 with BLOCK and CLI exit 1. Resilient scored 5 with PASS and exit 0. Chromium rendered the corresponding risk and tested threshold editing. | Policy score depends on measured evidence and configured thresholds. Hosted enforcement is **BLOCKED**. |
| Dark and light themes | Implemented | **VERIFIED** | Chromium switched themes in both directions and checked persistence across reload. | Theme behavior was checked in Chromium. |
| Responsive design | Implemented | **PARTIALLY VERIFIED** | Chromium visited every dashboard route on desktop and exercised the 390 px navigation drawer, keyboard focus and overflow check. | Repeat populated views on narrow touch devices and in Firefox and WebKit. |
| Dashboard interaction coverage | Implemented across 15 routes | **PARTIALLY VERIFIED** | See the dashboard checks and coverage gaps below. | Provider and repository controls depend on live integrations. Some alternate interaction and viewport states still lack execution evidence. |
| Docker runtime and hosted GitHub Actions | Configured | **BLOCKED** | Both Compose configurations passed `config --quiet`. actionlint 1.7.12 passed. The Docker daemon endpoint was absent. Git has no configured remote. | Exercise both Compose stacks and the workflow on authorized hosts. |

## Execution evidence

| Check | Result |
| --- | --- |
| `npm run build` | Passed, including `tsc --noEmit` and Vite production compilation. Rollup emitted two non-fatal dependency annotation warnings from Zod. |
| `npm run lint` | Passed. |
| `npm test` | 25 passed across eight Vitest files, including Supertest integrations and live MongoDB. There is no separate integration-test script. |
| `npm run test:e2e` | 7/7 Chromium tests passed on the final build, with zero skips, retries or unexpected failures. [Playwright report](.data/final-audit-20261125/playwright-verified.json) |
| Generated Playwright suites | The Fieldwork benchmark and the separate Room Board export check ran the generated Playwright configuration. Negative regression fixtures failed by design and the expected failure evidence was checked. |
| Smoke and CLI gate | All five reviewed repair checks passed. Gate outcome and exit codes verified independently from the two generated reports. |
| Production entrypoint and restart | Started the production API entry point four times with separate process IDs. Each storage mode retained threshold settings, a completed Fieldwork baseline and its PNG artifact across a stop and restart. |
| Dependency advisories | `npm audit --json` exited 0 and returned zero known vulnerabilities for the audited npm dependency tree. Operating system and container image packages remain outside this scan. [npm audit output](.data/final-audit-20261125/npm-audit.json) |

The Windows tool sandbox initially denied esbuild and Chromium child-process creation with `EPERM`. The runs above used approved process execution with the original browser containment settings.

Five dashboard tests recorded 171 browser API responses with zero unexpected HTTP errors or network failures. They recorded zero uncaught page exceptions and zero console errors. Chromium recorded one WebSocket startup warning in the development proxy test. Vite also logged a socket abort on teardown. The workspace reached its Live state and passed the proxy assertions. Download and navigation cancellations are excluded from unexpected failures. The separate negative API tests asserted their expected 400 and 403 responses.

### Benchmark reruns

| Fixture | Labeled cases | Detection | Isolation | Regression and repair |
| --- | ---: | --- | --- | --- |
| Fieldwork | 30 | 20 failures and 10 controls matched. Zero false positives, false negatives or indeterminate results. Mean case execution was 4,701 ms. | 20/20 expected subsets. | 20/20 generated regressions reproduced. 2/2 repaired specs passed. 2/2 eligible reviewed repairs verified. |
| Room Board | 4 | Baseline and label-removal control passed. Capacity rename and negative reservation failed as expected. | 2/2 failures isolated to index 0. | Separate generated baseline passed and capacity-rename spec failed on the expected rule. Static repair passed in the recorder integration. |

Raw evidence is under the Git-ignored audit directory for this checkout. [Fieldwork summary](.data/final-audit-20261125/fieldwork-final/summary.json), [Fieldwork measurements](.data/final-audit-20261125/fieldwork-final/measurements.json), [Room Board summary](.data/final-audit-20261125/rooms-final/summary.json), [generated Room Board results](.data/final-audit-20261125/generated-room-results.json), [smoke reports](.data/final-audit-20261125/smoke/), [restart results](.data/final-audit-20261125/process-restart/summary.json).

### Dashboard checks

| Route | Executed coverage |
| --- | --- |
| Landing | Brand link, Open workspace and Settings product-overview link. |
| Overview | Run demo experiment and New execution. |
| Projects | Add and select a scoped project, save, create challenge, verify proof, check connection, cancel and confirm revocation, open project history, and cancel and confirm deletion. |
| API explorer | Pasted JSON, uploaded YAML, project-scoped operation registration, and before/after response shape comparison. |
| Workflows | Starter and external template, visual rule creation, save, recorder start, keyboard focus shortcut, fill, click, text assertion, API request list, replay, and close. |
| Failure scenarios | New scenario, project scope, add/remove, save, select saved scenario, and captured response and field selection. |
| Test executions | Scoped run submission, evidence link, project and status filters, duplicate request IDs and revoked-target disabled state. |
| Dependency graph | Populated graph, inspected node and zoom/fit controls. |
| Failure details | Silent finding and loaded PNG evidence. |
| Root cause analysis | Deterministic recommendation and disabled AI action without a provider. |
| Experiment history | Verified subset and rendered trial history. |
| Regression tests | Spec preview and download, issue and PR preview and CI draft download. |
| Repair verification | Explicit demo approval and verified repair results. External static replacements were previewed and approved in the dashboard and validated through the API. |
| Deployment risk | BLOCK state, score and JSON/HTML/PDF downloads. |
| Settings & docs | Threshold save and API readback, product overview link, desktop and mobile navigation and both themes. |

Coverage is incomplete for live integration buttons, every mutation editor operand and rule-builder branch, and every interaction on every device. The engine tests and benchmarks cover behavior separately from the UI controls.

## Security findings

| Area | Finding and evidence | Disposition |
| --- | --- | --- |
| Operator identity and authorization | The default loopback bind, Host/Origin guard and Socket.IO guard restrict browser-origin access. Local processes can access the trusted workspace. External target proof and project scoping passed negative and positive tests. | **Open, deployment blocker** for shared or public use. |
| Input validation | Zod validates route inputs, allowed IDs, scoped operations and bounded payloads. Tests rejected invalid gates, invalid run IDs, invalid mutation paths and unapproved static repair paths. OpenAPI parsing uses alias limits. | **VERIFIED** for exercised paths. |
| SSRF and target validation | Tests rejected disallowed origins, non-public DNS, redirects and out-of-scope operations. Local tests used a real pinned loopback connection. HTTPS certificate verification was inspected in source. | **PARTIALLY VERIFIED** until an approved live staging run. |
| Browser containment | Separate sandboxed external Chromium and deny proxy were used. Chromium tests rejected another origin, write methods and unregistered API fetches. Service worker and WebSocket policy were reviewed. Same-origin documents and assets remain readable to support rendering. | **VERIFIED** for the tested boundaries. Linux container confinement remains runtime-unverified. |
| Sensitive evidence | Verified scoped proof stays out of public config and generated spec text. Recorder output stored the input reference. The model prompt exposed numeric business rule measurements and expectations before the audit change. | **Fixed** for model requests. Local run evidence, opted-in screenshots, reports and reviewed diffs can contain sensitive application values. |
| Development file serving | The Vite development server returned HTTP 200 for a synthetic evidence file outside the web source tree. Its filesystem allowlist covered the entire repository. | **Fixed**. The same check returned HTTP 403 after limiting direct file serving to the web app, shared contracts and installed dependencies. |
| Secrets and environment | `.env` is ignored by Git and excluded by Docker. Source review checked server-only credential reads and the `BREAKTRACE_INPUT_*` scope. Secret configuration values were omitted from audit output. | **VERIFIED** for current file handling and inspected code paths. Production deployment needs managed secret injection. |
| GitHub permissions | The app allows configured repository slugs, uses a metadata request and rejects redirects. Repo CI and workflow drafts request `contents: read` and disable persisted checkout credentials. | **PARTIALLY VERIFIED**. A live repository token’s effective scope was unavailable. |
| Dependency vulnerabilities | The npm registry advisory audit returned zero advisories. | **VERIFIED** for that registry result on the audit date. Scan container images when a Docker runner is available. |

## Audit fixes

- Equality rules now treat a captured JSON `null` as an explicit value. Missing DOM operands resolve to `undefined`, so an inequality check cannot pass just because an operand is missing. The new regression failed before the fix and passed afterward.
- Model requests now include failed rule IDs and exclude their actual and expected values. Tests reproduced the original disclosure with fixture numbers and verified the outgoing OpenAI request after the change. Local displays retain the rule evidence.
- The Vite server now serves only the dashboard source, shared contracts and installed dependencies. A test for a synthetic evidence file reproduced the broader access before the change.
- Expanded the browser suite to check dashboard console and API failures, exercise the recorder through the dashboard, and verify real download events and additional controls.

## Current technology stack

| Layer | Versions exercised |
| --- | --- |
| Runtime and language | Node.js 24.11.1, TypeScript 5.9.3, tsx 4.23.15, npm with lockfile |
| Frontend | React 19.3.1, Vite 7.3.8, Tailwind CSS 4.3.5, TanStack Query 5.108.4, React Flow 12.12.1, Recharts 3.11.1 |
| Control plane | Express 5.3.0, Socket.IO 4.8.4, Zod 4.6.7, YAML 2.9.1 |
| Data | Atomic JSON filesystem store or MongoDB 8.2.2 with Mongoose 9.13.0, plus artifacts on disk |
| Verification and packaging | Playwright 1.65.1 with Chromium, Vitest 4.1.12, Supertest 7.3.2, ESLint 9.39.5, Docker and Compose definitions, GitHub Actions |

## Exact startup commands

Run from the repository root with Node.js 24 installed.

```sh
npm ci
npx playwright install chromium
npm run dev
```

Open `http://127.0.0.1:5173`. The development API defaults to port 4311. Use the following for the built dashboard at `http://127.0.0.1:4311`.

```sh
npm run build
npm start
```

This Windows checkout can use its existing portable executables.

```powershell
$env:Path = "$(Resolve-Path .tools/node-v24.11.1-win-x64);$env:Path"
$env:PLAYWRIGHT_BROWSERS_PATH = (Resolve-Path .tools/browsers).Path
npm.cmd run build
npm.cmd start
```

To select MongoDB, set `BREAKTRACE_MONGO_URI` to a running database and optionally set `BREAKTRACE_MONGO_DB` before `npm start`. Set `BREAKTRACE_DATA` to the directory for artifacts. These PowerShell commands use a dedicated local MongoDB instance on port 27017.

```powershell
$env:BREAKTRACE_MONGO_URI = 'mongodb://127.0.0.1:27017/breaktrace'
$env:BREAKTRACE_MONGO_DB = 'breaktrace'
npm.cmd start
```

The documented Compose entry points require a Docker engine. The MongoDB overlay also requires the credential variables described in the [README](README.md#persistence).

```sh
docker compose up --build --wait
docker compose -f compose.yaml -f compose.mongo.yaml up --build --wait
```

## Remaining development and deployment readiness

1. Add authentication, project-level authorization, and a durable queue and evidence access model for any shared deployment.
2. Run the approved live HTTPS target, live model and GitHub metadata integrations using operator-controlled accounts. Run hosted CI and both Compose variants and verify container Chromium isolation and persisted volumes.
3. Complete alternate dashboard control and cross-browser coverage. Extend repair support only where there is an agreed design for backend execution and isolation.
