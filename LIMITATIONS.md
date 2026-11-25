# Limitations

- The control plane is single-operator and binds to loopback by default. External projects require an allowlisted public HTTPS staging origin and proof of control. Private network, localhost, cross-origin APIs, authentication flows, write requests and redirects are outside the external test scope.
- JSON and MongoDB store independent sets of records. There is one writer per store and one in-process queue. MongoDB mode still stores artifacts on the local filesystem. Multi-user identity, distributed leases, Redis/BullMQ and object storage remain outside the current architecture.
- Discovery covers routes reached by executed workflows. OpenAPI 3.0, 3.1 and 3.2 import extracts descriptive operations from JSON or YAML. The importer does not follow references, request servers or automatically enroll targets. Shape capture samples the first array item.
- Evidence is from Chromium in a fixed viewport. Screenshot differences are supplementary and can reflect different navigation outcomes.
- Workflows use same-origin paths and `data-testid` selectors. Business rules support range, equality and sum-of-products checks. External screenshots are opt-in.
- Verified minimization establishes a single-removal minimum. Interactions can hide another smaller subset. Flake checks use a limited number of fresh trials.
- The repair workflow applies one reviewed pricing patch. Verification covers the original scenario and two baseline workflows. Ollama output requires a local model and remains unverified.
- A failing baseline or a scenario that fails to reach its mutation can produce an inconclusive run. The CLI assigns unavailable and inconclusive evidence its own exit code.
- The benchmark is synthetic and curated. Its results cannot establish production accuracy. The risk score is a deterministic policy applied to test evidence.
- External Chromium tests used a controlled HTTPS response transport. Live testing requires an eligible site, proof hosted by its owner and Chromium sandbox support on the runner. Docker runtime and hosted GitHub Actions verification depend on those environments.
