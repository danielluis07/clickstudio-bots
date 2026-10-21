import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "@/db/database";

const migrationsFolder = `${import.meta.dir}/../../drizzle`;

// Starting an empty PGlite runs initdb, which takes seconds; loading a data
// directory dumped after the migrations takes a fraction of that. `bun test`
// runs every file in one process, so a run migrates once.
let migratedDataDir: Promise<File | Blob> | null = null;

const dumpMigratedDataDir = async () => {
  const client = new PGlite();
  await migrate(drizzle({ client }), { migrationsFolder });
  const dump = await client.dumpDataDir("none");
  await client.close();
  return dump;
};

// A fresh, fully migrated database, independent of every other one.
export const createTestDatabase = async (): Promise<Database> => {
  migratedDataDir ??= dumpMigratedDataDir();
  const client = new PGlite({ loadDataDir: await migratedDataDir });
  await client.waitReady;
  return drizzle({ client });
};
