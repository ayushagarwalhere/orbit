import fs from "node:fs";
import "./crypto-node.ts"; // native Ed25519/SHA-256 on the server
import path from "node:path";
import { PROTOCOL_ID } from "./auth.ts";
import { publicKeyOf, randomPrivateKey } from "./crypto.ts";
import { applySigned } from "./dispatch.ts";
import { generateKeystore, type Keystore } from "./keys.ts";
import type { Tx } from "./ledger.ts";
import { ACTOR_IDS, seedDb } from "./seed.ts";
import type { Db, SignedRequest } from "./types.ts";

// File store. The ledger is the source of truth and is independently verifiable (hash chain +
// signatures + on-chain Merkle anchors), so storage itself is not trusted.

const g = globalThis as unknown as { __orbit?: { db: Db; keys: Keystore } };

export const DB_VERSION = 3;

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

// Storage layout: the ledger is an append-only JSON Lines log (one entry per line), so a write
// appends O(new entries) bytes instead of rewriting everything. Everything else (actors, products,
// lots, claims, checkpoints) lives in a small state file.
const files = () => ({ state: path.join(dataDir(), "state.json"), ledger: path.join(dataDir(), "ledger.jsonl") });

interface Persisted {
  n: number; // ledger entries already on disk
  head: string | undefined;
  tamperKey: string;
}
const p = globalThis as unknown as { __orbitPersisted?: Persisted };
const NL = String.fromCharCode(10);

function tamperKey(db: Db) {
  return db.tamper ? `${db.tamper.mode}${db.tamper.index}` : "";
}

function loadDb(): Db | null {
  try {
    const f = files();
    const rest = JSON.parse(fs.readFileSync(f.state, "utf8")) as Omit<Db, "ledger">;
    const lines = fs.readFileSync(f.ledger, "utf8").split(NL).filter(Boolean);
    const db = { ...rest, ledger: lines.map((l) => JSON.parse(l)) } as Db;
    p.__orbitPersisted = { n: db.ledger.length, head: db.ledger.at(-1)?.hash, tamperKey: tamperKey(db) };
    return db;
  } catch {
    return null;
  }
}

function state() {
  if (!g.__orbit) {
    const keys = loadKeystore();
    let db = loadDb();
    const seqKey = db?.actors.find((a) => a.id === PROTOCOL_ID)?.publicKey;
    if (db && (db.version !== DB_VERSION || seqKey !== publicKeyOf(keys[PROTOCOL_ID]))) db = null; // stale or other keystore
    const fresh = !db;
    g.__orbit = { db: db ?? seedDb(keys), keys };
    if (!g.__orbit.db.ledgerId) g.__orbit.db.ledgerId = newLedgerId();
    if (fresh) persist(true);
  }
  return g.__orbit;
}

function persist(full = false) {
  const db = g.__orbit!.db;
  const was = p.__orbitPersisted;
  // Append when history only grew; rewrite the log if it was edited (demo tamper/restore) or reset.
  const appendOnly = !full && was && was.tamperKey === tamperKey(db) && was.n <= db.ledger.length && (was.n === 0 || db.ledger[was.n - 1]?.hash === was.head);
  try {
    const f = files();
    fs.mkdirSync(dataDir(), { recursive: true });
    const { ledger, ...rest } = db;
    const lines = (from: number) => ledger.slice(from).map((e) => JSON.stringify(e) + NL).join("");
    if (appendOnly) {
      if (ledger.length > was!.n) fs.appendFileSync(f.ledger, lines(was!.n));
    } else {
      fs.writeFileSync(f.ledger, lines(0));
    }
    fs.writeFileSync(f.state, JSON.stringify(rest));
  } catch {
    // Read-only filesystem: keep running in memory.
  }
  p.__orbitPersisted = { n: db.ledger.length, head: db.ledger.at(-1)?.hash, tamperKey: tamperKey(db) };
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

/**
 * Runs a change atomically: if it throws, the database is rolled back. Rollback truncates the
 * append-only ledger and restores the (small) non-ledger state, so it doesn't copy the ledger.
 */
export function mutate<T>(fn: (tx: Tx) => T): T {
  const s = state();
  const ledgerLen = s.db.ledger.length;
  const ledgerRef = s.db.ledger;
  const { ledger: _ledger, ...rest } = s.db;
  const snapshot = JSON.stringify(rest);
  try {
    const result = fn({ db: s.db, sequencerKey: s.keys[PROTOCOL_ID] });
    persist();
    return result;
  } catch (err) {
    const restored = JSON.parse(snapshot) as Omit<Db, "ledger">;
    ledgerRef.length = ledgerLen;
    s.db = { ...restored, ledger: ledgerRef } as Db;
    throw err;
  }
}

/** Verifies and applies an actor-signed request. */
export function submitSigned(action: string, sr: SignedRequest): unknown {
  return mutate((tx) => applySigned(tx.db, tx.sequencerKey, action, sr));
}

/** A fresh id per ledger instance, so different deployments never mix checkpoints on-chain. */
function newLedgerId(): string {
  return randomPrivateKey();
}

export function resetDb(): Db {
  const s = state();
  s.db = seedDb(s.keys);
  s.db.ledgerId = newLedgerId();
  persist(true);
  return s.db;
}
