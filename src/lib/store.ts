import fs from "node:fs";
import path from "node:path";
import "./crypto-node.ts"; // native Ed25519/SHA-256 on the server
import { PROTOCOL_ID } from "./auth.ts";
import { publicKeyOf, randomPrivateKey } from "./crypto.ts";
import { TAMPER_TTL_MS, restore, tamperExpired } from "./demo.ts";
import { applySigned } from "./dispatch.ts";
import { OrbitError } from "./domain.ts";
import { generateKeystore, type Keystore } from "./keys.ts";
import type { Tx } from "./ledger.ts";
import { replay } from "./replay.ts";
import { ACTOR_IDS, seedDb } from "./seed.ts";
import type { Db, LedgerEntry, SignedRequest } from "./types.ts";

// Storage = one append-only JSON Lines file of ledger entries. Nothing else is persisted: actors,
// lots, products, claims, audits, credits and checkpoints are all rebuilt by replaying the
// ledger (replay.ts), so there is no mutable record that could disagree with it.

const g = globalThis as unknown as { __orbit?: { db: Db; keys: Keystore }; __orbitPersisted?: { n: number; head?: string } };
const NL = String.fromCharCode(10);

function dataDir(): string {
  return process.env.ORBIT_DATA_DIR ?? (process.env.VERCEL ? "/tmp" : path.join(process.cwd(), "data"));
}
const ledgerFile = () => path.join(dataDir(), "ledger.jsonl");

/**
 * Demo mode exposes demo actors' keys to the console and enables reset/tamper. On by default in
 * development; in production it must be switched on explicitly with ORBIT_DEMO_MODE=1.
 */
export function isDemoMode(): boolean {
  const v = process.env.ORBIT_DEMO_MODE;
  if (v === "1") return true;
  if (v === "0") return false;
  return process.env.NODE_ENV !== "production";
}

/**
 * Keys come from ORBIT_KEYSTORE (JSON, for hosted deployments) or data/keystore.json, or are
 * generated randomly on first run. Never committed to git.
 */
function loadKeystore(): Keystore {
  const fromEnv = process.env.ORBIT_KEYSTORE?.trim();
  if (fromEnv) {
    let keys: unknown;
    try {
      keys = JSON.parse(fromEnv);
    } catch {
      keys = null;
    }
    if (!keys || typeof keys !== "object" || Array.isArray(keys) || !(keys as Keystore)[PROTOCOL_ID]) {
      throw new Error(
        `ORBIT_KEYSTORE must be the whole JSON contents of data/keystore.json: it starts with "{" and contains "${PROTOCOL_ID}". ` +
          `It currently starts with "${fromEnv.slice(0, 2)}…" (${fromEnv.length} characters). A hex private key or 0x address here means the secrets were pasted into the wrong fields.`,
      );
    }
    return keys as Keystore;
  }
  const file = path.join(dataDir(), "keystore.json");
  try {
    const keys = JSON.parse(fs.readFileSync(file, "utf8")) as Keystore;
    const missing = ACTOR_IDS.filter((id) => !keys[id]);
    if (missing.length) {
      Object.assign(keys, generateKeystore(missing));
      try {
        fs.writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
      } catch {
        // read-only FS: keep the new keys in memory
      }
    }
    return keys;
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

function readLedger(): LedgerEntry[] | null {
  try {
    return fs
      .readFileSync(ledgerFile(), "utf8")
      .split(NL)
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LedgerEntry);
  } catch {
    return null;
  }
}

/**
 * Optional starting ledger for hosts whose disk is wiped on restart (e.g. Render's free tier):
 * ORBIT_SNAPSHOT names a JSON Lines ledger that is already anchored and witnessed on-chain. The
 * server starts from it when its data dir is empty, and the demo "reset" restores it, instead of
 * seeding a new, unanchored ledger every time.
 */
function readSnapshot(): LedgerEntry[] | null {
  const file = process.env.ORBIT_SNAPSHOT;
  if (!file) return null;
  try {
    return fs
      .readFileSync(path.resolve(process.cwd(), file), "utf8")
      .split(NL)
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LedgerEntry);
  } catch {
    console.warn(`[orbit] ORBIT_SNAPSHOT ${file} could not be read; seeding a new ledger instead`);
    return null;
  }
}

/** A fresh id per ledger instance, so different deployments never mix checkpoints on-chain. */
function newLedgerId(): string {
  return randomPrivateKey();
}

/** Rebuilds state from stored entries, if they were written by this version with this keystore. */
function fromEntries(entries: LedgerEntry[] | null, keys: Keystore): Db | null {
  const genesis = entries?.[0];
  if (!genesis || genesis.subjectId !== PROTOCOL_ID || typeof genesis.data.ledgerId !== "string" || genesis.data.publicKey !== publicKeyOf(keys[PROTOCOL_ID])) return null;
  const r = replay(entries!);
  if (r.issues.length) console.warn(`[orbit] stored ledger has ${r.issues.length} replay issue(s); they are shown on the ledger page`);
  return r.db;
}

function state() {
  if (!g.__orbit) {
    const keys = loadKeystore();
    const stored = readLedger();
    const db = fromEntries(stored, keys) ?? (stored ? null : fromEntries(readSnapshot(), keys));
    const fresh = !db || !stored;
    g.__orbit = { db: db ?? seedDb(keys, newLedgerId()), keys };
    if (fresh) persist(true);
    else g.__orbitPersisted = { n: g.__orbit.db.ledger.length, head: g.__orbit.db.ledger.at(-1)?.hash };
  }
  return g.__orbit;
}

function persist(full = false) {
  const db = g.__orbit!.db;
  if (db.tamper) return; // simulations are in-memory only: disk always holds the genuine ledger
  const was = g.__orbitPersisted;
  const appendOnly = !full && was && was.n <= db.ledger.length && (was.n === 0 || db.ledger[was.n - 1]?.hash === was.head);
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const lines = (from: number) => db.ledger.slice(from).map((e) => JSON.stringify(e) + NL).join("");
    if (appendOnly) {
      if (db.ledger.length > was!.n) fs.appendFileSync(ledgerFile(), lines(was!.n));
    } else {
      fs.writeFileSync(ledgerFile(), lines(0));
    }
  } catch {
    // Read-only filesystem: keep running in memory.
  }
  g.__orbitPersisted = { n: db.ledger.length, head: db.ledger.at(-1)?.hash };
}

export function getDb(): Db {
  const s = state();
  // Demo simulations roll themselves back after their TTL (lazily, on the next request).
  if (tamperExpired(s.db)) restore(s.db);
  return s.db;
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
 * Runs a change atomically. State only ever grows by appending, so rollback is a truncation of
 * each collection back to its previous length: no copying.
 */
export function mutate<T>(fn: (tx: Tx) => T): T {
  const s = state();
  const db = s.db;
  const lens = { ledger: db.ledger.length, actors: db.actors.length, batches: db.batches.length, products: db.products.length, claims: db.claims.length, checkpoints: db.checkpoints.length };
  const ledgerRef = db.ledger;
  try {
    const result = fn({ db, sequencerKey: s.keys[PROTOCOL_ID] });
    persist();
    return result;
  } catch (err) {
    if (s.db.ledger === ledgerRef) {
      db.ledger.length = lens.ledger;
      db.actors.length = lens.actors;
      db.batches.length = lens.batches;
      db.products.length = lens.products;
      db.claims.length = lens.claims;
      db.checkpoints.length = lens.checkpoints;
    }
    throw err;
  }
}

/** Verifies and applies an actor-signed request. */
export function submitSigned(action: string, sr: SignedRequest): unknown {
  const db = getDb();
  if (db.tamper) {
    const left = Math.max(1, Math.ceil((db.tamper.at + TAMPER_TTL_MS - Date.now()) / 1000));
    throw new OrbitError(`A tamper simulation is running; new writes resume when it auto-restores in ${left}s`, 409);
  }
  return mutate((tx) => applySigned(tx.db, tx.sequencerKey, action, sr));
}

export function resetDb(): Db {
  const s = state();
  s.db = fromEntries(readSnapshot(), s.keys) ?? seedDb(s.keys, newLedgerId());
  persist(true);
  return s.db;
}
