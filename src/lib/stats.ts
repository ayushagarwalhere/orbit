import { avoidedCo2e, balances, carbonFootprint, custody, getActor, provenRecycledPct } from "./domain.ts";
import { verifyLedger } from "./ledger.ts";
import type { Db } from "./types.ts";
import { trustReport } from "./verify.ts";

export function overview(db: Db) {
  const integrity = verifyLedger(db);
  const products = db.products.map((p) => {
    const t = trustReport(db, p, integrity);
    return {
      product: p,
      brand: getActor(db, p.brandId),
      stage: custody(db, p.id).stage,
      trust: t,
      recycledPct: provenRecycledPct(db, p),
      co2e: carbonFootprint(db, p).total,
    };
  });
  const claims = products.flatMap((p) => p.trust.claims);
  const recoveredKg = db.ledger.filter((e) => e.type === "RECYCLED").reduce((s, e) => s + Number(e.data.recoveredKg ?? 0), 0);
  const credits = db.ledger.filter((e) => e.type === "CREDIT_MINTED").reduce((s, e) => s + Number(e.data.amount), 0);
  return {
    integrity,
    products,
    claimsVerified: claims.filter((c) => c.status === "VERIFIED").length,
    claimsContradicted: claims.filter((c) => c.status === "CONTRADICTED").length,
    claimsTotal: claims.length,
    recoveredKg,
    avoidedKg: db.products.reduce((s, p) => s + avoidedCo2e(db, p), 0),
    credits,
    balances: balances(db),
  };
}
