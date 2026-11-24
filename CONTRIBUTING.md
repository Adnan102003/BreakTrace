# Contributing

Use Node.js 24, install locked dependencies with `npm ci`, and install Chromium with `npx playwright install chromium`. Run `npm run lint`, `npm run build`, `npm test` and `npm run test:e2e` after changes to the control plane or dashboard.

Keep demo fixtures synthetic and deterministic. Add a labeled benchmark case when adding a new failure mode. Changes to mutation semantics should account for older saved scenarios and preserve original mutation indices across subset runs.

Use `npm run format` for source formatting. Keep local data, secrets and installed binaries out of commits. Commit a benchmark only with its measured summary and enough raw output to reproduce the claims.
