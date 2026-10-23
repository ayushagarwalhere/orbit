// The accountability engine: checks every sustainability claim against what the ledger proves.
import { claimHash, carbonFootprint, getActor, lifecycleEntries, materialLines, passportHash, productEntries, provenRecycledPct } from "./domain.ts";
import { lintClaim, type LintHit } from "./greenwash.ts";
import { verifyLedger, type IntegrityReport } from "./ledger.ts";
import type { Claim, Db, Product } from "./types.ts";

export type ClaimStatus = "VERIFIED" | "PENDING" | "CONTRADICTED";

export interface ClaimResult {
  claim: Claim;
  status: ClaimStatus;
  reasons: string[];
  evidence: string[];
  lint: LintHit[];
  tampered: boolean;
}

const fmt = (n: number, d = 1) => n.toFixed(d);

export function evaluateClaim(db: Db, claim: Claim, product: Product): ClaimResult {
  const reasons: string[] = [];
  const evidence: string[] = [];
  let status: ClaimStatus = "PENDING";

  const issued = db.ledger.find((e) => e.type === "CLAIM_ISSUED" && e.subjectId === claim.id);
  const tampered = !issued || issued.data.claimHash !== claimHash(claim);
  const independent = claim.attestations.filter((a) => {
    const aud = db.actors.find((x) => x.id === a.auditorId);
    return aud && aud.role === "auditor" && aud.id !== claim.issuerId;
  });
  const approvals = independent.filter((a) => a.verdict === "APPROVE");
  const rejections = independent.filter((a) => a.verdict === "REJECT");

  switch (claim.kind) {
    case "RECYCLED_CONTENT": {
      const claimed = Number(claim.value);
      const proven = provenRecycledPct(db, product);
      const closed = materialLines(db, product).filter((l) => l.closedLoop);
      evidence.push(`Batch lineage proves ${fmt(proven)}% recycled content by mass`);
      if (closed.length) evidence.push(`${closed.length} input lot(s) recovered from earlier Orbit products (closed loop)`);
      if (claimed <= proven + 0.5) status = "VERIFIED";
      else {
        status = "CONTRADICTED";
        reasons.push(`Claims ${fmt(claimed, 0)}% but ledger only supports ${fmt(proven)}%`);
      }
      break;
    }
    case "CARBON_FOOTPRINT": {
      const claimed = Number(claim.value);
      const cf = carbonFootprint(db, product);
      evidence.push(`Ledger-derived footprint ${fmt(cf.total, 2)} kg CO2e (materials ${fmt(cf.materials, 2)}, factory ${fmt(cf.manufacturing, 2)}, transport ${fmt(cf.transport, 3)})`);
      // Understating the footprint by more than 10% is a contradiction. Overstating is conservative.
      if (claimed >= cf.total * 0.9) status = "VERIFIED";
      else {
        status = "CONTRADICTED";
        reasons.push(`Claims ${fmt(claimed, 2)} kg but ledger shows ${fmt(cf.total, 2)} kg (${fmt((1 - claimed / cf.total) * 100, 0)}% understated)`);
      }
      break;
    }
    case "ORIGIN": {
      const made = lifecycleEntries(db, product.id).find((e) => e.type === "MANUFACTURED");
      const country = made?.place?.country;
      evidence.push(`Manufacture event signed at ${made?.place?.city ?? "?"}, ${country ?? "?"}`);
      if (country && country === String(claim.value)) status = "VERIFIED";
      else {
        status = "CONTRADICTED";
        reasons.push(`Claims origin ${claim.value} but manufacture was recorded in ${country}`);
      }
      break;
    }
    case "ETHICAL_LABOR": {
      // Labour conditions cannot be derived from logistics data: needs an independent audit.
      if (approvals.length) {
        status = "VERIFIED";
        for (const a of approvals) evidence.push(`Audited by ${getActor(db, a.auditorId).name}: ${a.note}`);
      } else reasons.push("Awaiting an independent auditor attestation");
      break;
    }
    case "REPAIRABILITY": {
      const repairs = lifecycleEntries(db, product.id).filter((e) => e.type === "REPAIRED");
      if (Number(claim.value) > product.repairabilityScore) {
        status = "CONTRADICTED";
        reasons.push(`Claims ${claim.value}/10 but passport declares ${product.repairabilityScore}/10`);
      } else if (repairs.length || approvals.length) {
        status = "VERIFIED";
        if (repairs.length) evidence.push(`${repairs.length} independent repair(s) recorded on the ledger`);
      } else reasons.push("No repair or audit evidence yet");
      break;
    }
  }

  if (rejections.length) {
    status = "CONTRADICTED";
    for (let i = reasons.length - 1; i >= 0; i--) if (/^(Awaiting|No repair)/.test(reasons[i])) reasons.splice(i, 1);
    for (const r of rejections) reasons.push(`Rejected by ${getActor(db, r.auditorId).name}: ${r.note}`);
  } else if (status !== "CONTRADICTED" && approvals.length && claim.kind !== "ETHICAL_LABOR") {
    for (const a of approvals) evidence.push(`Co-signed by ${getActor(db, a.auditorId).name}`);
  }
  if (tampered) {
    status = "CONTRADICTED";
    reasons.unshift("Claim record differs from what was signed on the ledger");
  }
  return { claim, status, reasons, evidence, lint: lintClaim(claim.statement), tampered };
}

export interface TrustReport {
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "E";
  claims: ClaimResult[];
  integrity: { ok: boolean; badEntries: number; passportTampered: boolean };
  summary: string;
}

export function trustReport(db: Db, product: Product, ledgerReport?: IntegrityReport): TrustReport {
  const report = ledgerReport ?? verifyLedger(db);
  // A product is only as trustworthy as its own events AND the material lots it was made from.
  const lotIds = new Set(product.inputs.map((i) => i.batchId));
  const entries = [...productEntries(db, product.id), ...db.ledger.filter((e) => e.type === "BATCH_CREATED" && lotIds.has(e.subjectId))];
  const badEntries = entries.filter((e) => report.badIndexes.has(e.index)).length;
  const made = lifecycleEntries(db, product.id).find((e) => e.type === "MANUFACTURED");
  const passportTampered = !made || made.data.passportHash !== passportHash(product);

  const claims = db.claims.filter((c) => c.productId === product.id).map((c) => evaluateClaim(db, c, product));
  const verified = claims.filter((c) => c.status === "VERIFIED").length;
  const contradicted = claims.filter((c) => c.status === "CONTRADICTED").length;
  const highLint = claims.reduce((s, c) => s + c.lint.filter((l) => l.severity === "high").length, 0);

  let score = 35; // base: product has a signed passport
  if (claims.length) score += (verified / claims.length) * 45;
  score += Math.min(lifecycleEntries(db, product.id).length, 5) * 4; // traceability depth
  score -= contradicted * 25 + highLint * 5;
  if (badEntries || passportTampered) score = Math.min(score, 10);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : score >= 30 ? "D" : "E";

  let summary: string;
  if (badEntries || passportTampered) summary = "Tampering detected: records no longer match their signatures.";
  else if (contradicted) summary = `${contradicted} claim${contradicted > 1 ? "s are" : " is"} contradicted by the supply chain data.`;
  else if (claims.length && verified === claims.length) summary = "Every sustainability claim is backed by signed supply chain evidence.";
  else if (claims.length) summary = `${verified} of ${claims.length} claims verified; others await evidence.`;
  else summary = "Traceable product with no sustainability claims yet.";

  return { score, grade, claims, integrity: { ok: !badEntries && !passportTampered, badEntries, passportTampered }, summary };
}
