import { text, timestamp } from "drizzle-orm/pg-core";

export const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7());

export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
