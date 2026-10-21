import type { PgAsyncDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export type Database = PgAsyncDatabase<PgQueryResultHKT>;

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
