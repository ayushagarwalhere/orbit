// Exports a product as a self-verifying Digital Product Passport document.
// Shape follows the UNTP DPP / W3C Verifiable Credential pattern; every traceability event
// carries its hash, signature and signer key so anyone can re-verify it offline.
import { avoidedCo2e, carbonFootprint, custody, getActor, materialLines, passportCore, passportHash, productEntries, productMass, provenRecycledPct } from "./domain.ts";
import { entryBody, verifyLedger } from "./ledger.ts";
import type { Db, Product } from "./types.ts";
import { trustReport } from "./verify.ts";

const r = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function exportPassport(db: Db, p: Product, baseUrl: string) {
  const brand = getActor(db, p.brandId);
  const report = verifyLedger(db);
  const trust = trustReport(db, p, report);
  const cf = carbonFootprint(db, p);
  const entries = productEntries(db, p.id);
  const cp = db.checkpoints[db.checkpoints.length - 1];

  return {
    "@context": ["https://www.w3.org/ns/credentials/v2", "https://test.uncefact.org/vocabulary/untp/dpp/0.5.0/"],
    type: ["DigitalProductPassport", "VerifiableCredential"],
    id: `${baseUrl}/passport/${p.id}`,
    issuer: { id: `did:orbit:${brand.id}`, name: brand.name, publicKey: brand.publicKey },
    validFrom: p.createdAt,
    credentialSubject: {
      product: {
        id: `https://id.gs1.org/01/${p.gtin}/21/${p.serial}`,
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
      },
      conformityClaims: trust.claims.map((c) => ({
        id: c.claim.id,
        kind: c.claim.kind,
        statement: c.claim.statement,
        value: c.claim.value,
        status: c.status,
        evidence: c.evidence,
        issues: c.reasons,
        attestations: c.claim.attestations,
      })),
      trust: { score: trust.score, grade: trust.grade, summary: trust.summary },
      traceabilityEvents: entries.map((e) => ({
        ...entryBody(e),
        hash: e.hash,
        signature: e.signature,
        signerPublicKey: db.actors.find((a) => a.id === e.actorId)?.publicKey,
      })),
    },
    proof: {
      type: "OrbitLedgerProof",
      cryptosuite: "ed25519-sha256-jcs",
      ledgerLength: db.ledger.length,
      ledgerMerkleRoot: report.merkleRoot,
      ledgerIntegrity: report.ok,
      lastCheckpoint: cp ?? null,
    },
  };
}

export type PassportDoc = ReturnType<typeof exportPassport>;
