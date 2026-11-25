# BreakTrace résumé material

## Project entry

**BreakTrace | Browser-Based API Regression Testing Lab**  
TypeScript, React, Express, Node.js, Playwright, MongoDB, Socket.IO, Docker Compose, GitHub Actions

- Built a TypeScript and Playwright platform that runs browser workflows in isolated baseline and mutation contexts. Added OpenAPI import, workflow recording and replay, declarative business rules, and API response fault injection.
- Implemented seeded response mutations and bounded failure isolation. Detected 20 of 20 labeled Fieldwork regressions with zero false alarms across 10 controls, matched all 20 expected subsets, and confirmed four expected outcomes on a separate Room Board fixture.
- Generated executable Playwright tests that reproduced all 20 labeled Fieldwork regressions. Verified two reviewed repair cases, added HTML/PDF/JSON evidence exports, and implemented a configurable CLI deployment gate.
- Added JSON and MongoDB persistence, project-scoped target authorization, and single-operator authentication for private deployments. Verified dashboard behavior, browser containment and database persistence in local integration tests.

## Short version

Built a TypeScript, React and Playwright regression lab that identifies silent frontend failures caused by API changes, isolates triggering mutations, generates executable tests, and verifies reviewed repairs. Validated 34 labeled cases across two synthetic applications.

The figures describe the documented synthetic fixtures and the local verification environment. [Benchmark results](BENCHMARK_RESULTS.md), [release verification](RELEASE_STATUS.md)
