# Interview guide

## Why BreakTrace exists

A backend contract change can break only one part of a frontend workflow. A response can return HTTP 200 and a checkout can complete while the UI calculates the wrong amount. BreakTrace measures those effects at the browser and uses controlled follow-up experiments to identify the input responsible.

## System walkthrough

React uses TanStack Query for API state and invalidates run queries after a Socket.IO update. Express validates configuration and snapshots the chosen project, workflow, scenario and thresholds into a queued run. A single runner reuses Chromium and gives each trial its own browser context. The demo server supplies synthetic response fixtures. Interception forwards each allowed request to the loopback fixture and can fulfill the browser with an altered response. The original fixture values stay intact.

Evidence contains path and method, response status, network timing, shape metadata, page location, outcomes and screenshots. For example, a Firefox test could show the same cart error, but this envelope was evaluated only with Chromium. The dependency graph can show that a product page requested an endpoint and that the response contained a field. It cannot observe which JavaScript expression read that field, so mutation-to-finding associations are marked as inferred.

## How the distinctive parts work

- **Response mutation.** Change a response field, data type, status or transport behavior during a browser replay. The seeded numeric operator derives its value from the seed and the original mutation index, so subset trials retain the same value.
- **Business rules.** Named, checked operators interpret numeric values from visible elements or constants. Separate cart and quote calculations make the silent pricing bug observable. A missing number fails the rule.
- **Minimization.** Reproduce the signature twice with the full set and verify a clean control. Try chunks and complements, keeping a subset only after repeat success. At finest granularity the search tests individual removals. Two fresh confirmations support the subset reported as verified. A bounded search can be interrupted by its experiment cap or a flaky reproduction.
- **Repair.** A reviewed pricing change is written to a fresh demo copy after approval. Reruns exercise the full original scenario and both baseline workflows. The original source is compared byte for byte.
- **Persistence.** The local JSON catalog provides stable IDs. Each UUID-named run directory contains a snapshot and related artifacts. Filenames key lookups, and run summaries sort by creation timestamp. A multi-operator store would index project ID, run status and creation date, put binary evidence in object storage, and add schema migrations.

## Interview questions

| Question                                                       | Answer                                                                                                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Why bother with a baseline?                                    | A failing baseline makes causal attribution ambiguous. Mark that execution inconclusive.                                                                  |
| How can one missing field be isolated among unrelated changes? | Reduce the mutation set while requiring the same finding signature, then rerun the remaining subset in fresh contexts.                                    |
| What happens with interacting mutations?                       | A subset that produces a different finding is rejected. Interacting mutations stay together when they are required to reproduce the same signature.       |
| Why no unrestricted rule scripts?                              | Fixed operators make the rule language predictable and keep workflow configuration declarative.                                                           |
| How does it prevent SSRF?                                      | Browser routing pins the exact loopback fixture origin, rejects redirects and blocks WebSockets and service workers. OpenAPI endpoints are descriptive.   |
| What would you scale first?                                    | Profile browser execution and the subset-trial count, then lease runs from a queue to isolated workers with per-project quotas and persistent provenance. |
| Can the score predict a future incident?                       | It expresses coverage and observed severity under a named policy. Synthetic measurements cannot validate a production probability.                        |

See [limitations](../LIMITATIONS.md) for the current scope and [benchmark](../BENCHMARK_RESULTS.md) for the measured evidence.
