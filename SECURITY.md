# Security model

BreakTrace is a single-operator lab for the bundled demo and authorized staging applications. The default API binds 127.0.0.1. Compose exposes its container port on host loopback. The API and Socket.IO require a matching loopback Host and Origin when the browser sends both. Local processes retain access to the API and evidence files.

- Run requests choose registered IDs. Demo runs pin a known loopback fixture to its exact origin and port. External runs require the server allowlist and a project-specific verification file that is fetched again before every run.
- External traffic uses validated public DNS answers and direct TLS to one pinned address. The application hostname is used for both SNI and certificate validation. Unregistered API reads, writes, cross-origin requests and redirects are rejected. External Chromium has its own deny proxy. Both modes block service workers and close WebSockets.
- OpenAPI imports do not resolve servers or remote references. MongoDB and Ollama connection configuration is controlled by the local operator.
- Response capture stores bounded field and type maps. It omits values, query strings, headers, cookies and fields with secret-like names. Console evidence stores event categories and page paths.
- External screenshots require opt-in and can contain rendered staging data. Use synthetic values in workflows and scenario definitions.
- Declarative steps use known routes and test IDs. Fixed rule operators interpret numeric data. The service applies the reviewed local pricing patch after explicit approval and runs it in a copy served to Chromium.
- HTTP bodies, catalog sizes, queue length, per-action timeouts, delay and mutation counts, trial count, and stored run count are bounded.
- Ollama is opt-in, fixed to loopback and receives a reduced summary of finding keys, kinds and mutation operators. Suggestions are displayed as text.

## Reporting

For a shared fork, configure a private vulnerability-reporting channel. A report should include the affected version, the boundary involved and a minimal synthetic reproduction.
