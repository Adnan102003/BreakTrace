# BreakTrace interview guide

## Why BreakTrace exists

A backend contract change can break only one part of a frontend workflow. A response can return HTTP 200 and a checkout can complete while the UI calculates the wrong amount. BreakTrace measures those effects at the browser and uses controlled follow-up experiments to identify the input responsible.

## System walkthrough

React uses TanStack Query for API state and invalidates run queries after a Socket.IO update. Express validates configuration and snapshots the chosen project, workflow, scenario and thresholds into a queued run. A single runner reuses Chromium and gives each trial its own browser context. The demo server supplies synthetic response fixtures. Interception forwards each allowed request to the loopback fixture and can fulfill the browser with an altered response. The original fixture values stay intact.

Evidence contains path and method, response status, network timing, shape metadata, page location, outcomes and screenshots. The project was evaluated in Chromium. The dependency graph records that a page requested an endpoint and that the response contained a field. Mutation-to-finding links are labeled as inferred because the graph has no JavaScript read tracing.

## How the distinctive parts work

- **Response mutation.** Change a response field, data type, status or transport behavior during a browser replay. The seeded numeric operator derives its value from the seed and the original mutation index, so subset trials retain the same value.
- **Business rules.** Declarative operators compare DOM text, numeric attributes, API values and independent literals. Separate cart and quote calculations expose the silent pricing error. Required arithmetic operands fail when absent, and explicit JSON null remains distinguishable from a missing value.
- **Minimization.** Verify a clean control and reproduce the normalized finding signature twice with the full set. Try chunks and complements, keeping a subset only after repeat success. At the finest granularity, test individual removals. Two fresh confirmations support the final subset. The default budget is 24 trials, compared with up to 256 combinations for the maximum eight mutations. A matching result establishes a tested single-removal minimum. Interactions can hide a smaller solution, and unstable or exhausted trials get a separate status.
- **Repair.** A reviewed pricing change is copied into an isolated Fieldwork fixture after approval. External static repair checks a bounded before/after snapshot of operator-approved files. Both compare the original signature, the patched scenario, baseline workflows, and the original source contents.
- **Persistence.** The JSON adapter atomically replaces snapshots and retries transient Windows file locks. MongoDB mode indexes run identity and start time. Both keep artifacts on disk. Startup marks interrupted in-process runs explicitly. A multi-operator design would need leased jobs, per-project quotas and controlled artifact access.

## Decisions to explain

| Decision | Reason and limitation |
| --- | --- |
| Intercept responses at the browser | Observe the rendered application and keep the authorized upstream flow read-only. The selected workflows and recorded operations bound coverage. |
| Compare structured findings across fresh contexts | Remove shared browser state and require the same signature before attributing a result to a mutation. Repetition reduces flaky attribution, with real browser time as the cost. |
| Keep business rules declarative | Operators and bounded sources support validation and review. Specialized assertions may need an explicit addition to the rule language. |
| Keep the release single-operator | Workspace authentication and a private tunnel preserve the local trust model. User accounts and project-level authorization would need a separate design. |
| Report deterministic deployment risk | Weighted evidence and thresholds are inspectable. The score expresses the configured policy for recorded coverage. Incident forecasts remain out of scope. |

## Evaluation story

Start with the Fieldwork checkout returning HTTP 200 and displaying 0 cents against a quote of 8,640. Explain how the price rename remained after removing unrelated mutations. Then compare the full results with the differently structured Room Board fixture. Fieldwork matched 20 failing cases and 10 controls. Room Board matched two failures and two controls. The fixture labels, generated tests and run summaries are available with the benchmark. Avoid treating the curated results as a production accuracy estimate. [Benchmark evidence](../BENCHMARK_RESULTS.md)

## Interview questions

| Question                                                       | Answer                                                                                                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Why bother with a baseline?                                    | A failing baseline makes causal attribution ambiguous. Mark that execution inconclusive.                                                                  |
| How can one missing field be isolated among unrelated changes? | Reduce the mutation set while requiring the same finding signature, then rerun the remaining subset in fresh contexts.                                    |
| What happens with interacting mutations?                       | A subset that produces a different finding is rejected. Interacting mutations stay together when they are required to reproduce the same signature.       |
| Why no unrestricted rule scripts?                              | Fixed operators make the rule language predictable and keep workflow configuration declarative.                                                           |
| How does it protect external testing?                          | Require an operator allowlist and a proof file, pin public HTTPS DNS answers, validate TLS, forward approved reads only and run external Chromium behind a deny proxy. |
| What would you scale first?                                    | Profile browser execution and the subset-trial count, then lease runs from a queue to isolated workers with per-project quotas and persistent provenance. |
| Can the score predict a future incident?                       | It expresses coverage and observed severity under a named policy. Synthetic measurements cannot validate a production probability.                        |

Use the [three-minute demo](../DEMO_SCRIPT.md) to rehearse the browser walkthrough. Review [limitations](../LIMITATIONS.md) and [release verification](../RELEASE_STATUS.md) before discussing deployment or hosted integrations.
