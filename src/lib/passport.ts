// Exports a product as a Digital Product Passport document (UNTP DPP data model). Every event
// carries its full signed content plus an RFC 6962 inclusion proof against an anchored root. The
// browser verifier doesn't take the document's word for anything: it downloads the ledger, checks
// it against the on-chain root, and compares the passport with it (see passport-verify.ts).
import { PROTOCOL_ID } from "./auth.ts";
import { attestationsOf, avoidedCo2e, carbonFootprint, custody, getActor, materialLines, passportCore, passportHash, productEntries, productMass, provenRecycledPct } from "./domain.ts";
import { entryBody, ledgerTree, verifyLedger } from "./ledger.ts";
import type { Checkpoint, Db, LedgerEntry, Product } from "./types.ts";
import { trustReport } from "./verify.ts";

const r = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function latestCheckpoint(db: Db): Checkpoint | undefined {
  return [...db.checkpoints].reverse().find((c) => c.onChain) ?? db.checkpoints[db.checkpoints.length - 1];
}

export function exportPassport(db: Db, p: Product, baseUrl: string) {
  const brand = getActor(db, p.brandId);
  const report = verifyLedger(db);
  const trust = trustReport(db, p, report);
  const cf = carbonFootprint(db, p);
  const cp = latestCheckpoint(db);
  const tree = ledgerTree(db);

  // RFC 6962 inclusion proof against the anchored checkpoint (bound to index and tree size).
  const withProof = (e: LedgerEntry) => ({
    ...entryBody(e),
    hash: e.hash,
    signature: e.signature,
    merkleProof: cp && e.index < cp.covers ? { index: e.index, size: cp.covers, path: tree.inclusionProof(e.index, cp.covers) } : null,
  });

  // Include material lot entries too: the passport is only as good as its inputs.
  const lotIds = new Set(p.inputs.map((i) => i.batchId));
  const events = [...productEntries(db, p.id), ...db.ledger.filter((e) => e.type === "BATCH_CREATED" && lotIds.has(e.subjectId))].sort((a, b) => a.index - b.index);
  const signers = new Set([PROTOCOL_ID, ...events.map((e) => e.actorId)]);
  const registrations = db.ledger.filter((e) => e.type === "ACTOR_REGISTERED" && signers.has(e.subjectId));

  return {
    // UNTP DPP data model. Not a W3C Verifiable Credential: there is no Data Integrity signature on
    // the document; its integrity comes from the ledger proof below, checked against the chain.
    "@context": ["https://test.uncefact.org/vocabulary/untp/dpp/0.5.0/"],
    type: ["DigitalProductPassport"],
    id: `${baseUrl}/passport/${p.id}`,
    issuer: { id: `did:orbit:${brand.id}`, name: brand.name, publicKey: brand.publicKey },
    validFrom: p.createdAt,
    credentialSubject: {
      product: {
        id: `https://id.gs1.org/01/${p.gtin}/21/${p.serial}`,
        emoji: p.emoji,
        createdAt: p.createdAt,
        passportId: p.id,
        name: p.name,
        category: p.category,
        description: p.description,
        massKg: r(productMass(p)),
        status: custody(db, p.id).stage,
        repairabilityScore: p.repairabilityScore,
        warrantyYears: p.warrantyYears,
        endOfLife: p.endOfLife,
      },
      passportHash: passportHash(p),
      passportCore: passportCore(p),
      materialsProvenance: materialLines(db, p).map((l) => ({
        lot: l.batch.id,
        material: l.label,
        massKg: r(l.massKg),
        recycledKg: r(l.recycledKg),
        originCountry: l.origin.country,
        producer: getActor(db, l.batch.producerId).name,
        recoveredFrom: l.batch.sourceProductIds,
      })),
      circularity: {
        recycledContentPct: r(provenRecycledPct(db, p), 1),
        depositCredits: p.depositCredits,
        avoidedEmissionsKgCO2e: r(avoidedCo2e(db, p), 2),
      },
      emissions: {
        unit: "kgCO2e",
        total: r(cf.total, 2),
        materials: r(cf.materials, 2),
        manufacturing: r(cf.manufacturing, 2),
        transport: r(cf.transport, 3),
        selfReportedShare: cf.total ? r(cf.manufacturing / cf.total, 3) : 0,
      },
      conformityClaims: trust.claims.map((c) => ({
        id: c.claim.id,
        kind: c.claim.kind,
        statement: c.claim.statement,
        value: c.claim.value,
        productId: c.claim.productId,
        issuerId: c.claim.issuerId,
        evidenceHash: c.claim.evidenceHash ?? null,
        createdAt: c.claim.createdAt,
        status: c.status,
        evidence: c.evidence,
        caveats: c.caveats,
        issues: c.reasons,
        attestations: attestationsOf(db, c.claim.id),
      })),
      trust: { score: trust.score, grade: trust.grade, summary: trust.summary, breakdown: trust.breakdown },
      actorRegistrations: registrations.map(withProof),
      traceabilityEvents: events.map(withProof),
    },
    proof: {
      type: "OrbitLedgerProof",
      cryptosuite: "ed25519-sha256-jcs+merkle-sha256",
      ledgerLength: db.ledger.length,
      ledgerIntegrity: report.ok,
      anchor: cp
        ? {
            onChain: cp.onChain,
            network: cp.network,
            chainId: cp.chainId ?? null,
            contract: cp.contract ?? null,
            checkpointId: cp.checkpointId ?? null,
            ledgerId: cp.ledgerId ?? db.ledgerId ?? null,
            submitter: cp.submitter ?? null,
            covers: cp.covers,
            merkleRoot: cp.merkleRoot,
            txHash: cp.txHash ?? null,
            explorerTx: cp.explorerTx ?? null,
          }
        : null,
    },
  };
}

export type PassportDoc = ReturnType<typeof exportPassport>;
