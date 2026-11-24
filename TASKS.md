# Development checklist

- [x] Inspect workspace and available Windows development tools.
- [x] Record initial architecture and roadmap.
- [x] Phase 1. Install dependencies and verify build, lint and local startup.
- [x] Phase 2. Exercise synthetic store, response interception and dashboard evidence.
- [x] Phase 3. Verify rules, mutation operators, observed dependencies and bounded isolation.
- [x] Phase 4. Validate generated Playwright tests, reviewed repair and CI gate.
- [x] Phase 5. Check local security boundaries, persistence and dashboard controls. Add Docker and CI configurations.
- [x] Phase 6. Run the benchmark and document the portfolio walkthrough.
- [ ] Run the Docker image and hosted GitHub Actions job in environments where they are available.

| Phase | Implementation evidence                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Vite build, ESLint and TypeScript passed. Dev dashboard and proxied API health returned HTTP 200.                                                               |
| 2     | Checkout completed with a zero cart total under an HTTP 200 mutation. Browser evidence showed the expected checkout quote was 8,640 cents.                      |
| 3     | Minimized three mutations to the price rename in fresh browser runs. Compared two observed versions and found the added string field `details.inventoryUnit`.   |
| 4     | Smoke verification passed all five repair checks. The original gate returned BLOCK at 80 and exit 1. The resilient run returned PASS at 5 and exit 0.           |
| 5     | Fourteen Vitest and Supertest tests and two Chromium dashboard and containment tests passed. The localhost workspace persisted the original and resilient runs. |
| 6     | Thirty labeled scenarios ran. The [benchmark report](BENCHMARK_RESULTS.md) links the raw trial records, per-spec results and machine-readable summary.          |

Portable Node and Chromium are installed under `.tools` in the Windows workspace. Docker was absent, so the container build and startup remain unverified. GitHub Actions has its workflow configuration and the corresponding local checks. Hosted verification requires an authorized repository run. Ollama remains optional and requires a locally installed model.
