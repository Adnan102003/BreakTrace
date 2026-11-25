# BreakTrace

**Find what will break before you deploy.**

BreakTrace is a local regression lab for testing how browser workflows respond to controlled API contract changes. Use the bundled Fieldwork Supply storefront or enroll a developer-owned HTTPS staging application. The demo shows how a checkout can return HTTP 200 while displaying an incorrect total, then walks through isolation, a generated regression test, and a reviewed repair.

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

## Enroll a staging application you control

1. Put its exact public HTTPS origin in `BREAKTRACE_ALLOWED_ORIGINS` and restart the API. Add a **Developer-owned staging** project in **Projects**.
2. Create a target challenge, serve the requested text file on that origin, and select **Verify proof**. Leave the proof available while testing. BreakTrace fetches it again when a queued run starts.
3. Register same-origin GET and HEAD operations in **Projects**, or import OpenAPI 3.x JSON or YAML in **API explorer**. Choose the project and explicitly opt in to registering imported read-only operations. Path templates such as `/v1/items/{id}` are supported.
4. Create a scoped workflow and scenario. Workflows use bounded same-origin navigation, `data-testid` actions and declarative rules. A rule operand can read a numeric `data-value` or plain numeric text.
5. Select the scoped workflow and scenario in **Test executions**. For a generated external test, provide the same origin allowlist and set `BREAKTRACE_TARGET_PROOF` to the challenge contents.

External runs forward same-origin read-only traffic and mutate the response delivered to Chromium. Each origin uses a validated public IP and a separate sandboxed browser. A target with cross-origin APIs, login state, redirects, or write operations can use a dedicated read-only staging harness. Screenshots require project opt-in. See the [security model](SECURITY.md) and [API contract](docs/API.md).

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
4. Open **Deployment risk** and export the run JSON for the CLI gate.

See the [full demo](docs/DEMO_GUIDE.md), [architecture](ARCHITECTURE.md), and [benchmark](BENCHMARK_RESULTS.md).

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
| `npm run gate -- <report.json>` | Apply the exported quality gate                                |

Environment variables are listed in [.env.example](.env.example). Set `BREAKTRACE_TEST_MONGO_URI` to run the MongoDB integration test against an instance reserved for testing. The optional Ollama adapter connects to a locally installed model on port 11434. The dashboard labels model suggestions and deterministic recommendations by source.

## Portfolio description

**BreakTrace** — Built a full-stack regression lab that uses Playwright to replay e-commerce workflows against seeded API response mutations, detect silent pricing defects with declarative rules, and verify a minimal reproducer and reviewed repair. Shipped a React evidence dashboard, generated Playwright TypeScript tests, and a deterministic CI quality gate.

See the [interview guide](docs/INTERVIEW_GUIDE.md) for a walkthrough of the engineering trade-offs.
