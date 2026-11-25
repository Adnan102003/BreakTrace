# BreakTrace v1.0.0 release status

**Prepared 25 November 2026**

The package and lockfile are versioned at `1.0.0`. Local verification supports a trusted single-operator release. The private hosting configuration is prepared for an Oracle Cloud Linux VM. Cloud runtime, container runtime and hosted CI still require execution in their respective environments. No Git commit, tag, push, GitHub settings update, or public deployment was made.

## Changes since the technical audit

- Added operator authentication to the compiled dashboard, HTTP API, downloads and Socket.IO. The private service requires a valid password at startup. Existing loopback Host, Origin, external allowlist, proof and browser isolation rules remain active. The workspace still has one operator with access to all projects.
- Removed the Tailwind packages and replaced the utility and reset styles used by the dashboard with native CSS. Moved to supported ESLint 10. Node 24 remains the recommended release runtime, with Node 22.13 as the minimum supported 22.x version. [ESLint version support](https://eslint.org/version-support/)
- Hardened the Git and container ignore rules, documented all runtime and verification environment variables, and split the Docker build from its runtime dependencies. The Compose CI configuration now defines JSON and MongoDB runtime probes with temporary authentication.
- Added real dashboard screenshots, fresh benchmark summaries, private-host instructions and configurations, a three-minute demo, résumé copy, and an updated interview guide. Retained the historical audit and benchmark evidence.

## Release verification

| Check | Result |
| --- | --- |
| Lockfile install and advisories | A clean `npm ci` completed in a disposable folder. The npm registry advisory query returned zero known vulnerabilities for the audited dependency tree. Operating system and image packages are outside that scan. |
| Production build and TypeScript | Passed on Node 24.11.1. Vite emitted two non-fatal Rollup annotation warnings from Zod. The additional TypeScript unused-symbol check passed. |
| Lint | Passed on the final release dependency set. |
| Unit and integration | **28 passed** in eight Vitest files with MongoDB enabled. Coverage includes validation, mutation and rule behavior, isolation, JSON recovery, real MongoDB, target proof and lifecycle, operator access, and model/GitHub request contracts. |
| Browser | **8 passed** in Playwright Chromium. Coverage includes all 15 routes, a mobile viewport and keyboard flow, the protected dashboard and live connection, scoped OpenAPI/rules/mutations, recorded and edited workflows, evidence and graph controls, repair, and real report downloads. Recorded 190 browser API responses with zero unexpected failures, console errors or uncaught page exceptions. Vite emitted a development WebSocket warning. |
| Authenticated production startup | Required mode rejected a missing or invalid password. Separate JSON and MongoDB processes passed the production probe, rejected anonymous requests, and retained the completed baseline and PNG after a restart. |
| Fieldwork benchmark | **30/30 matched**. Detected 20 regressions and passed 10 controls with zero missed, false-positive or indeterminate cases. Isolated 20/20 expected subsets. All 20 generated specs reproduced the expected failures and both reviewed repair cases passed. [Release summary](docs/evidence/release-1.0.0-fieldwork.json) |
| Room Board benchmark | **4/4 matched**, with both intended failures isolated. A generated baseline spec passed. The independently executed capacity-rename export failed on its expected business rule. [Release summary](docs/evidence/release-1.0.0-rooms.json) |
| Smoke and CLI gate | All five Fieldwork repair checks passed. The original run scored **80 / BLOCK** with exit 1. The resilient run scored **5 / PASS** with exit 0. |
| Secrets and development files | Git ignore checks covered environment files, token and credential paths, dependencies, private keys, local tools, and evidence. The template is eligible for Git. The prior browser failure context was archived, and its stale run marker and disposable install directories were removed. Windows retained two in-use binaries under ignored `node_modules` cache folders. They are absent from the release lockfile. |
| Packaging and configuration | Docker Compose v5.8.0 accepted both stack configurations. actionlint accepted the CI workflow. The MongoDB executable parsed the private host config. The supplied systemd service was reviewed against the production entry point. |

Raw test logs, restart results, reports and screenshots from the test runs are preserved under the Git-ignored `.data/release-1.0.0/` directory in the verification checkout. The README screenshots depict the synthetic Fieldwork demo. Git includes the small benchmark summaries for release readers.

## Remaining blockers and limits

| Area | Status |
| --- | --- |
| Release publishing | Repository description and topics are ready in [REPOSITORY_METADATA.md](REPOSITORY_METADATA.md). Publication still requires an authorized repository and approved release commit and tag. The project has no license file. Select terms before presenting it as open source. |
| OCI private service | [Deployment instructions](DEPLOYMENT.md) and the systemd/MongoDB configurations are prepared. Actual Arm VM provisioning, kernel sandbox compatibility, the systemd unit and SSH access remain unverified on OCI. Free instance availability and idle reclamation depend on the tenancy. |
| Docker and hosted Actions | The workstation lacks the Docker daemon endpoint. Actual builds, both Compose runtime modes, Linux container Chromium and hosted CI have no fresh execution evidence. |
| Live integrations | Controlled transports verified OpenAI, Gemini, Ollama and GitHub request behavior. A live approved HTTPS target, live model responses and authenticated GitHub metadata remain unverified without operator-owned credentials or services. |
| Shared or public use | Separate user identities, project-level access control, a durable job queue, and shared evidence access are outside the single-operator design. Deploy only through the private loopback access pattern. |
| Browser coverage | Chromium covered the tested dashboard and approved target fixture flows. Other browser engines and every populated mobile and alternate control state remain unverified. |

[Read the project overview](README.md) · [Run the three-minute demo](DEMO_SCRIPT.md) · [Review the technical audit](FINAL_AUDIT.md)
