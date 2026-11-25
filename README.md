# BreakTrace

**Find what will break before you deploy.**

BreakTrace is a local regression lab for testing how browser workflows respond to controlled API contract changes. Use the bundled Fieldwork Supply storefront or enroll a developer-owned loopback or HTTPS staging application. The demo shows how a checkout can return HTTP 200 while displaying an incorrect total, then walks through isolation, a generated regression test, and a reviewed repair.

## Run locally

Install Node.js 24 LTS and run from the repository root.

```sh
npm ci
npx playwright install chromium
npm run dev
```

Open **http://127.0.0.1:5173** and select **Run demo experiment**. The API listens on **http://127.0.0.1:4311**. To shop in the standalone synthetic storefront, run `npm run demo` and open **http://127.0.0.1:4312**.

Use the dashboard URL for browser actions. Vite proxies `/api` and `/socket.io` to the API while preserving the dashboard Host so the API can validate the browser Origin. If a running dev server still returns `Local workspace access is required` after pulling a proxy configuration change, restart Vite.

For a single-server setup, run `npm run build` and `npm start`, then open port 4311. On Linux a fresh environment may need `npx playwright install --with-deps chromium`. See the [Playwright installation documentation](https://playwright.dev/docs/intro).

For this Windows workspace, portable Node and the matching browser were installed under `.tools`. If Node is still absent from PATH, run the following in PowerShell before an npm command.

```powershell
$env:Path = "$(Resolve-Path .tools/node-v24.11.1-win-x64);$env:Path"
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.tools/browsers'
npm.cmd run dev
```

The API can also read `PLAYWRIGHT_BROWSERS_PATH=.tools/browsers` from a root `.env` file. Restart the API after changing its browser path. A dashboard can load and queue a run before the API attempts to launch Chromium.

For Docker, use `docker compose up --build` and open port 4311. The Compose volume holds the evidence store.

If a sandboxed run reports `spawn EPERM` from esbuild, use the scoped process permission in Codex or run these commands in your normal PowerShell terminal from the repository root after setting the two variables above.

```powershell
npm.cmd run smoke -- .data/windows-smoke
npm.cmd run build
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
```

## Enroll an application you control

1. Put its exact HTTPS staging origin in `BREAKTRACE_ALLOWED_ORIGINS` or its `http://127.0.0.1:<port>` origin in `BREAKTRACE_ALLOWED_LOCAL_ORIGINS`. Restart the API. In **Projects**, add a **Developer-owned application** and select the matching environment.
2. Create a target challenge, serve the requested text file on that origin, and select **Verify proof**. Leave the proof available while testing. BreakTrace fetches it again when a queued run starts.
3. Register same-origin GET and HEAD operations in **Projects**, or import OpenAPI 3.x JSON or YAML in **API explorer**. Choose the project and explicitly opt in to registering imported read-only operations. Path templates such as `/v1/items/{id}` are supported.
4. Under **Workflows**, open the recorder or create an external workflow template. Record navigation, clicks, inputs, API calls and expected outputs. Use the visual rule builder for DOM, API, and independent reference checks. For saved input steps, set the generated `BREAKTRACE_INPUT_*` variables in the API environment.
5. In **Failure scenarios**, choose the endpoint, method, field, operator and seed. Use **Test executions** to run the scoped scenario and workflow. Return to the scenario builder to inspect a completed run’s captured before-and-after response preview. For an exported external spec, set the same allowlist, `BREAKTRACE_TARGET_PROOF` to the challenge contents, and any required input variables.

External runs forward same-origin read-only traffic and mutate the response delivered to Chromium. Staging connects to a pinned public IP over TLS. Local testing pins an approved literal IPv4 loopback origin and explicit port. Both use a separate sandboxed browser. Screenshots require project opt-in. See the [security model](SECURITY.md) and [API contract](docs/API.md).

To try a second application, run `npm run fixture:rooms` and add `http://127.0.0.1:4313` to the local allowlist. Register `GET /availability/quiet-lab`. Save the issued challenge contents in `.data/room-board-proof.txt` so the fixture can serve the proof. Record a click on `view-availability` and expect `free-seats` to show `5`. The Room Board benchmark runs this fixture automatically with an ephemeral proof.

## Persistence

The default JSON mode keeps the catalog, runs, and artifacts in `.data/`. Set `BREAKTRACE_MONGO_URI` and optionally `BREAKTRACE_MONGO_DB` to store catalog and run records in MongoDB. Screenshots and repair workspaces still use `BREAKTRACE_DATA`. Changing modes selects a separate record store.

The optional `compose.mongo.yaml` overlay starts a private MongoDB service. Set `BREAKTRACE_MONGO_USER`, `BREAKTRACE_MONGO_PASSWORD`, and `BREAKTRACE_MONGO_URI` in your environment, with `mongo` as the URI hostname and an appropriate authentication database.

```sh
docker compose -f compose.yaml -f compose.mongo.yaml up --build --wait
```

## Try the investigation

1. Run **Price rename with unrelated changes** against **Fieldwork Shop** and **Cart to checkout**.
2. Open **Failure details**. Compare the unit price and the independent checkout quote, then open **Experiment history** to inspect the verified subset.
3. Open **Regression tests** and export the Playwright spec. Open **Repair verification**, approve the reviewed patch, and compare its checks and screenshots.
4. Open **Deployment risk** and download the HTML, PDF, or JSON report. Use the JSON with the CLI gate.

See the [full demo](docs/DEMO_GUIDE.md), [architecture](ARCHITECTURE.md), and [benchmark](BENCHMARK_RESULTS.md).

## Optional integrations

- Enable **Root cause analysis** with a local `BREAKTRACE_OLLAMA_MODEL`, or set the Gemini or OpenAI model and API key in the server environment. An operator click sends a bounded evidence summary to the selected provider. Deterministic analysis works without provider setup.
- In **Projects**, connect a repository from `BREAKTRACE_GITHUB_REPOSITORIES` using `BREAKTRACE_GITHUB_TOKEN` with read-only repository metadata access. **Regression tests** downloads the Playwright spec and previews issue, pull request and Actions workflow drafts. The exported quality-gate workflow expects a recorded JSON report and a checkout containing the BreakTrace gate command.
- Configure `BREAKTRACE_REPAIR_ROOTS` as a JSON map of project IDs to absolute directories of trusted static output. After a failed external run, paste existing-file replacements in **Repair verification**, review the diff, and approve. Chromium compares isolated snapshots and runs the project’s baseline workflows. Use local JSON fixtures for registered API paths, such as `availability/quiet-lab.json` for `/availability/quiet-lab`.

## Engineer and evaluate

| Command                         | Purpose                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `npm run lint`                  | ESLint                                                         |
| `npm run build`                 | Type checking and production frontend build                    |
| `npm test`                      | Vitest engine and Supertest API checks                         |
| `npm run test:e2e`              | Dashboard and browser containment checks after a build         |
| `npm run smoke`                 | Baseline, controlled failure, minimization and reviewed repair |
| `npm run test:generated`        | Playwright specs exported under `tests/generated/`             |
| `npm run benchmark`             | Thirty labeled synthetic cases and generated-spec verification |
| `npm run benchmark:rooms`       | Four labeled cases on the separate Room Board fixture          |
| `npm run gate -- <report.json>` | Apply the exported quality gate                                |

Environment variables are listed in [.env.example](.env.example). Set `BREAKTRACE_TEST_MONGO_URI` to run the MongoDB integration test against a dedicated instance. The [V2 checklist](V2_TASKS.md) records verification and remaining infrastructure work.

## Portfolio description

- Built a TypeScript regression lab that replays Playwright workflows against seeded API response changes on authorized applications. Added a workflow recorder, visual declarative rules, API evidence, and a deterministic deployment gate.
- Verified the lab on an e-commerce storefront and a separate room-availability application. Generated executable Playwright tests and verified reviewed repairs in isolated browser snapshots.

See the [interview guide](docs/INTERVIEW_GUIDE.md) for a walkthrough of the engineering trade-offs.
