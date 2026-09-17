---
name: kanrai-annotate
description: Write, maintain, and read kanrai (apiflow) API flow annotations. Use when tracing HTTP endpoints, changing request-path code or frontend calls to a backend in the same repo, or acting on viewer prompts with flow-N and file:line metadata.
---

# API flow annotations

Source comments drive API diagrams, VS Code next-step jumps, and AI prompts.
Each annotation's file:line is the navigation target. Never edit generated
`flows.json` in the configured `outDir` (default `.kanrai`).

## Write

Trace registration → middleware → handler → callees → response. Annotate actual
behavior; never invent checks, failures, or statuses, or change runtime code to
fit annotations. For edits, trace affected endpoints and shared callers; for
full mappings, enumerate all route registrations.

```text
// [METHOD: /path flow-N] Description
// [METHOD: /path flow-N case:label kind] Description
```

- One annotation per line; use the language's comment marker (`//`, `#`, etc.).
  Keep this spacing. `case:label` and `kind` are optional tag slots.
- Methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.
  Use the identical method + full registered path throughout each flow:
  include router prefixes, preserve parameter syntax (`:id`, `{id}`, etc.),
  omit origin, query, and concrete IDs.
- Every route needs an untagged `flow-1` at its handler describing the API's
  purpose, plus a separate success response step with the actual HTTP status.
  For routes that never succeed, show their real terminal outcome instead.
- After `flow-1`, number meaningful work consecutively in execution order.
  Pre-handler middleware comes immediately after this entry marker: numbering
  describes navigation, not a claim that the handler runs before middleware.
- Existing authentication, authorization, and validation each get a step and
  their failures. Use descriptions starting `Authenticates`, `Requires`, or
  `Validates`; these are not tags. Skip trivial transformations/pass-throughs.
- Place comments immediately above the implementation: function entry for a
  whole-function step, statement for inline work, throw/return for a failure.
  For third-party code, use the local invocation. Never repeat a hop at both
  caller and callee. Shared implementations get one line per route/step/case,
  including failures, using each caller's numbering.
- Descriptions: use the language of the instructing developer, one clause, ≤40
  characters; name the action or failure condition. Put extra detail in
  ordinary comments.

## Tags

At most one kind plus optional `case:<label>`; no other tags. Table, service,
and case names contain no spaces, colons, or brackets.

| Kind | Meaning |
| --- | --- |
| `fail` / `fail:401` | Error or soft skip ending the intended work (including 2xx skips), not a recovered error. Use the actual 3-digit response status only when verified through error handling; otherwise bare `fail`. |
| `branch` | Meaningfully different work selected by a value. A guard with a failure needs no branch. |
| `db:<table>:<op>` | Each DB operation; use the schema's table/model name consistently. Ops: `create`, `read`, `update`, `delete`; upsert = `update`. Multiple tables need separate annotations/numbers. |
| `api:<service>` | Each outbound service call; name the service, not the SDK method. Database access uses `db`. |

- Failures repeat their originating step's number and case, even across files.
  Multiple failures may share them. A fail has no outgoing edge.
- A branch at N has arms starting at N+1, consecutive within each case. Every
  arm step/failure carries `case:<label>`. Regular-step numbers may repeat
  across cases, never within a case or between main-line and case steps.
- Exception: an immediate-exit arm may contain only a fail at N+1 without a
  regular parent. A branch still needs at least one non-fail arm.
- Shared continuation has no case and starts one past the longest arm. Add it
  only if all non-fail arms reach it; successful returns are regular steps.
  Nested branches (`branch case:x`) are unsupported. Describe unrepresentable
  inner control flow instead of drawing false continuation edges.

Numbering example only; place each annotation at its implementation:

```ts
// [POST: /api/events flow-1] Dispatches an event
// [POST: /api/events flow-2 branch] Selects the event category
// [POST: /api/events flow-3 case:notice api:fcm] Sends a push notification
// [POST: /api/events flow-3 case:notice fail:502] Push service rejected the request
// [POST: /api/events flow-4 case:notice db:events:update] Records delivery
// [POST: /api/events flow-3 case:coupon db:coupons:create] Issues a coupon
// [POST: /api/events flow-3 case:default fail:200] Unknown category, ignored
// [POST: /api/events flow-5] Responds 201 with the event id
```

## Client calls: flow-0

Only when the backend handler exists in the same repo: put an untagged `flow-0`
at each distinct request sender (fetcher/API wrapper/query function), not each
consuming component. Resolve base URLs, proxies, and rewrites to the backend's
registered path. Many senders may share flow-0; all lead to flow-1. External
calls and frontend-only repos get none; backend-only flows need none.

## Maintain, read, verify

- Move annotations with code; remove obsolete steps/failures; renumber affected
  flows across files, including cases and shared helpers. Update descriptions,
  tags, and statuses when behavior changes.
- Method/path changes update every matching annotation, including flow-0.
  Handler deletion removes its annotations everywhere; remove deleted senders.
- Viewer prompts: open file:line and verify the code. If stale, search the
  literal `[METHOD: /path flow-` prefix. Follow callers/callees and cases;
  metadata is a navigation hint, not proof. Maintain annotations after edits.
- Run the project's scan command (`kanrai scan --strict`) from its scan root.
  Fix affected annotation diagnostics, including warnings: malformed tags can
  pass strict mode. If unavailable, report that validation was not run.
- Check route coverage and behavior manually: scanning cannot detect wholly
  unannotated routes or prove descriptions, placement, and statuses correct.

## Example: one flow across files

```ts
// web/api.ts
// [POST: /api/auth/login flow-0] Signs in from the login form
export const login = (body) => http.post('/api/auth/login', body)

// controllers/auth.ts
// [POST: /api/auth/login flow-1] Signs a user in
export async function login(req, res) {
  // [POST: /api/auth/login flow-2] Validates email and password
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    // [POST: /api/auth/login flow-2 fail:400] Invalid login input
    return res.status(400).json({ error: 'Invalid login input' })
  }
  const user = await authenticate(parsed.data)
  // [POST: /api/auth/login flow-6] Responds 200 with the user id
  return res.status(200).json({ userId: user.id })
}

// services/auth.ts
// [POST: /api/auth/login flow-3] Authenticates credentials
export async function authenticate({ email, password }) {
  const user = await findByEmail(email)
  if (!user) {
    // [POST: /api/auth/login flow-4 fail] Account not found
    throw new Error('Invalid credentials')
  }
  // [POST: /api/auth/login flow-5] Verifies the password hash
  if (!(await verify(user.hash, password))) {
    // [POST: /api/auth/login flow-5 fail] Password does not match
    throw new Error('Invalid credentials')
  }
  return user
}

// repositories/users.ts
// [POST: /api/auth/login flow-4 db:users:read] Loads the user by email
export const findByEmail = (email) => db.user.findUnique({ where: { email } })
```
