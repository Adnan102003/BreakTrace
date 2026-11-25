# BreakTrace V2

## Starting audit

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

## Implementation

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

## Dashboard control audit

The [prior route inventory](docs/GENERALIZATION_AUDIT.md#dashboard-control-audit) records the baseline controls for all 15 screens. V2 retains those links and handlers. The new controls below use the same local workspace authorization guard.

| View                                     | New controls and verification                                                                                                                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview and Test executions             | Dashboard and history filters scope counts, trends, and results by project. Active executions surface their phase and repeated active submissions resolve to one ID. Chromium verified the duplicate submission and scoped history through the API.                                       |
| Projects                                 | Select, save, validate a connection and confirm deletion. The lifecycle test exercises registration, proof, revalidation and deletion. Repository selection depends on an operator allowlist and a verified GitHub metadata request.                                                      |
| Workflows and Failure scenarios          | Recorder actions capture a browser draft, replay it, and save it. The Chromium integration covers the recorder protocol. A dashboard browser test adds a visual rule and saves the resulting workflow. The scenario preview reads only the selected completed run and recorded operation. |
| Root cause analysis and Regression tests | Deterministic analysis uses recorded evidence. Hosted AI controls require a configured provider. Browser coverage verifies local issue and CI draft previews and downloads.                                                                                                               |
| Repair verification and Deployment risk  | Explicit approval enables patch verification. Chromium covers the demo patch, static-copy patch, report exports, and BLOCK progress state.                                                                                                                                                |
