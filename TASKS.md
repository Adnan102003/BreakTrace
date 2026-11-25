# Development checklist

## Bundled demo milestones

- [x] Inspect workspace and available Windows development tools.
- [x] Record initial architecture and roadmap.
- [x] Phase 1. Install dependencies and verify build, lint and local startup.
- [x] Phase 2. Exercise synthetic store, response interception and dashboard evidence.
- [x] Phase 3. Verify rules, mutation operators, observed dependencies and bounded isolation.
- [x] Phase 4. Validate generated Playwright tests, reviewed repair and CI gate.
- [x] Phase 5. Check local security boundaries, persistence and dashboard controls. Add Docker and CI configurations.
- [x] Phase 6. Run the benchmark and document the portfolio walkthrough.

| Phase | Implementation evidence                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Vite build, ESLint and TypeScript passed. Dev dashboard and proxied API health returned HTTP 200.                                                               |
| 2     | Checkout completed with a zero cart total under an HTTP 200 mutation. Browser evidence showed the expected checkout quote was 8,640 cents.                      |
| 3     | Minimized three mutations to the price rename in fresh browser runs. Compared two observed versions and found the added string field `details.inventoryUnit`.   |
| 4     | Smoke verification passed all five repair checks. The original gate returned BLOCK at 80 and exit 1. The resilient run returned PASS at 5 and exit 0.           |
| 5     | Fourteen Vitest and Supertest tests and two Chromium dashboard and containment tests passed. The localhost workspace persisted the original and resilient runs. |
| 6     | Thirty labeled scenarios ran. The [benchmark report](BENCHMARK_RESULTS.md) links the raw trial records, per-spec results and machine-readable summary.          |

## Phase 2 product development

- [x] Audit all original requirements and dashboard surfaces. [Generalization audit](docs/GENERALIZATION_AUDIT.md)
- [x] Implement allowlisted external HTTPS enrollment, file proof, project-scoped workflows and scenarios, declarative rules, pinned HTTPS transport, and browser containment.
- [x] Support project-scoped OpenAPI JSON and YAML imports, with opt-in GET and HEAD registration.
- [x] Preserve JSON mode and verify MongoDB catalog and run persistence across separate connections using MongoDB 8.2.2.
- [x] Exercise the main demo, all 15 screen routes, mobile keyboard navigation, and authorized external behavior in Chromium with a synthetic staging transport.
- [x] Validate the GitHub Actions workflow with actionlint 1.7.12. Validate both Compose files against the official Compose Specification JSON schema.
- [x] Rerun the 30-case bundled benchmark and preserve the original evidence. [Benchmark results](BENCHMARK_RESULTS.md)
- [ ] Run a live external workflow with an operator-provided staging origin and confirmation of control.
- [ ] Build and run the Compose stack on an approved Docker host. Windows Application Control blocked the Compose executable on this workstation, which also lacks a Docker engine.
- [ ] Run the hosted GitHub Actions jobs when an authorized repository run is available.
- [ ] Exercise the local Ollama adapter with an installed model. No local process answered on port 11434.

### Windows process and file-lock checks

The restricted Codex shell reproduced `spawn EPERM` in esbuild and reported `EPERM` for independent Node child-process calls to System32, Node itself, and esbuild. Direct PowerShell execution reported esbuild 0.28.2. The npm wrapper and native Windows x64 binary matched. Node 24.11.1 met the installed dependency requirements. The Node child process succeeded with scoped process permission both inside and outside the OneDrive working directory. The same workspace passed smoke, build, lint, and the test suites with that permission.

A later browser run surfaced a separate `rename EPERM` during JSON persistence on Windows. The JSON adapter now retries transient replace errors within a bounded interval and continues to publish complete files atomically. A targeted test verifies retry and cleanup.

### Phase 2 verification

The final Windows run passed type checking, the production build, lint, 20 Vitest tests with a real MongoDB instance, and all five Playwright tests. The standalone MongoDB-backed server served the compiled dashboard and completed the demo baseline with a PASS gate. The staging browser test used synthetic HTTPS responses. It demonstrated permission checks, response interception and rule failure isolation without contacting a live staging site.

### Development proxy authorization fix

- [x] Reproduced the browser's `POST /api/runs` returning HTTP 403 on both loopback dashboard aliases. Logged the request at Express and confirmed that Vite's string proxy configuration changed Host to the API port while retaining the dashboard Origin.
- [x] Configured the Vite HTTP and Socket.IO proxies to preserve Host. The same Express guard still rejects writes from another loopback port or a foreign origin.
- [x] Configured the local API to use its installed Chromium cache through `PLAYWRIGHT_BROWSERS_PATH` in the root `.env` and confirmed the API watcher restarted.
- [x] Clicked Run demo experiment on the live dashboard. Run `4a6a226b-ab0f-4a15-85b1-d2c5f698aa2b` returned HTTP 202, finished with a clean baseline and two expected findings, and isolated the price rename. Its risk score was 80 with a BLOCK gate. The screenshot, generated spec, and report endpoints returned HTTP 200.
- [x] Passed type checking, lint, 19 Vitest tests, and all six Playwright tests. The optional MongoDB test was skipped for this proxy check. The Vite regression test covered live updates, a real demo run, screenshots, reviewed repair verification, settings saves, OpenAPI import, and rejected cross-origin writes.

## V2 development

See [V2_TASKS.md](V2_TASKS.md) for the requirements audit, implementation evidence and open verification items. V2 extends the original demo with allowlisted local projects, browser workflow recording, visual rules, captured response previews, report exports, repository drafts and approved static-snapshot repair.
