// Runs against the build: `npm run build && npm test`.
import assert from "node:assert/strict"
import test from "node:test"
import { assemble, flowGraph, layerOf, nextSteps, parseSource } from "../dist/index.js"

const build = (source) => {
  const { steps, diagnostics } = parseSource("a.ts", source)
  return assemble("/", steps, diagnostics, {})
}
const codes = (index) => index.diagnostics.map((d) => d.code).sort()

const ORDERS = `
// [POST: /orders flow-1] Entry
// [POST: /orders flow-1 fail:400] Invalid body
// [POST: /orders flow-2 db:orders:read] Loads the cart
// [POST: /orders flow-3 branch] By payment method
// [POST: /orders flow-4 case:card api:stripe] Charges the card
// [POST: /orders flow-4 case:card fail:200] Soft skip: card declined
// [POST: /orders flow-5 case:card db:payments:create] Records the charge
// [POST: /orders flow-4 case:bank] Queues a transfer
// [POST: /orders flow-6] Responds
`

test("tags parse into typed fields", () => {
  const { steps, diagnostics } = parseSource("a.ts", ORDERS)
  assert.equal(diagnostics.length, 0)
  assert.deepEqual(
    steps.map((s) => [s.order, s.kind, s.case ?? null]),
    [
      [1, "step", null],
      [1, "fail", null],
      [2, "db", null],
      [3, "branch", null],
      [4, "api", "card"],
      [4, "fail", "card"],
      [5, "db", "card"],
      [4, "step", "bank"],
      [6, "step", null],
    ],
  )
  assert.equal(steps[1].status, 400)
  assert.equal(steps[2].table, "orders")
  assert.equal(steps[2].op, "read")
  assert.equal(steps[4].service, "stripe")
})

test("a valid branching flow has no diagnostics and the right edges", () => {
  const index = build(ORDERS)
  assert.deepEqual(index.diagnostics, [])
  const flow = index.flows[0]
  const next = (order, kase, kind) =>
    nextSteps(
      flow,
      flow.steps.find((s) => s.order === order && s.case === kase && (kind ? s.kind === kind : s.kind !== "fail")),
    ).map((s) => `${s.order}${s.case ? `:${s.case}` : ""}${s.kind === "fail" ? "!" : ""}`)
  assert.deepEqual(next(1), ["2", "1!"])
  assert.deepEqual(next(3), ["4:bank", "4:card"])
  assert.deepEqual(next(4, "card"), ["5:card", "4:card!"])
  assert.deepEqual(next(5, "card"), ["6"])
  assert.deepEqual(next(4, "bank"), ["6"])
  assert.deepEqual(next(1, undefined, "fail"), [])
})

test("bad tags are malformed, not dropped silently", () => {
  for (const bad of ["db:users", "db:users:select", "fail:oops", "branch case:x", "api:a db:b:read", "wat"]) {
    const { steps, diagnostics } = parseSource("a.ts", `// [GET: /x flow-1 ${bad}] d`)
    assert.equal(steps.length, 0, bad)
    assert.equal(diagnostics[0]?.code, "malformed", bad)
  }
})

test("structural errors", () => {
  assert.deepEqual(
    codes(
      build(`
// [GET: /x flow-1] a
// [GET: /x flow-2 case:a] b
`),
    ),
    ["orphan-case"],
  )
  assert.deepEqual(
    codes(
      build(`
// [GET: /x flow-1 branch] a
// [GET: /x flow-2] b
`),
    ),
    ["empty-branch"],
  )
  assert.deepEqual(
    codes(
      build(`
// [GET: /x flow-1] a
// [GET: /x flow-2] b
// [GET: /x flow-3 fail] c
`),
    ),
    ["dangling-fail"],
  )
  assert.deepEqual(
    codes(
      build(`
// [GET: /x flow-1 branch] a
// [GET: /x flow-2 case:a] b
// [GET: /x flow-2] c
`),
    ),
    ["duplicate"],
  )
  assert.deepEqual(
    codes(
      build(`
// [GET: /x flow-1 branch] a
// [GET: /x flow-2 case:a] b
// [GET: /x flow-3 case:b] c
`),
    ),
    ["gap"],
  )
})

test("SKILL.md examples are valid", async () => {
  const { readFile } = await import("node:fs/promises")
  const md = await readFile(new URL("../../../skills/kanrai-annotate/SKILL.md", import.meta.url), "utf8")
  const blocks = [...md.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1])
  assert.ok(blocks.length >= 2)
  // Each block on its own; most are fragments of a flow, so no-entry and gaps
  // before the first shown step are expected.
  for (const block of blocks) {
    const index = build(block)
    const real = index.diagnostics.filter((d) => !["no-entry", "gap", "orphan"].includes(d.code))
    assert.deepEqual(real, [], block)
  }
  const events = build(blocks.find((b) => b.includes("/api/events flow-2 branch"))).flows[0]
  const branch = events.steps.find((s) => s.kind === "branch")
  assert.deepEqual(
    nextSteps(events, branch)
      .map((s) => s.case)
      .sort(),
    ["coupon", "default", "notice"],
  )
  const login = build(blocks.at(-1))
  assert.deepEqual(login.diagnostics, [])
})

test("gaps become placeholder nodes that keep the graph connected", () => {
  const index = build(`
// [GET: /x flow-1] a
// [GET: /x flow-2] b
// [GET: /x flow-4 branch] d
// [GET: /x flow-5 case:a] e
// [GET: /x flow-7 case:a] g
// [GET: /x flow-5 case:b] e2
// [GET: /x flow-8] h
`)
  const { missing, edges } = flowGraph(index.flows[0])
  const short = (k) => (k.startsWith("missing:") ? k : `L${k.split(":")[1]}`)
  assert.deepEqual(missing.map((m) => m.key).sort(), ["missing::3", "missing:a:6"])
  const pairs = edges.map((e) => `${short(e.from)}>${short(e.to)}`)
  for (const expected of ["L3>missing::3", "missing::3>L4", "L5>missing:a:6", "missing:a:6>L6", "L6>L8", "L7>L8"]) {
    assert.ok(pairs.includes(expected), `${expected} in ${pairs}`)
  }
})

test("layer comes from file name, then nearest folder", () => {
  const cases = {
    "src/users/users.controller.ts": "route", // NestJS
    "src/users/users.service.ts": "service",
    "src/users/users.repository.ts": "repository",
    "src/routes/users/index.ts": "route", // Fastify autoload
    "src/routes.ts": "route", // Express
    "src/controllers/user-controller.ts": "route",
    "src/modules/userService.ts": "service",
    "src/services/helpers/format.ts": "service",
    "src/repositories/order_repo.ts": "repository",
    "src/routes/services-status.ts": "route", // file token "status" misses, folder wins
    "src/lib/auth.ts": undefined,
    "src/index.ts": undefined, // Hono inline app — unknown, not guessed
    "shop/views.py": "route", // Django / DRF
    "shop/api/viewsets.py": "route",
    "app/api/v1/endpoints/users.py": "route", // FastAPI template
    "app/crud.py": "repository",
    "shop/managers.py": "repository",
    "shop/selectors.py": "service",
    "shop/models.py": undefined,
    "app/core/session_manager.py": undefined,
  }
  for (const [path, layer] of Object.entries(cases)) assert.equal(layerOf(path), layer, path)
  assert.equal(parseSource("src/services/a.ts", "// [GET: /x flow-1] Hi").steps[0].layer, "service")
  assert.equal("layer" in parseSource("a.ts", "// [GET: /x flow-1] Hi").steps[0], false)
})

test("flow-0 client calls: many allowed, all lead to flow-1", () => {
  const index = build(`
// [GET: /api/users/:id flow-0] Loads the profile page
// [GET: /api/users/:id flow-0] Loads the admin user view
// [GET: /api/users/:id flow-1] Returns a user
// [GET: /api/users/:id flow-2] Responds 200 with the user
`)
  assert.deepEqual(codes(index), [])
  const flow = index.flows[0]
  for (const caller of flow.steps.filter((s) => s.order === 0)) {
    assert.deepEqual(
      nextSteps(flow, caller).map((s) => s.order),
      [1],
    )
  }
  assert.deepEqual(flowGraph(flow).missing, [])
})

test("flow-0 rejects tags and warns when no backend flow exists", () => {
  assert.equal(parseSource("a.ts", "// [GET: /x flow-0 fail:400] d").diagnostics[0].code, "malformed")
  const index = build("// [GET: /nope flow-0] Calls a missing endpoint")
  assert.deepEqual(codes(index), ["no-entry"])
  assert.equal(index.diagnostics[0].severity, "warning")
})
