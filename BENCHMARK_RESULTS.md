# Synthetic benchmark results

## v1.0.0 release rerun

On Windows with Node 24.11.1 and Chromium, Fieldwork detected all 20 labeled failures and passed all 10 controls, with zero missed, false-positive, or indeterminate cases. All 20 expected isolation results matched. The 20 generated specs reproduced the original failures and both reviewed repair specs passed. The mean case execution time was 4,945 ms. [Fieldwork release summary](docs/evidence/release-1.0.0-fieldwork.json)

Room Board matched all four labels. The baseline and harmless room-label removal passed. The renamed capacity and negative reservation cases failed and each isolated to mutation index 0. [Room Board release summary](docs/evidence/release-1.0.0-rooms.json)

These curated scenarios measure the tested workflows and fixtures. The results below document earlier rounds.

Collected on November 25, 2026 in Asia/Colombo. The local run used Windows 11 build 26300, Node.js 24.11.1 and Playwright 1.65.1 with Chromium 159.0.8154.6.

| Measure                                          |     Observed |
| ------------------------------------------------ | -----------: |
| Total executed                                   |           30 |
| True positives / false negatives                 |       20 / 0 |
| True negatives / false positives                 |       10 / 0 |
| Missed failures / indeterminate runs             |        0 / 0 |
| Precision                                        | 100% (20/20) |
| Recall                                           | 100% (20/20) |
| False-positive rate                              |    0% (0/10) |
| Correct independently verified isolation         |        20/20 |
| Mean execution time                              |     4,769 ms |
| Generated specs reproducing the expected failure |        20/20 |
| Generated specs passing with the reviewed repair | 2/2 eligible |
| Reviewed repair verifications passed             | 2/2 eligible |

## Method

The [fixture definitions](scripts/benchmark-cases.ts) specify 20 intentionally failing cases, 10 controls, and the expected isolated mutation indices for positives. A true positive requires a clean baseline and new findings in the variant. The minimization result must be `verified` and match the labeled indices. Mean time includes startup, baseline, mutation and any isolation trials. It excludes repair tests and the separate generated-spec executions.

Each detected failure produced a Playwright spec that was run against the original storefront. The generated suite had the expected exit code 1 because the specs exposed deliberate fixture failures. The two pricing-rename specs were rerun against the reviewed repair and passed with exit code 0. Repair verification also reran each full original mutation set, both baseline workflows and the source-preservation check.

## Reproduce

```sh
npm ci
npx playwright install chromium
npm run benchmark -- .data/reproduced-benchmark
```

The benchmark writes raw per-scenario browser measurements, generated Playwright JSON reports, repair artifacts, and a machine-readable summary. It returns zero when the observed outcomes match the labeled expectations.

- [Raw browser and experiment records](docs/evidence/measurements.json)
- [Per-spec Playwright outcomes](docs/evidence/generated-results.json)
- [Machine-readable summary](docs/evidence/summary.json)

These curated synthetic fixtures evaluate the included workflows on the measured machine. The results do not establish real-world production accuracy, performance, or incident probability.

## Phase 2 demo rerun

The Phase 2 rerun executed the same 30 fixtures on November 25, 2026 in Asia/Colombo. It detected all 20 injected failures, passed all 10 controls, and isolated the labeled mutation set in all 20 failing cases. All 20 generated specs reproduced the original failure. Both eligible generated specs and both repair verifications passed with the reviewed patch. The observed mean was 2,730 ms. The two timing measurements came from separate local runs without a controlled performance comparison. [Phase 2 summary](docs/evidence/phase2-summary.json)

Run `npm run benchmark -- .data/phase2-benchmark` to reproduce the rerun. The workspace output contains the raw browser, trial and Playwright reports. The staging integration tests use a separate synthetic response transport.

## V2 Fieldwork rerun

On November 25, 2026, the original 30-case fixture suite detected 20 of 20 labeled failures and passed all 10 controls. The labeled subset matched all 20 verified isolations. All 20 generated specs exposed their expected failure, and both eligible specs passed after repair. Both full repair verifications passed. Mean execution time was 2,554 ms on this local run. [V2 Fieldwork summary](docs/evidence/v2-fieldwork-summary.json)

## V2 Room Board evaluation

Room Board is a separate scheduling fixture served over an approved loopback origin. Its workflow reads room availability and compares the rendered seat count with API fields and an independent reference. The four labeled cases ran in Chromium on November 25, 2026. [Room Board results](docs/evidence/v2-room-board-summary.json)

| Case                              | Observed          | Verified isolated mutation indices |
| --------------------------------- | ----------------- | ---------------------------------- |
| Baseline                          | Passed            | —                                  |
| Capacity field renamed            | Failed four rules | `[0]`                              |
| Reserved seat count made negative | Failed two rules  | `[0]`                              |
| Unused room label removed         | Passed            | —                                  |

Run `npm run benchmark:rooms -- .data/room-board-evaluation` to reproduce. The command writes the summary, each full run and available screenshots. This evaluation measures the named workflows and mutations on the two fixtures.
