import * as A from "@/lib/actions.ts";
import { handle } from "@/lib/api.ts";
import { restore, tamper } from "@/lib/demo.ts";
import { OrbitError } from "@/lib/domain.ts";
import { mutate, resetDb } from "@/lib/store.ts";
import type { Db } from "@/lib/types.ts";

// POST /api/actions/:action  — every write in Orbit goes through here.
// Bodies are passed to the validated action; timestamps are always server time.
/* eslint-disable @typescript-eslint/no-explicit-any */
const ACTIONS: Record<string, (db: Db, body: any) => unknown> = {
  "create-batch": (db, b) => A.createBatch(db, { producerId: b.producerId, material: b.material, massKg: Number(b.massKg), recycledKg: Number(b.recycledKg ?? 0) }),
  manufacture: (db, b) =>
    A.manufacture(db, {
      brandId: b.brandId,
      name: b.name,
      category: b.category,
      emoji: b.emoji,
      description: b.description,
      inputs: (b.inputs ?? []).map((i: any) => ({ batchId: String(i.batchId), massKg: Number(i.massKg) })),
      repairabilityScore: Number(b.repairabilityScore ?? 5),
      warrantyYears: Number(b.warrantyYears ?? 2),
      depositCredits: Number(b.depositCredits ?? 0),
      endOfLife: b.endOfLife,
      co2eKg: Number(b.co2eKg ?? 0),
    }),
  ship: (db, b) => A.ship(db, { productId: b.productId, actorId: b.actorId, toId: b.toId, mode: b.mode }),
  receive: (db, b) => A.receive(db, { productId: b.productId, actorId: b.actorId }),
  sell: (db, b) => A.sell(db, { productId: b.productId, actorId: b.actorId, toId: b.toId }),
  repair: (db, b) => A.repair(db, { productId: b.productId, actorId: b.actorId, note: String(b.note ?? "Repaired"), co2eKg: Number(b.co2eKg ?? 0) }),
  return: (db, b) => A.returnForRecycling(db, { productId: b.productId, actorId: b.actorId, toId: b.toId }),
  recycle: (db, b) => A.recycle(db, { productId: b.productId, actorId: b.actorId }),
  "issue-claim": (db, b) => A.issueClaim(db, { productId: b.productId, issuerId: b.issuerId, kind: b.kind, statement: b.statement, value: b.value, evidence: b.evidence || undefined }),
  attest: (db, b) => A.attestClaim(db, { claimId: b.claimId, auditorId: b.auditorId, verdict: b.verdict === "REJECT" ? "REJECT" : "APPROVE", note: String(b.note ?? "") }),
  redeem: (db, b) => A.redeem(db, { actorId: b.actorId, rewardId: b.rewardId }),
  anchor: (db) => A.anchor(db),
  tamper: (db, b) => tamper(db, Number(b.index)),
  restore: (db) => restore(db),
};

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  return handle(async () => {
    const body = await req.json().catch(() => ({}));
    if (action === "reset") {
      resetDb();
      return { ok: true };
    }
    const fn = ACTIONS[action];
    if (!fn) throw new OrbitError(`Unknown action ${action}`, 404);
    return mutate((db) => fn(db, body));
  });
}
