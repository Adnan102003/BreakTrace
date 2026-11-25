# BreakTrace V2

## Final audit · 25 November 2026

[FINAL_AUDIT.md](FINAL_AUDIT.md) records the fresh execution evidence, per-feature classifications, benchmark results, and startup commands. This section supersedes the historical statuses below.

| Status | Scope |
| --- | --- |
| **VERIFIED** | Custom project lifecycle, API discovery and comparison, OpenAPI JSON/YAML, workflow recording and replay, built-in mutation operators, visual business rules, silent regression detection, bounded isolation, dependency graph, executable generated tests, reviewed static and demo repair, three report formats, JSON/MongoDB restart persistence, loopback and target authorization, deployment scoring and CLI gate, and both themes. |
| **PARTIALLY VERIFIED** | External target testing on real loopback HTTP and controlled staging transport, AI adapter execution, GitHub integration, responsive design, and exhaustive dashboard interaction coverage. |
| **NOT IMPLEMENTED** | Operator sign-in, per-user project permissions and distributed execution. |
| **BLOCKED** | Live HTTPS staging, live model output, authorized GitHub metadata linking, hosted Actions, and Docker runtime. |

- [x] Run lint, type checking, the production build, and all eight Vitest files with the real MongoDB integration enabled.
- [x] Pass all seven Chromium tests. Visit all 15 routes and capture console and network diagnostics for the exercised dashboard actions.
- [x] Repeat Fieldwork (30 cases) and Room Board (four cases). Run generated Fieldwork specs and generated baseline and failing specs against the approved local Room Board fixture.
- [x] Restart isolated production API instances in JSON and MongoDB modes and verify settings, run evidence and an artifact.
- [x] Fix explicit null versus missing comparison operands and exclude measured and expected rule values from model payloads.
- [x] Restrict Vite’s development file-serving scope for private workspace evidence.
- [ ] Execute live DNS, TLS and proof validation on an operator-approved HTTPS staging application.
- [ ] Exercise Ollama, Gemini and OpenAI with configured services and authorized credentials.
- [ ] Verify repository metadata with a read-only token, and run the repository workflow on hosted GitHub Actions.
- [ ] Build and run both Compose configurations on a Docker host and confirm Chromium containment and evidence volumes.
- [ ] Complete unexercised dashboard control states, populated mobile layouts, and Firefox/WebKit coverage.
- [ ] Add operator identity and per-project authorization before any shared deployment. Design a durable job queue and controlled evidence storage before adding multiple writers.

## Historical starting audit

The master brief, [architecture](ARCHITECTURE.md), [Phase 2 audit](docs/GENERALIZATION_AUDIT.md), [security model](SECURITY.md), [API contract](docs/API.md), and [benchmark](BENCHMARK_RESULTS.md) establish the current behavior. The control plane already supports staging ownership proofs, scoped workflows and scenarios, OpenAPI imports, JSON and MongoDB storage, and an evidence-based demo. Prior fixes preserve the dashboard Host through Vite and configure the workspace Chromium cache. Restart recovery marks interrupted runs in the saved catalog.

| Area                      | Existing behavior and gap                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects and execution    | Project creation and editing, staging approval and scoped workflows exist. Local owned targets, deletion, connection rechecks, project history filters, concurrent duplicate prevention and live execution deadlines need work. |
| Recording and builders    | Workflow JSON and mutation forms exist. There is no interactive recorder, visual business-rule editor or captured response preview.                                                                                             |
| Evaluation and reporting  | The 30-case Fieldwork benchmark is preserved. A structurally different fixture and HTML/PDF exports are missing.                                                                                                                |
| Analysis and integrations | Deterministic analysis, optional Ollama and one reviewed demo repair exist. Cloud providers, GitHub exports and reviewed static-repository repair are absent.                                                                   |
| Operation                 | Local JSON and MongoDB persistence exist. The workspace remains single-operator. Docker runtime, hosted Actions, live staging and model execution need their respective environments.                                           |

Baseline before V2 changes passed type checking, build, lint, 19 Vitest tests and all six Playwright tests. The optional MongoDB test was skipped in that baseline.

The [original requirement matrix](docs/GENERALIZATION_AUDIT.md) covers modules A–I, the fixture, UI, data, security, and engineering. At the V2 baseline, modules A–G already ran in the demo and through a controlled staging transport where applicable. Module H verified one built-in patch and had an unverified Ollama adapter. Module I produced a JSON gate and had static CI and Compose checks. The single-operator API does not provide user accounts or project permissions for separate users. Browser containment, project-scoped OpenAPI import and storage were working before V2 and are preserved.

## Historical implementation checks

- [x] Complete project lifecycle and local authorization. The build, 20 Vitest tests and both staging browser tests passed. The optional MongoDB test was skipped.
- [x] Record, edit, validate and replay browser actions. The Room Board recorder test drove real Chromium, captured its request, masked the input, replayed edited steps in a fresh context and saved the workflow.
- [x] Add captured before/after response previews, a JSON field selector and visual declarative rules. Build and Vitest passed.
- [x] Evaluate the engine against Room Board. Both injected failures were detected and isolated. The baseline and harmless control passed.
- [x] Export HTML and PDF evidence. Playwright verified downloads from a real demo run with screenshots and reviewed-repair results.
- [x] Verify JSON restart recovery, duplicate submission handling, project-scoped history and deletion. Vitest passed with real MongoDB 8.2.2. The local recorder integration completed the submitted experiment and retained its history after project deletion.
- [x] Add optional Ollama, Gemini and OpenAI adapters. Type checking and adapter/redaction contract tests passed. A live model was unavailable because no local Ollama instance or hosted credentials were configured.
- [x] Add GitHub metadata linking and issue, pull request, quality-gate and Playwright draft exports. Chromium verified the local draft workflow. Live metadata linking requires operator-authorized GitHub credentials.
- [x] Verify an operator-reviewed static patch. Chromium reproduced the Room Board finding in a snapshot, passed the patched scenario and baseline, and confirmed the source file was preserved. The API rejected a traversal path, approval set to false, and reuse of an approval.
- [x] Verify the Windows production build, lint, 24 Vitest tests with MongoDB 8.2.2, all seven Chromium tests, and smoke. The Chromium suite covers navigation for all 15 dashboard screens, mobile keyboard use, and saving a workflow rule with the visual builder.
- [x] Rerun the original 30 Fieldwork cases and the four Room Board cases. Keep the V2 summaries alongside the original evidence. [Benchmark results](BENCHMARK_RESULTS.md)
- [x] Validate both Compose definitions against the official Compose schema. Validate the repository and exported Actions workflows with actionlint 1.7.12.
- [ ] Verify Docker builds and the running Compose stack on a host with a Docker engine.
- [ ] Run the workflow on a hosted GitHub Actions runner and verify metadata linking with an authorized repository token.
- [ ] Verify a live approved HTTPS staging target and model output from an operator-configured provider.

## Historical dashboard control audit

The [prior route inventory](docs/GENERALIZATION_AUDIT.md#dashboard-control-audit) records the baseline controls for all 15 screens. V2 retains those links and handlers. The new controls below use the same local workspace authorization guard.

| View                                     | New controls and verification                                                                                                                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview and Test executions             | Dashboard and history filters scope counts, trends, and results by project. Active executions surface their phase and repeated active submissions resolve to one ID. Chromium verified the duplicate submission and scoped history through the API.                                       |
| Projects                                 | Select, save, validate a connection and confirm deletion. The lifecycle test exercises registration, proof, revalidation and deletion. Repository selection depends on an operator allowlist and a verified GitHub metadata request.                                                      |
| Workflows and Failure scenarios          | Recorder actions capture a browser draft, replay it, and save it. The Chromium integration covers the recorder protocol. A dashboard browser test adds a visual rule and saves the resulting workflow. The scenario preview reads only the selected completed run and recorded operation. |
| Root cause analysis and Regression tests | Deterministic analysis uses recorded evidence. Hosted AI controls require a configured provider. Browser coverage verifies local issue and CI draft previews and downloads.                                                                                                               |
| Repair verification and Deployment risk  | Explicit approval enables patch verification. Chromium covers the demo patch, static-copy patch, report exports, and BLOCK progress state.                                                                                                                                                |
