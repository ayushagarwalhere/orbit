// Independent passport verification (runs in the browser and in tests).
//
// Nothing is taken on trust from the passport or Orbit's server. The browser:
//  1. reads Orbit's checkpoint from the pinned contract and checks the pinned operator submitted it;
//  2. downloads the ledger and AUTHENTICATES it: re-hashes every entry and rebuilds the RFC 6962 root,
//     which must equal the on-chain root;
//  3. checks the ledger is consistent with EVERY trusted checkpoint (operator + named witnesses);
//  4. checks the ledger is bound to one genesis/ledger id, with keys only from proven registrations;
//  5. re-runs the full integrity check: signatures, signed times, and replay of every instruction;
//  6. checks the passport against the authenticated ledger: every event genuine and NONE omitted;
//  7. re-derives every claim verdict and the trust grade from the authenticated state.
import type { OnChainCheckpoint } from "./anchor-read.ts";
import { PROTOCOL_ID } from "./auth.ts";
import { MerkleTree, hashObject } from "./crypto.ts";
import { passportHash, productEntries } from "./domain.ts";
import { hashEntry, verifyLedger } from "./ledger.ts";
import { classifySubmitter, type TrustedDeployment } from "./networks.ts";
import { replay } from "./replay.ts";
import type { Db, LedgerEntry } from "./types.ts";
import { trustReport } from "./verify.ts";

export interface Check {
  label: string;
  ok: boolean | "warn";
  detail: string;
  link?: string;
}

export interface ChainReader {
  checkpoint(id: number): Promise<OnChainCheckpoint>;
  ledgerCheckpoints(ledgerId: string): Promise<{ operator: string; checkpoints: OnChainCheckpoint[] }>;
  /** The ledger as served by any node; authenticated here against on-chain roots. */
  ledger(): Promise<LedgerEntry[]>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function verifyPassport(doc: any, opts: { trusted?: TrustedDeployment; chainId?: number; chain?: ChainReader; explorer?: (tx: string) => string | undefined }, onProgress?: (c: Check[]) => void): Promise<Check[]> {
  const out: Check[] = [];
  const push = (c: Check) => {
    out.push(c);
    onProgress?.([...out]);
  };
  const subj = doc?.credentialSubject;
  const anchor = doc?.proof?.anchor;
  if (!subj?.passportCore) return [{ label: "Document", ok: false, detail: "Not an Orbit passport" }];

  // 1. Orbit's checkpoint, from the pinned contract, by the pinned operator.
  if (!anchor?.onChain || !opts.chain || !opts.trusted) {
    push({ label: "Not independently verifiable", ok: false, detail: anchor?.onChain ? "No pinned Orbit deployment for this network" : "This passport has no on-chain anchor, so nothing in it can be checked against a public root" });
    return out;
  }
  if (String(anchor.contract).toLowerCase() !== opts.trusted.contract.toLowerCase()) {
    push({ label: "Anchor contract", ok: false, detail: `Passport points to ${anchor.contract}, not Orbit's published OrbitAnchor ${opts.trusted.contract}` });
    return out;
  }
  let cp: OnChainCheckpoint;
  let ledger: LedgerEntry[];
  try {
    [cp, ledger] = await Promise.all([opts.chain.checkpoint(Number(anchor.checkpointId)), opts.chain.ledger()]);
  } catch (e) {
    push({ label: "Not independently verifiable", ok: false, detail: `Could not reach the chain or the ledger: ${e instanceof Error ? (e.message.split(String.fromCharCode(10))[0] ?? "") : "error"}` });
    return out;
  }
  const by = classifySubmitter(opts.trusted, cp.submitter);
  if (by.role !== "operator") {
    push({ label: "On-chain checkpoint", ok: false, detail: `Checkpoint #${cp.id} was submitted by ${by.name}, not Orbit's pinned operator` });
    return out;
  }
  push({ label: "On-chain checkpoint", ok: true, detail: `#${cp.id} by Orbit's pinned operator: ${cp.ledgerLength} entries, ${new Date(cp.timestamp * 1000).toUTCString()}`, link: anchor.txHash ? opts.explorer?.(anchor.txHash) : undefined });

  // 2. Authenticate the downloaded ledger against the on-chain root.
  const tree = new MerkleTree();
  let badHash = -1;
  ledger.forEach((e, i) => {
    if (badHash < 0 && (e.index !== i || hashEntry(e) !== e.hash)) badHash = i;
    tree.append(e.hash);
  });
  const authentic = badHash < 0 && cp.ledgerLength <= ledger.length && tree.root(cp.ledgerLength) === cp.merkleRoot;
  push({
    label: "Ledger authenticated",
    ok: authentic,
    detail: authentic
      ? `${cp.ledgerLength} entries re-hashed in your browser; their RFC 6962 root equals the on-chain root`
      : badHash >= 0
        ? `entry #${badHash} does not match its own hash`
        : cp.ledgerLength > ledger.length
          ? `the node served ${ledger.length} entries but Orbit anchored ${cp.ledgerLength}: events withheld`
          : "the served ledger's root differs from the on-chain root: history was rewritten",
  });
  if (!authentic) return out;
  const anchored = ledger.slice(0, cp.ledgerLength);

  // 3. Consistent with every trusted checkpoint for this ledger (roots computed locally, no proofs needed).
  let witnesses = 0;
  let others = 0;
  let ignored = 0;
  let conflict: string | null = null;
  try {
    const { checkpoints } = await opts.chain.ledgerCheckpoints(cp.ledgerId);
    for (const c of checkpoints) {
      const role = classifySubmitter(opts.trusted, c.submitter);
      if (role.role === "unidentified") {
        ignored++;
        continue;
      }
      if (c.id === cp.id) continue;
      others++;
      if (role.role === "witness") witnesses++;
      const ok = c.ledgerLength <= ledger.length && tree.root(c.ledgerLength) === c.merkleRoot;
      if (!ok && !conflict) conflict = `checkpoint #${c.id} by ${role.name} (${c.ledgerLength} entries) does not match this ledger`;
    }
  } catch {
    conflict = "could not list checkpoints";
  }
  push({
    label: "Append-only history",
    ok: !conflict,
    detail: conflict ?? `matches all ${others} other trusted checkpoint${others === 1 ? "" : "s"}${ignored ? `; ${ignored} by unidentified submitters ignored` : ""}`,
  });
  push({
    label: "Witnessed",
    ok: witnesses > 0 ? true : "warn",
    detail: witnesses > 0 ? `${witnesses} checkpoint${witnesses === 1 ? "" : "s"} by named witnesses` : "No named witness has anchored this ledger yet, so a rebuilt ledger couldn't be told apart from the original",
  });

  // 4. One ledger: genesis names it, every instruction is signed for it, keys only from proven registrations.
  const genesis = anchored[0];
  const lid = genesis?.type === "ACTOR_REGISTERED" && genesis.subjectId === PROTOCOL_ID ? String(genesis.data.ledgerId) : "";
  const foreign = anchored.findIndex((e) => e.auth && e.auth.request.ledger !== lid);
  const regs = new Set<string>();
  let dupReg = -1;
  anchored.forEach((e, i) => {
    if (e.type !== "ACTOR_REGISTERED") return;
    if (regs.has(e.subjectId) || e.subjectId !== e.actorId) dupReg = dupReg < 0 ? i : dupReg;
    regs.add(e.subjectId);
  });
  // No entry may claim a time after the block that anchored it (5 minutes' grace for clock skew).
  // With times ordered (checked below), entries can't be dated ahead to farm time-based rewards.
  const lastAt = Date.parse(anchored.at(-1)?.timestamp ?? "");
  const future = cp.timestamp > 0 && lastAt > cp.timestamp * 1000 + 5 * 60_000;
  const bound = !!lid && lid === cp.ledgerId && lid === anchor.ledgerId && foreign < 0 && dupReg < 0 && !future;
  push({
    label: "Single ledger",
    ok: bound,
    detail: bound
      ? `genesis names ledger ${lid.slice(0, 12)}…; every instruction was signed for it; ${regs.size} keys, each registered once`
      : !lid
        ? "entry #0 is not the protocol's genesis registration"
        : foreign >= 0
          ? `#${foreign} was signed for a different ledger`
          : dupReg >= 0
            ? `#${dupReg} re-registers an actor`
            : future
              ? `the last anchored entry is dated ${anchored.at(-1)?.timestamp}, after the block that anchored it`
              : "the passport, checkpoint and genesis name different ledgers",
  });

  // 5. Full integrity in the browser: signatures, signed times, and replay of every instruction.
  const integrity = verifyLedger({ ledger: anchored } as unknown as Db);
  push({
    label: "Signatures and replay",
    ok: integrity.ok,
    detail: integrity.ok
      ? `${anchored.length} instructions: actor and sequencer signatures valid, and replaying them through the rules reproduces every entry`
      : `#${integrity.issues[0].index}: ${integrity.issues[0].problem} (${integrity.issues[0].detail})`,
  });
  if (!bound || !integrity.ok) return out;

  // 6. The passport against the authenticated ledger: genuine, and nothing left out.
  const { db } = replay(anchored);
  const product = db.products.find((p) => p.id === subj.passportCore.id);
  const events: LedgerEntry[] = subj.traceabilityEvents ?? [];
  const lotIds = new Set(product?.inputs.map((i) => i.batchId) ?? []);
  const relevant = product ? [...productEntries(db, product.id), ...anchored.filter((e) => e.type === "BATCH_CREATED" && lotIds.has(e.subjectId))] : [];
  const have = new Set(events.map((e) => e.hash));
  const missing = relevant.filter((e) => !have.has(e.hash));
  // Re-hash what the passport shows, so edited data under a kept hash is caught too.
  const shown: LedgerEntry[] = [...events, ...(subj.actorRegistrations ?? [])];
  const forged = shown.filter((e) => {
    try {
      return hashEntry(e) !== e.hash || (e.index < cp.ledgerLength && anchored[e.index]?.hash !== e.hash);
    } catch {
      return true;
    }
  });
  const recordOk = !!product && hashObject(subj.passportCore) === passportHash(product);
  push({
    label: "Passport complete and genuine",
    ok: recordOk && !missing.length && !forged.length,
    detail: !product
      ? "the product is not in the anchored ledger"
      : !recordOk
        ? "the passport record differs from the one committed at manufacture"
        : forged.length
          ? `#${forged[0].index} differs from the anchored ledger`
          : missing.length
            ? `the passport leaves out ${missing.length} anchored event${missing.length === 1 ? "" : "s"} (first: #${missing[0].index} ${missing[0].type})`
            : `all ${relevant.length} anchored events about this product are present and genuine`,
  });
  if (!product) return out;
  const pending = events.filter((e) => e.index >= cp.ledgerLength).length;
  if (pending) push({ label: "Not yet anchored", ok: "warn", detail: `${pending} newer event${pending === 1 ? " is" : "s are"} after this checkpoint and can't be checked yet` });

  // 7. Re-derive verdicts and the grade from the authenticated state.
  const mine = trustReport(db, product);
  for (const c of mine.claims) {
    const theirs = (subj.conformityClaims as any[]).find((x) => x.id === c.claim.id)?.status;
    const same = theirs === c.status;
    push({ label: `Verdict ${c.claim.id} (${c.claim.kind.toLowerCase().replace("_", " ")})`, ok: same ? true : pending ? "warn" : false, detail: same ? `re-derived in your browser: ${c.status}` : `passport says ${theirs ?? "nothing"}, the anchored ledger gives ${c.status}` });
  }
  const theirGrade = subj.trust?.grade;
  push({ label: "Trust grade", ok: theirGrade === mine.grade ? true : pending ? "warn" : false, detail: theirGrade === mine.grade ? `re-derived: ${mine.grade} (${mine.score}/100)` : `passport says ${theirGrade}, the anchored ledger gives ${mine.grade}` });
  return out;
}
