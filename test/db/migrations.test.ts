import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Production tables already hold rows, but the PGlite harness migrates an
// empty database, so a NOT NULL column without a value for existing rows
// passes every other test and fails on deploy. drizzle-kit generates exactly
// that for a new required column; a migration must backfill it instead:
//
//   ALTER TABLE "t" ADD COLUMN "c" text;
//   UPDATE "t" SET "c" = ...;
//   ALTER TABLE "t" ALTER COLUMN "c" SET NOT NULL;

const statementsOf = (sql: string) =>
  sql.split("--> statement-breakpoint").map((statement) => statement.trim());

// Statements that make a column required on a table that may already have
// rows, without giving those rows a value first.
const unbackfilledRequiredColumns = (sql: string) => {
  const statements = statementsOf(sql);
  const created = new Set(
    statements.flatMap((statement) => statement.match(/^CREATE TABLE "([^"]+)"/)?.[1] ?? []),
  );
  const updated = new Set<string>();
  return statements.filter((statement) => {
    const table = statement.match(/^(?:ALTER TABLE|UPDATE) "([^"]+)"/)?.[1];
    if (!table || created.has(table)) return false;
    if (statement.startsWith("UPDATE")) {
      updated.add(table);
      return false;
    }
    const addsRequired = /ADD COLUMN .* NOT NULL/.test(statement) && !/ DEFAULT /.test(statement);
    const requiresExisting =
      /ALTER COLUMN "[^"]+" SET NOT NULL/.test(statement) && !updated.has(table);
    return addsRequired || requiresExisting;
  });
};

const migrations = [...new Bun.Glob("drizzle/*/migration.sql").scanSync()].map((path) =>
  path.replaceAll("\\", "/"),
);

describe("migrations", () => {
  test("a required column on an existing table is backfilled before it becomes NOT NULL", () => {
    expect(migrations.length).toBeGreaterThan(0);
    expect(
      migrations.flatMap((path) =>
        unbackfilledRequiredColumns(readFileSync(path, "utf8")).map(
          (statement) => `${path}: ${statement}`,
        ),
      ),
    ).toEqual([]);
  });

  test("the check recognises what drizzle-kit generates and what a backfill looks like", () => {
    expect(
      unbackfilledRequiredColumns(`ALTER TABLE "message" ADD COLUMN "origin" text NOT NULL;`),
    ).toHaveLength(1);
    expect(
      unbackfilledRequiredColumns(`ALTER TABLE "message" ALTER COLUMN "origin" SET NOT NULL;`),
    ).toHaveLength(1);
    expect(
      unbackfilledRequiredColumns(
        [
          `ALTER TABLE "message" ADD COLUMN "origin" text;`,
          `UPDATE "message" SET "origin" = 'contact';`,
          `ALTER TABLE "message" ALTER COLUMN "origin" SET NOT NULL;`,
          `ALTER TABLE "message" ADD COLUMN "kind" text DEFAULT 'text' NOT NULL;`,
          `CREATE TABLE "note" ("id" text PRIMARY KEY);`,
          `ALTER TABLE "note" ADD COLUMN "body" text NOT NULL;`,
        ].join("--> statement-breakpoint\n"),
      ),
    ).toEqual([]);
  });
});
