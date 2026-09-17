import { integer, pgEnum, pgTable, primaryKey, serial, text, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "user"]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    role: roleEnum("role"),
    handle: text("handle").notNull(),
    tenantId: integer("tenant_id").notNull(),
  },
  (t) => [uniqueIndex("tenant_handle").on(t.tenantId, t.handle)],
);

export const memberships = pgTable(
  "memberships",
  { userId: integer("user_id").notNull(), teamId: integer("team_id").notNull() },
  (t) => [primaryKey({ columns: [t.userId, t.teamId] })],
);
