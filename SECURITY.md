# Security model

BreakTrace is a single-operator lab for the included synthetic storefront. The default API binds 127.0.0.1. Compose exposes its container port on host loopback. The API and Socket.IO check Host, Origin and cross-site fetch metadata. Local processes retain access to the API and evidence files.

- Run requests choose registered IDs. BreakTrace starts a known loopback fixture and pins the browser context to its exact origin and port.
- Interception rejects other origins and redirects, blocks service workers and closes WebSockets. OpenAPI imports do not resolve servers or remote references.
- Response capture stores bounded field and type maps. It omits values, query strings, headers, cookies and fields with secret-like names. Console evidence stores event categories and page paths.
- Screenshots reflect rendered synthetic data. Use synthetic values in scenario definitions.
- Declarative steps use known routes and test IDs. Fixed rule operators interpret numeric data. The service applies the reviewed local pricing patch after explicit approval and runs it in a copy served to Chromium.
- HTTP bodies, catalog sizes, queue length, per-action timeouts, delay and mutation counts, trial count, and stored run count are bounded.
- Ollama is opt-in, fixed to loopback and receives a reduced summary of finding keys, kinds and mutation operators. Suggestions are displayed as text.

## Reporting

For a shared fork, configure a private vulnerability-reporting channel. A report should include the affected version, the boundary involved and a minimal synthetic reproduction.
