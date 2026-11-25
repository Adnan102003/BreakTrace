# Security model

BreakTrace is a single-operator lab for the bundled demo and authorized local and staging applications. The default API binds 127.0.0.1. Compose exposes its container port on host loopback. The API and Socket.IO require a matching loopback Host and Origin when the browser sends both. Local processes retain access to the API and evidence files.

- Run requests choose registered IDs. Demo runs pin a known loopback fixture to its exact origin and port. External runs require the server allowlist and a project-specific verification file that is fetched again before every run.
- Staging traffic uses validated public DNS answers and direct TLS to one pinned address. The application hostname is used for both SNI and certificate validation. Explicitly approved local targets pin literal 127.0.0.1 and an explicit port. Unregistered API reads, writes, cross-origin requests and redirects are rejected. External Chromium has its own deny proxy. Both modes block service workers and close WebSockets.
- OpenAPI imports do not resolve servers or remote references. MongoDB and Ollama connection configuration is controlled by the local operator.
- Response previews store bounded shapes and numeric or boolean samples. They redact strings and omit query strings, headers, cookies and fields with secret-like names. Rule evidence can include selected values. Use synthetic rule inputs and fixtures. Console evidence stores event categories and page paths.
- External screenshots require opt-in and can contain rendered staging data. Use synthetic values in workflows and scenario definitions.
- Declarative steps use known routes and test IDs. The recorder retains typed values in memory and saves environment variable names in the workflow. Repairs require explicit approval. External repair reads operator-approved static output into bounded snapshots and runs the copies in sandboxed Chromium with outbound access denied.
- HTTP bodies, catalog sizes, queue length, per-action timeouts, delay and mutation counts, trial count, and stored run count are bounded.
- Model analysis is opt-in and sends reduced evidence to the selected provider. Ollama uses loopback. Gemini, OpenAI and GitHub tokens stay in server environment configuration. GitHub linking requests metadata for an operator-allowlisted repository. Draft files are local downloads.

## Reporting

For a shared fork, configure a private vulnerability-reporting channel. A report should include the affected version, the boundary involved and a minimal synthetic reproduction.
