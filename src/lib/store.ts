import fs from "node:fs";
import path from "node:path";
import { PROTOCOL_ID } from "./auth.ts";
import { publicKeyOf } from "./crypto.ts";
import { applySigned } from "./dispatch.ts";
import { generateKeystore, type Keystore } from "./keys.ts";
import type { Tx } from "./ledger.ts";
import { ACTOR_IDS, seedDb } from "./seed.ts";
import type { Db, SignedRequest } from "./types.ts";

// Single-document store. The ledger is the source of truth and is independently verifiable
// (hash chain + signatures + on-chain Merkle anchors), so storage itself is not trusted.

const g = globalThis as unknown as { __orbit?: { db: Db; keys: Keystore } };

export const DB_VERSION = 2;

function dataDir(): string {
  return process.env.ORBIT_DATA_DIR ?? (process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "data"));
}

/** Demo mode exposes demo actors' keys to the console and enables reset/tamper. On by default. */
export function isDemoMode(): boolean {
  return process.env.ORBIT_DEMO_MODE !== "0";
}

/**
 * Keys come from ORBIT_KEYSTORE (JSON, for hosted deployments) or data/keystore.json, or are
 * generated randomly on first run. Never committed to git.
 */
function loadKeystore(): Keystore {
  if (process.env.ORBIT_KEYSTORE) return JSON.parse(process.env.ORBIT_KEYSTORE) as Keystore;
  const file = path.join(dataDir(), "keystore.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Keystore;
  } catch {
    const keys = generateKeystore(ACTOR_IDS);
    try {
      fs.mkdirSync(dataDir(), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
    } catch {
      // read-only FS: keys live in memory for this process
    }
    return keys;
  }
}

function dbFile() {
  return path.join(dataDir(), "orbit-db.json");
}

function state() {
  if (!g.__orbit) {
    const keys = loadKeystore();
    let db: Db | null = null;
    try {
      db = JSON.parse(fs.readFileSync(dbFile(), "utf8")) as Db;
      const seqKey = db.actors.find((a) => a.id === PROTOCOL_ID)?.publicKey;
      if (db.version !== DB_VERSION || seqKey !== publicKeyOf(keys[PROTOCOL_ID])) db = null; // stale or other keystore
    } catch {
      db = null;
    }
    g.__orbit = { db: db ?? seedDb(keys), keys };
    if (!db) persist();
  }
  return g.__orbit;
}

function persist() {
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(dbFile(), JSON.stringify(g.__orbit!.db));
  } catch {
    // Read-only filesystem: keep running in memory.
  }
}

export function getDb(): Db {
  return state().db;
}

export function sequencerKey(): string {
  return state().keys[PROTOCOL_ID];
}

/** Demo actor keys for the role-play console. Never includes the sequencer key. */
export function demoKeys(): Record<string, string> {
  const { keys } = state();
  return Object.fromEntries(Object.entries(keys).filter(([id]) => id !== PROTOCOL_ID));
}

/** Runs a change atomically: if it throws, the database is rolled back. */
export function mutate<T>(fn: (tx: Tx) => T): T {
  const s = state();
  const snapshot = JSON.stringify(s.db);
  try {
    const result = fn({ db: s.db, sequencerKey: s.keys[PROTOCOL_ID] });
    persist();
    return result;
  } catch (err) {
    s.db = JSON.parse(snapshot) as Db;
    throw err;
  }
}

/** Verifies and applies an actor-signed request. */
export function submitSigned(action: string, sr: SignedRequest): unknown {
  return mutate((tx) => applySigned(tx.db, tx.sequencerKey, action, sr));
}

export function resetDb(): Db {
  const s = state();
  s.db = seedDb(s.keys);
  persist();
  return s.db;
}
