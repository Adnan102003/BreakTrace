# Five-minute BreakTrace demo

1. Start the dashboard and run **Baseline only** against **Cart to checkout**. The cart has two $48.00 Field Packs, a $9.60 discount, and an $86.40 independent checkout quote.
2. Run **Price rename with unrelated changes** against the original project. The product returns HTTP 200 with `productPrice` in place of `price`. The original browser code accepts the response and falls back to zero. Checkout still completes, while the price and cart-vs-quote rules fail.
3. Inspect the baseline and mutation screenshots and the issue log. The API explorer shows a number-valued `productPrice` in the mutated response shape. The graph ties requests to the pages that initiated them and annotates inferred associations with findings.
4. Open **Experiment history**. The control and the independent reproductions identify mutation #2. Try the **Optional product badge omitted** scenario as a negative control.
5. Export the generated Playwright spec to `tests/generated/`. Run `npm run test:generated` to observe the failing expectation. On PowerShell, set `$env:BREAKTRACE_RESILIENT='1'` and run the same command again. In a POSIX shell, use `BREAKTRACE_RESILIENT=1 npm run test:generated`. Select the specific spec by passing its filename filter if the directory contains other tests.
6. Use **Repair verification** to explicitly approve the reviewed patch. Inspect the original failure rerun, patched rerun, both baseline workflows and source preservation check.
7. Export the failed run from **Deployment risk** and run `npm run gate -- <report.json>`. The default policy exits with 1 for this scenario. Run the resilient project and export its report to try the passing gate.

The storefront runs mock payments against synthetic fixtures. Run `npm run demo` to click through it separately.
