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

const clients = new WeakMap<Database, PGlite>();

// A fresh, fully migrated database, independent of every other one. Close it
// with closeTestDatabase when the test or file is done: an open PGlite keeps
// its memory until the process exits, and the whole run shares one process.
export const createTestDatabase = async (): Promise<Database> => {
  migratedDataDir ??= dumpMigratedDataDir();
  const client = new PGlite({ loadDataDir: await migratedDataDir });
  await client.waitReady;
  const db = drizzle({ client });
  clients.set(db, client);
  return db;
};

export const closeTestDatabase = async (db: Database) => {
  await clients.get(db)?.close();
  clients.delete(db);
};
