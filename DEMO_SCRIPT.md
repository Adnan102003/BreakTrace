# BreakTrace three-minute demo

## Before recording

Use the production dashboard at `http://127.0.0.1:4311` after running `npm run build` and `npm start`. Confirm Chromium is installed. Run a clean demo rehearsal so the dashboard has an earlier completed experiment available if a new run is still processing during the demo.

| Time | On screen | What to say |
| --- | --- | --- |
| 0:00–0:25 | **Overview**, click **Run demo experiment**. | “An API can return HTTP 200 and still break checkout. BreakTrace reruns the same browser workflow while changing only selected responses. This example renames a price field and makes two harmless changes.” |
| 0:25–0:55 | Click **Inspect evidence**. Point to the checkout rule and screenshots. | “Checkout rendered a zero total. The independent quote stayed at 8,640 cents. The browser completed the flow, and the business rule detected the discrepancy.” |
| 0:55–1:20 | Open **Experiments** and then **Dependency graph**. Select a response field. | “The verified subset contains only the price rename. Each candidate was replayed in a fresh context. The graph connects the observed request, its response fields and the workflow evidence.” |
| 1:20–1:45 | Open **Regression tests** and download the Playwright spec. | “The export preserves the workflow, scenario seed and selected mutation. It can replay the same failure as a browser assertion.” |
| 1:45–2:20 | Open **Repair verification**, approve the reviewed patch and run verification. Show the checks when ready. | “The runner verifies the reviewed change in an isolated copy. It reproduces the original failure, reruns the scenario with the patch, checks both baseline workflows, and confirms that the original source stayed intact.” |
| 2:20–2:45 | Open **Deployment risk**, show BLOCK and download the JSON report. | “This run scored 80 under the default policy. The CLI returns exit 1 for this report and exit 0 for the verified resilient run. The HTML and PDF contain the same recorded evidence.” |
| 2:45–3:00 | Show the benchmark table. | “The storefront benchmark matched 30 cases. A second Room Board application matched four, including both rule failures. BreakTrace also supports OpenAPI imports and scoped workflow recording for approved targets.” |

If repair verification is still in progress at 2:20, keep the run visible and show the completed checks from the rehearsed run. Use the same scenario and distinguish the completed run from the active one.
