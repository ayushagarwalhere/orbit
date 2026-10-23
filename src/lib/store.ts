import fs from "node:fs";
import path from "node:path";
import { seedDb } from "./seed.ts";
import type { Db } from "./types.ts";

// Single JSON document store. Good enough for a prototype; swap for Postgres in production.
// The ledger itself is the source of truth and can be verified independently of this storage.

const g = globalThis as unknown as { __orbitDb?: Db };

function dbFile(): string {
  const dir = process.env.ORBIT_DATA_DIR ?? (process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "data"));
  return path.join(dir, "orbit-db.json");
}

export function getDb(): Db {
  if (!g.__orbitDb) {
    try {
      g.__orbitDb = JSON.parse(fs.readFileSync(dbFile(), "utf8")) as Db;
    } catch {
      g.__orbitDb = seedDb();
      persist();
    }
  }
  return g.__orbitDb;
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(dbFile()), { recursive: true });
    fs.writeFileSync(dbFile(), JSON.stringify(g.__orbitDb));
  } catch {
    // Read-only filesystem: keep running in memory.
  }
}

/** Runs a change atomically: if it throws, the database is rolled back. */
export function mutate<T>(fn: (db: Db) => T): T {
  const db = getDb();
  const snapshot = JSON.stringify(db);
  try {
    const result = fn(db);
    persist();
    return result;
  } catch (err) {
    g.__orbitDb = JSON.parse(snapshot) as Db;
    throw err;
  }
}

export function resetDb(): Db {
  g.__orbitDb = seedDb();
  persist();
  return g.__orbitDb;
}
