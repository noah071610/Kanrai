// Runs against the build: `npm run build && npm test`.
import assert from "node:assert/strict"
import { rm, writeFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { DEFAULT_CONFIG, readDbSchema } from "@kanrai/core"
import { scanDb } from "../dist/index.js"

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

async function read(name) {
  const root = fixture(name)
  try {
    const schema = await scanDb(root, DEFAULT_CONFIG)
    const table = (n) => schema.tables.find((t) => t.name === n)
    const col = (t, c) => table(t).columns.find((x) => x.name === c)
    return { schema, table, col }
  } finally {
    await rm(path.join(root, ".kanrai"), { recursive: true, force: true })
  }
}

test("prisma", async () => {
  const { schema, table, col } = await read("prisma")
  assert.deepEqual(
    schema.tables.map((t) => t.name),
    ["Membership", "Post", "users"],
  )
  assert.equal(table("users").model, "User")
  assert.equal(table("users").line, 6)
  assert.deepEqual(col("users", "email_address"), {
    name: "email_address",
    type: "String",
    nullable: false,
    unique: true,
    primary: false,
  })
  assert.deepEqual(col("users", "role").enumValues, ["ADMIN", "USER"])
  assert.equal(col("users", "role").nullable, true)
  assert.equal(col("Post", "author"), undefined, "relation fields are not columns")
  assert.deepEqual(table("Post").uniques, [["authorId", "slug"]])
  assert.deepEqual(table("Membership").uniques, [["userId", "teamId"]])
  assert.equal(col("Membership", "teamId").primary, true)
})

test("drizzle", async () => {
  const { schema, table, col } = await read("drizzle")
  assert.deepEqual(
    schema.tables.map((t) => t.name),
    ["memberships", "users"],
  )
  assert.equal(table("users").line, 5)
  assert.deepEqual(col("users", "email"), {
    name: "email",
    type: "varchar(255)",
    nullable: false,
    unique: true,
    primary: false,
  })
  assert.deepEqual(col("users", "role").enumValues, ["admin", "user"])
  assert.deepEqual(table("users").uniques, [["tenant_id", "handle"]])
  assert.equal(col("memberships", "team_id").primary, true)
  // A schema file that throws on import is reported; the rest still loads.
  assert.equal(schema.diagnostics.length, 1)
  assert.equal(schema.diagnostics[0].filePath, "src/db/broken.ts")
})

test("typeorm", async () => {
  const { schema, table, col } = await read("typeorm")
  assert.deepEqual(
    schema.tables.map((t) => t.name),
    ["audit_log", "user_profile"],
  )
  assert.deepEqual(
    table("user_profile").columns.map((c) => c.name),
    ["id", "createdAt", "email_address", "role", "handle", "tenant"],
  )
  assert.equal(col("user_profile", "id").type, "uuid", "inherited from the base class")
  assert.deepEqual(col("user_profile", "role").enumValues, ["admin", "user"])
  assert.equal(col("user_profile", "role").nullable, true)
  assert.equal(col("user_profile", "tenant").unique, true)
  assert.deepEqual(table("user_profile").uniques, [["tenant", "handle"]])
  assert.equal(col("audit_log", "id").type, "int")
})

test("sequelize", async () => {
  const { schema, table, col } = await read("sequelize")
  assert.deepEqual(
    schema.tables.map((t) => t.name),
    ["category", "Tag", "Users"],
  )
  assert.deepEqual(
    table("Users").columns.map((c) => c.name),
    ["id", "email", "role", "tenant_id", "handle", "createdAt", "updatedAt", "deletedAt"],
  )
  assert.deepEqual(col("Users", "role").enumValues, ["admin", "user"])
  assert.equal(col("Users", "email").nullable, false)
  assert.deepEqual(table("Users").uniques, [["tenant_id", "handle"]])
  assert.equal(col("category", "code").primary, true)
  assert.equal(col("category", "createdAt"), undefined)
  assert.deepEqual(col("Tag", "label"), {
    name: "label",
    type: "STRING",
    nullable: false,
    unique: true,
    primary: false,
  })
})

test("a failed read keeps the last good tables", async () => {
  const root = fixture("prisma")
  const broken = path.join(root, "prisma/schema/broken.prisma")
  try {
    const good = await scanDb(root, DEFAULT_CONFIG)
    await writeFile(broken, "model Oops {")
    const after = await scanDb(root, DEFAULT_CONFIG)
    assert.deepEqual(after.tables, good.tables)
    assert.equal(after.diagnostics[0].code, "db-parse")
    assert.deepEqual((await readDbSchema(root, DEFAULT_CONFIG)).tables, good.tables)
  } finally {
    await rm(broken, { force: true })
    await rm(path.join(root, ".kanrai"), { recursive: true, force: true })
  }
})

test("no ORM, no db.json", async () => {
  const root = fixture("..")
  assert.equal(await scanDb(root, DEFAULT_CONFIG), null)
  assert.equal(await readDbSchema(root, DEFAULT_CONFIG), null)
})

test("an ORM that yields no tables is treated as no DB", async () => {
  // typeorm fixture forced to read as prisma: detected, nothing to read.
  const root = fixture("typeorm")
  try {
    const schema = await scanDb(root, { ...DEFAULT_CONFIG, db: "prisma" })
    assert.equal(schema.tables.length, 0)
    assert.equal(await readDbSchema(root, DEFAULT_CONFIG), null, "no db.json written")
  } finally {
    await rm(path.join(root, ".kanrai"), { recursive: true, force: true })
  }
})

test("django", async () => {
  const { schema, table, col } = await read("django")
  assert.equal(schema.orm, "django", "django-environ alone would not count; Django does")
  assert.deepEqual(
    schema.tables.map((t) => t.name),
    ["accounts_staff", "accounts_user", "orders"],
    "abstract and proxy models are not tables",
  )
  assert.equal(table("accounts_user").model, "User")
  assert.equal(table("accounts_user").line, 11)
  assert.deepEqual(
    table("accounts_user").columns.map((c) => c.name),
    ["id", "created_at", "email", "role", "nick"],
  )
  assert.deepEqual(col("accounts_user", "id"), {
    name: "id",
    type: "BigAutoField",
    nullable: false,
    unique: true,
    primary: true,
  })
  assert.deepEqual(col("accounts_user", "role").enumValues, ["admin", "user"])
  assert.equal(col("accounts_user", "role").nullable, true)
  // Multi-table inheritance: the child keeps only its own columns plus the parent link.
  assert.deepEqual(
    table("accounts_staff").columns.map((c) => c.name),
    ["user_ptr_id", "badge"],
  )
  assert.equal(col("orders", "code").primary, true)
  assert.equal(col("orders", "user_id").type, "ForeignKey(accounts.User)")
  assert.deepEqual(col("orders", "status").enumValues, ["new", "paid"])
  assert.equal(col("orders", "tags"), undefined, "ManyToMany is not a column")
  assert.deepEqual(table("orders").uniques, [["tenant", "user_id"]])
})

test("sqlalchemy", async () => {
  const { schema, table, col } = await read("sqlalchemy")
  assert.equal(schema.orm, "sqlalchemy")
  assert.deepEqual(
    schema.tables.map((t) => t.name),
    ["audit_log", "memberships", "users"],
  )
  assert.deepEqual(
    table("users").columns.map((c) => c.name),
    ["created_at", "id", "email_address", "nickname", "bio", "role", "tenant_id", "handle"],
  )
  assert.deepEqual(col("users", "email_address"), {
    name: "email_address",
    type: "String(255)",
    nullable: false,
    unique: true,
    primary: false,
  })
  assert.equal(col("users", "nickname").nullable, true, "Mapped[Optional[str]]")
  assert.equal(col("users", "bio").nullable, false, "explicit nullable wins over the annotation")
  assert.equal(col("users", "handle").nullable, true, "legacy Column() defaults to nullable")
  assert.deepEqual(col("users", "role").enumValues, ["admin", "user"], "SQLAlchemy stores member names")
  assert.deepEqual(table("users").uniques, [["tenant_id", "handle"]])
  assert.deepEqual(table("memberships").uniques, [["user_id", "team_id"]])
  assert.equal(col("audit_log", "id").primary, true)
  // A file Python cannot parse is reported; the rest still loads.
  assert.equal(schema.diagnostics.length, 1)
  assert.equal(schema.diagnostics[0].filePath, "app/broken.py")
})

test("sqlmodel", async () => {
  const { schema, table, col } = await read("sqlmodel")
  assert.equal(schema.orm, "sqlmodel", "sqlmodel wins over the sqlalchemy it pulls in")
  assert.deepEqual(
    schema.tables.map((t) => t.name),
    ["hero", "teams"],
    "only table=True classes",
  )
  assert.deepEqual(
    table("hero").columns.map((c) => c.name),
    ["name", "secret_name", "age", "id", "power", "bio"],
  )
  assert.deepEqual(col("hero", "id"), { name: "id", type: "int", nullable: false, unique: true, primary: true })
  assert.equal(col("hero", "age").nullable, true)
  assert.equal(col("hero", "secret_name").unique, true)
  assert.deepEqual(col("hero", "power").enumValues, ["fly", "swim"])
  assert.deepEqual(col("hero", "bio"), { name: "bio", type: "Text", nullable: true, unique: false, primary: false })
  assert.equal(table("teams").model, "Team")
})
