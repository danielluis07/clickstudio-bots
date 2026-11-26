import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import type { Database } from "@/db/database";
import { member, organization, user } from "@/db/schema";
import { createMemberTour, resolveTenantScope } from "@/modules/tenancy";
import { createTestClock } from "@/test/support/clock";
import { closeTestDatabase, createTestDatabase } from "@/test/support/database";

let db: Database;
const clock = createTestClock(new Date("2026-11-26T12:00:00Z"));
const migration = readFileSync(
  `${import.meta.dir}/../../drizzle/20261126105906_member_tour/migration.sql`,
  "utf8",
);
// The fully migrated harness already has the column: take it away and run
// the migration over Members who exist at release.
const migrateTour = () =>
  db.transaction(async (tx) => {
    await tx.execute(sql`alter table member drop column tour_seen_at`);
    for (const statement of migration.split("--> statement-breakpoint"))
      await tx.execute(sql.raw(statement));
  });

const tourOf = async (userId: string) =>
  createMemberTour({ db, clock }, (await resolveTenantScope(db, { userId }))!);

beforeEach(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([
    { id: "owner", name: "Owner", email: "owner@example.com" },
    { id: "attendant", name: "Attendant", email: "attendant@example.com" },
    { id: "newcomer", name: "Newcomer", email: "newcomer@example.com" },
  ]);
  await db.insert(organization).values({ id: "tenant", name: "Tenant", slug: "tenant" });
  await db.insert(member).values([
    { organizationId: "tenant", userId: "owner", role: "owner" },
    { organizationId: "tenant", userId: "attendant", role: "member" },
  ]);
});

afterEach(() => closeTestDatabase(db));

test("Members who exist at release have seen the Tour, and those who join later have not", async () => {
  expect(await (await tourOf("owner")).seen()).toBe(false);

  await migrateTour();

  expect(await (await tourOf("owner")).seen()).toBe(true);
  expect(await (await tourOf("attendant")).seen()).toBe(true);
  await db.insert(member).values({ organizationId: "tenant", userId: "newcomer", role: "member" });
  expect(await (await tourOf("newcomer")).seen()).toBe(false);
});
