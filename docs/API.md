# Control plane API

Base URL `http://127.0.0.1:4311/api`. Use JSON for writes. The development dashboard proxies the API and Socket.IO through Vite.

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
| GET /runs/:id/report                | Machine-readable report attachment                                                                                                                                            |
| GET /runs/:id/artifact/:name        | A whitelisted screenshot or diff                                                                                                                                              |
| GET /runs/:id/test                  | Playwright TypeScript. Add `?download=1` for an attachment                                                                                                                    |
| GET /runs/:id/analysis              | Deterministic recommendation and reviewed repair eligibility                                                                                                                  |
| POST /runs/:id/analysis             | Optional unverified local Ollama suggestion                                                                                                                                   |
| POST /runs/:id/repair               | Queue the reviewed pricing patch after `{ "approved": true }`                                                                                                                 |
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
