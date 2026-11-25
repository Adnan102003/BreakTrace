# Control plane API

Base URL `http://127.0.0.1:4311/api`. Use JSON for writes. The development dashboard proxies the API and Socket.IO through Vite.

When `BREAKTRACE_OPERATOR_PASSWORD` is set, send HTTP Basic credentials using username `operator` and the workspace password. The private deployment requires authentication and keeps requests on a loopback SSH tunnel. HTTP and Socket.IO continue to reject foreign Host or browser Origin values.

| Method and path                     | Input and result                                                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /health                         | Local status and storage mode                                                                                                                                                 |
| GET /config                         | Workspace catalog, operation references, authorization status, storage and model availability                                                                                 |
| PUT /projects                       | Upsert `{ id, name, version }` for the demo or `{ kind: "external", id, name, url, endpoints, captureScreenshots? }` for staging                                              |
| POST /projects/:id/challenge        | Issue a proof file and expiry after receiving `{ "staging": true }`                                                                                                           |
| POST /projects/:id/verify           | Verify the staging proof file and store its receipt                                                                                                                           |
| DELETE /projects/:id/authorization  | Revoke the receipt for future runs                                                                                                                                            |
| PUT /workflows                      | Upsert `{ id, name, start, steps }`                                                                                                                                           |
| PUT /scenarios                      | Upsert `{ id, name, seed, mutations }`, up to eight mutations                                                                                                                 |
| POST /openapi                       | Accept an OpenAPI 3.x JSON object or `{ document }` containing JSON or YAML. Optional `projectId` scopes the import. Add `register=1` to register its GET and HEAD operations |
| PUT /settings/gate                  | Update integer `{ warning, block }`, where `warning < block`                                                                                                                  |
| POST /runs                          | Enqueue `{ projectId, workflowId, scenarioId }`. HTTP 202 returns `{ id }`                                                                                                    |
| GET /runs                           | Newest-first summaries                                                                                                                                                        |
| GET /runs/:id                       | Complete run record with evidence                                                                                                                                             |
| GET /runs/:id/report                | Report attachment. Set `format=json`, `format=html` or `format=pdf` |
| GET /runs/:id/artifact/:name        | A whitelisted screenshot or diff                                                                                                                                              |
| GET /runs/:id/test                  | Playwright TypeScript. Add `?download=1` for an attachment                                                                                                                    |
| GET /runs/:id/analysis              | Deterministic recommendation and reviewed repair eligibility                                                                                                                  |
| POST /runs/:id/analysis             | Optional suggestion from the configured Ollama, Gemini or OpenAI provider |
| POST /runs/:id/repair/preview       | Preview bounded replacements in an operator-approved static project |
| POST /runs/:id/repair               | Queue the reviewed patch with `{ "approved": true }`. Include the preview `reviewId` for a static replacement. |
| GET /compare?before=UUID&after=UUID | Compare observed baseline shape snapshots                                                                                                                                     |

The `run:update` event contains `id`, `status`, and `phase`. Fetch the full record over HTTP. Browser clients can poll when the socket disconnects.

## Example scenario

```json
{
  "id": "example-rename",
  "name": "Price field renamed",
  "seed": 42,
  "mutations": [
    {
      "method": "GET",
      "endpoint": "/api/store/product/field-pack",
      "operator": "rename",
      "path": "price",
      "to": "productPrice"
    }
  ]
}
```

Field operators include `remove`, `rename`, `null`, `type`, `empty-array`, `number`, `negative`, and `replace`. Dotted paths support array indices. Response operators are `empty`, `status`, `delay`, `timeout`, and `malformed`. Supported status values are 400, 401, 403, 404, 429, 500 and 503. Combining operators in array order supports simultaneous mutations.

A workflow starts on a same-origin path. Its steps use `navigate`, `click` with an optional expected `path`, `visible`, exact `text`, or a `rules` array. Rule operands are `{ "from": "dom", "key": "test-id" }` and `{ "from": "literal", "value": 42 }`. Set `read` to `text` for a DOM operand that contains a plain number. Workflows and scenarios require `projectId` for external projects. Full examples are in [packages/shared/demo.ts](../packages/shared/demo.ts).

Errors use `{ error: string }`. HTTP 400 marks invalid input, 403 rejects disallowed browser origins, 404 marks missing resources, 409 indicates an unavailable state, and 429 indicates a busy queue.

## V2 operations

| Method and path                    | Input and result                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT /projects`                    | External projects may set `environment` to `local` or `staging`. Existing clients can omit it to infer the setting from the approved origin. |
| `POST /projects/:id/connection`    | Fetch and verify the project’s existing proof again.                                                                                         |
| `DELETE /projects/:id`             | Delete a user-defined project and its configuration with `{ "approved": true }`. Historical runs remain available.                           |
| `PUT /projects/:id/repository`     | Verify and link `{ "repository": "owner/name" }` from the operator’s GitHub allowlist.                                                       |
| `POST /recordings`                 | Start a browser recording with `{ projectId, start }`.                                                                                       |
| `POST /recordings/:id/steps`       | Append `pick`, `fill`, or a declarative `step`. The response contains a masked screenshot and the draft.                                     |
| `POST /recordings/:id/replay`      | Replay an edited workflow in a new browser context. Save the validated draft with `PUT /workflows`.                                          |
| `DELETE /recordings/:id`           | Close the browser session.                                                                                                                   |
| `GET /runs?projectId=SLUG`         | Scope run history to a project. An identical active submission reuses the existing run ID.                                                   |
| `GET /runs/:id/report?format=html` | Download the evidence report. `pdf` and `json` are also supported. JSON remains the default.                                                 |
| `GET /runs/:id/drafts/:kind`       | Render `issue`, `pull-request` or `workflow`. Add `download=1` to download the draft.                                                        |
| `POST /runs/:id/analysis`          | Select `{ provider }` from `ollama`, `gemini` or `openai` when configured.                                                                   |
| `POST /runs/:id/repair/preview`    | Review `{ changes: [{ path, content }] }` for an operator-approved static directory.                                                         |
| `POST /runs/:id/repair`            | Verify a static patch with `{ "approved": true, "reviewId": "…" }`. The demo patch only requires `approved`.                                 |

`fill` steps store the input variable name and never persist the recorder’s typed value. API rule operands use `{ "from": "api", "method": "GET", "endpoint": "/items/{id}", "path": "item.total" }`. Rules can compare operands, check bounds or types, require a value, or compute a sum of products with an optional deduction.
