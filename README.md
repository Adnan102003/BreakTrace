# BreakTrace

**Find what will break before you deploy.**

BreakTrace is a local regression lab for testing how a real browser workflow responds to synthetic API contract changes. Its Fieldwork Supply storefront demonstrates a checkout that completes with HTTP 200 while the cart displays an incorrect total. BreakTrace records the evidence, isolates the responsible mutation, exports a Playwright regression, and checks a reviewed repair in an isolated copy.

## Run locally

Install Node.js 24 LTS and run from the repository root.

```sh
npm ci
npx playwright install chromium
npm run dev
```

Open **http://127.0.0.1:5173** and select **Run demo experiment**. The API listens on **http://127.0.0.1:4311**. To shop in the standalone synthetic storefront, run `npm run demo` and open **http://127.0.0.1:4312**.

For a single-server setup, run `npm run build` and `npm start`, then open port 4311. On Linux a fresh environment may need `npx playwright install --with-deps chromium`. See the [Playwright installation documentation](https://playwright.dev/docs/intro).

For this Windows workspace, portable Node and the matching browser were installed under `.tools`. If Node is still absent from PATH, run the following in PowerShell before an npm command.

```powershell
$env:Path = "$(Resolve-Path .tools/node-v24.11.1-win-x64);$env:Path"
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.tools/browsers'
npm.cmd run dev
```

For Docker, use `docker compose up --build` and open port 4311. The Compose volume holds the evidence store.

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

Local runs and artifacts are stored in `.data/`. Environment variables are listed in [.env.example](.env.example). The optional model adapter calls a locally installed Ollama model on loopback. The dashboard identifies deterministic recommendations and Ollama suggestions by source.

## Portfolio description

**BreakTrace** — Built a full-stack regression lab that uses Playwright to replay e-commerce workflows against seeded API response mutations, detect silent pricing defects with declarative rules, and verify a minimal reproducer and reviewed repair. Shipped a React evidence dashboard, generated Playwright TypeScript tests, and a deterministic CI quality gate.

See the [interview guide](docs/INTERVIEW_GUIDE.md) for a walkthrough of the engineering trade-offs.
