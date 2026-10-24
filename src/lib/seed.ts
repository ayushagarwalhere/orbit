// A reproducible demo world. Every record below is created through the same validated
// actions the API uses, so the seeded ledger is fully signed and verifiable.
// Calls are in chronological order so ledger timestamps only move forward.
import { PROTOCOL_ID, newRequest, signRequest } from "./auth.ts";
import { sha256Hex } from "./crypto.ts";
import { applyAction } from "./dispatch.ts";
import { publicKeys, type Keystore } from "./keys.ts";
import { emptyDb } from "./replay.ts";
import type { Actor, Db, Role } from "./types.ts";

type ActorSeed = Omit<Actor, "publicKey">;
function actor(id: string, name: string, role: Role, city: string, country: string, lat: number, lng: number, description: string): ActorSeed {
  return { id, name, role, place: { city, country, lat, lng }, description };
}

export const ACTORS: ActorSeed[] = [
  actor(PROTOCOL_ID, "Orbit Protocol", "protocol", "Singapore", "SG", 1.3521, 103.8198, "Mints circularity credits and anchors ledger checkpoints."),
  actor("kutch-coop", "Kutch Organic Cotton Co-op", "supplier", "Bhuj", "IN", 23.242, 69.6669, "Farmer cooperative growing rain-fed organic cotton."),
  actor("pacific-polymers", "Pacific Polymers", "supplier", "Ho Chi Minh City", "VN", 10.8231, 106.6297, "Virgin PET resin and polyester yarn producer."),
  actor("atacama-minerals", "Atacama Minerals", "supplier", "Antofagasta", "CL", -23.6509, -70.3975, "Battery-grade lithium iron phosphate and copper."),
  actor("nordal", "Nordal Aluminium", "supplier", "Sunndalsøra", "NO", 62.676, 8.56, "Hydro-powered primary aluminium smelter."),
  actor("lumen", "Lumen Apparel", "manufacturer", "Dhaka", "BD", 23.8103, 90.4125, "Apparel brand and cut-make-trim factory."),
  actor("kestrel", "Kestrel Mobility", "manufacturer", "Munich", "DE", 48.1351, 11.582, "E-bike battery packs designed for disassembly."),
  actor("bluewake", "BlueWake Logistics", "logistics", "Singapore", "SG", 1.264, 103.84, "Ocean and last-mile freight hub."),
  actor("greenloop", "GreenLoop Market", "retailer", "Singapore", "SG", 1.3006, 103.8559, "Retailer stocking passport-enabled products."),
  actor("priya", "Priya S.", "consumer", "Jurong East", "SG", 1.3329, 103.7436, "Consumer."),
  actor("leon", "Leon T.", "consumer", "Tampines", "SG", 1.3521, 103.9447, "Consumer and e-bike commuter."),
  actor("fixhub", "FixHub Repair Café", "repairer", "Singapore", "SG", 1.3138, 103.8636, "Community repair workshop."),
  actor("refibre", "Re:Fibre Recyclers", "recycler", "Rotterdam", "NL", 51.9244, 4.4777, "Fibre-to-fibre textile and PET recycler."),
  actor("circuloop", "CircuLoop Metals", "recycler", "Antwerp", "BE", 51.1757, 4.3417, "Battery and metals recovery plant."),
  actor("clearsight", "ClearSight Assurance", "auditor", "Geneva", "CH", 46.2044, 6.1432, "Independent social and environmental auditor."),
];

const d = (s: string) => new Date(`2026-${s}Z`).toISOString();

export const ACTOR_IDS = ACTORS.map((a) => a.id);

/**
 * Builds the demo world. Every action is an instruction signed with the acting party's own key and
 * applied through the same dispatch path as live API traffic, so replaying the ledger reproduces
 * it byte for byte. Deterministic for a given keystore and ledger id.
 */
export function seedDb(keys: Keystore, ledgerId: string): Db {
  const pub = publicKeys(keys);
  const db = emptyDb();

  /** Apply `action` as `actorId`, authorised by an instruction that actor signed at time `at`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function as(actorId: string, action: string, at: string, body: Record<string, any>): any {
    const req = newRequest(action, actorId, body, ledgerId, at, sha256Hex(`seed:${ledgerId}:${actorId}:${action}:${at}`).slice(0, 24));
    return applyAction({ db, sequencerKey: keys[PROTOCOL_ID], auth: signRequest(req, keys[actorId]), at }, action, actorId, body);
  }

  // --- identities: every actor publishes its key on the ledger (self-signed); the protocol first (genesis) ---
  for (const a of ACTORS) {
    as(a.id, "register-actor", d("01-01T00:00:00"), {
      actorId: a.id,
      publicKey: pub[a.id],
      name: a.name,
      role: a.role,
      place: a.place,
      description: a.description,
      ...(a.id === PROTOCOL_ID ? { ledgerId } : {}),
    });
  }

  // --- raw material lots ---
  const cotton = as("kutch-coop", "create-batch", d("01-03T08:00:00"), { producerId: "kutch-coop", material: "organic-cotton", massKg: 500 });
  const pet = as("pacific-polymers", "create-batch", d("01-04T08:00:00"), { producerId: "pacific-polymers", material: "polyester", massKg: 300 });
  const rpet = as("refibre", "create-batch", d("01-05T08:00:00"), { producerId: "refibre", material: "polyester", massKg: 200, recycledKg: 200 });
  const lfp = as("atacama-minerals", "create-batch", d("01-06T08:00:00"), { producerId: "atacama-minerals", material: "lithium-iron-phosphate", massKg: 2000 });
  const alu = as("nordal", "create-batch", d("01-07T08:00:00"), { producerId: "nordal", material: "aluminium", massKg: 1000 });
  const copper = as("atacama-minerals", "create-batch", d("01-07T09:00:00"), { producerId: "atacama-minerals", material: "copper", massKg: 300 });
  const ralu = as("circuloop", "create-batch", d("01-08T08:00:00"), { producerId: "circuloop", material: "aluminium", massKg: 400, recycledKg: 400 });

  // --- 1. An honest product: every claim checks out ---
  const tee = as("lumen", "manufacture", d("01-15T09:00:00"), {
    brandId: "lumen",
    name: "Orbit Tee",
    category: "apparel",
    emoji: "👕",
    description: "Organic cotton and recycled polyester tee. Single-fibre seams for easier recycling.",
    inputs: [
      { batchId: cotton.id, massKg: 0.15 },
      { batchId: rpet.id, massKg: 0.1 },
    ],
    repairabilityScore: 7,
    warrantyYears: 2,
    depositCredits: 20,
    endOfLife: "Drop at any GreenLoop store. Fibre-to-fibre recycled by Re:Fibre.",
    co2eKg: 0.9,
  });
  as("lumen", "issue-claim", d("01-15T10:00:00"), { productId: tee.id, issuerId: "lumen", kind: "RECYCLED_CONTENT", value: 40, statement: "40% recycled polyester, 60% organic cotton" });
  as("lumen", "issue-claim", d("01-15T10:01:00"), { productId: tee.id, issuerId: "lumen", kind: "CARBON_FOOTPRINT", value: 1.8, statement: "1.8 kg CO2e from field to shelf" });
  as("lumen", "issue-claim", d("01-15T10:02:00"), { productId: tee.id, issuerId: "lumen", kind: "ORIGIN", value: "BD", statement: "Cut, made and trimmed in Dhaka, Bangladesh" });
  const teeLabor = as("lumen", "issue-claim", d("01-15T10:03:00"), {
    productId: tee.id,
    issuerId: "lumen",
    kind: "ETHICAL_LABOR",
    value: "SA8000",
    statement: "Made in an SA8000-certified factory paying audited living wages",
    evidence: "SA8000 certificate #BD-2025-1182",
  });
  as("clearsight", "attest", d("01-17T14:00:00"), { claimId: teeLabor.id, auditorId: "clearsight", verdict: "APPROVE", note: "Unannounced site audit, wage records reconciled" });
  as("lumen", "ship", d("01-18T10:00:00"), { productId: tee.id, actorId: "lumen", toId: "bluewake", mode: "ship" });
  as("bluewake", "receive", d("01-27T07:00:00"), { productId: tee.id, actorId: "bluewake" });
  as("bluewake", "ship", d("01-28T09:00:00"), { productId: tee.id, actorId: "bluewake", toId: "greenloop", mode: "truck" });
  as("greenloop", "receive", d("01-28T15:00:00"), { productId: tee.id, actorId: "greenloop" });
  as("greenloop", "sell", d("02-05T12:30:00"), { productId: tee.id, actorId: "greenloop", toId: "priya" });

  // --- 2. A greenwashing product: the ledger contradicts the marketing ---
  // Lumen even declares sea freight, but GreenLoop signs for the delivery 24 h later: only possible by air.
  const hoodie = as("lumen", "manufacture", d("02-08T09:00:00"), {
    brandId: "lumen",
    name: "EcoCloud Hoodie",
    category: "apparel",
    emoji: "🧥",
    description: "Fleece hoodie marketed as recycled.",
    inputs: [
      { batchId: cotton.id, massKg: 0.45 },
      { batchId: pet.id, massKg: 0.25 },
      { batchId: rpet.id, massKg: 0.05 },
    ],
    repairabilityScore: 4,
    warrantyYears: 1,
    depositCredits: 20,
    co2eKg: 1.5,
  });
  as("lumen", "issue-claim", d("02-08T10:00:00"), { productId: hoodie.id, issuerId: "lumen", kind: "RECYCLED_CONTENT", value: 70, statement: "Made from 70% recycled materials. 100% eco-friendly!" });
  as("lumen", "issue-claim", d("02-08T10:01:00"), { productId: hoodie.id, issuerId: "lumen", kind: "CARBON_FOOTPRINT", value: 1.2, statement: "Carbon neutral: only 1.2 kg CO2e" });
  const hoodieLabor = as("lumen", "issue-claim", d("02-08T10:02:00"), { productId: hoodie.id, issuerId: "lumen", kind: "ETHICAL_LABOR", value: "SA8000", statement: "Ethically made" });
  as("lumen", "ship", d("02-09T09:00:00"), { productId: hoodie.id, actorId: "lumen", toId: "greenloop", mode: "ship" });
  as("greenloop", "receive", d("02-10T09:00:00"), { productId: hoodie.id, actorId: "greenloop" });
  as("clearsight", "attest", d("02-12T11:00:00"), { claimId: hoodieLabor.id, auditorId: "clearsight", verdict: "REJECT", note: "Fleece made at unregistered subcontractor; overtime records missing" });

  // --- 3. A battery that lives a full life: used, repaired, returned, recycled ---
  const battery = as("kestrel", "manufacture", d("02-15T09:00:00"), {
    brandId: "kestrel",
    name: "Strata 500 Wh E-bike Battery",
    category: "battery",
    emoji: "🔋",
    description: "LFP e-bike pack. Screwed (not glued) housing and swappable BMS board.",
    inputs: [
      { batchId: lfp.id, massKg: 2.6 },
      { batchId: alu.id, massKg: 0.9 },
      { batchId: copper.id, massKg: 0.3 },
    ],
    repairabilityScore: 8,
    warrantyYears: 3,
    depositCredits: 120,
    endOfLife: "Return to any partner. Cells and housing are recovered by CircuLoop.",
    co2eKg: 6.5,
  });
  const batteryCarbon = as("kestrel", "issue-claim", d("02-15T10:00:00"), { productId: battery.id, issuerId: "kestrel", kind: "CARBON_FOOTPRINT", value: 48, statement: "48 kg CO2e cradle-to-shelf, per EU Battery Regulation method" });
  as("kestrel", "issue-claim", d("02-15T10:01:00"), { productId: battery.id, issuerId: "kestrel", kind: "REPAIRABILITY", value: 8, statement: "Repairability 8/10: BMS and cells replaceable with standard tools" });
  as("kestrel", "issue-claim", d("02-15T10:02:00"), { productId: battery.id, issuerId: "kestrel", kind: "ORIGIN", value: "DE", statement: "Assembled in Munich, Germany" });
  as("clearsight", "attest", d("02-20T10:00:00"), { claimId: batteryCarbon.id, auditorId: "clearsight", verdict: "APPROVE", note: "Footprint model reviewed against PEF battery rules" });
  as("kestrel", "ship", d("02-21T09:00:00"), { productId: battery.id, actorId: "kestrel", toId: "bluewake", mode: "ship" });
  as("bluewake", "receive", d("03-20T09:00:00"), { productId: battery.id, actorId: "bluewake" });
  as("bluewake", "ship", d("03-21T09:00:00"), { productId: battery.id, actorId: "bluewake", toId: "greenloop", mode: "truck" });
  as("greenloop", "receive", d("03-21T13:00:00"), { productId: battery.id, actorId: "greenloop" });
  as("greenloop", "sell", d("03-28T11:00:00"), { productId: battery.id, actorId: "greenloop", toId: "leon" });
  as("fixhub", "repair", d("06-10T16:00:00"), { productId: battery.id, actorId: "fixhub", note: "Replaced faulty BMS board; cells healthy (SoH 94%)", co2eKg: 0.4 });
  as("leon", "return", d("09-02T10:00:00"), { productId: battery.id, actorId: "leon", toId: "circuloop" });
  const { outputs } = as("circuloop", "recycle", d("09-20T10:00:00"), { productId: battery.id, actorId: "circuloop", recovered: { "lithium-iron-phosphate": 2.34, aluminium: 0.855, copper: 0.285 } });

  // --- 4. Closed loop: a new battery built from the recovered material ---
  const rec = (m: string) => {
    const o = outputs.find((x: { material: string }) => x.material === m);
    if (!o) throw new Error(`seed: no recovered ${m}`);
    return o;
  };
  const loop = as("kestrel", "manufacture", d("10-10T09:00:00"), {
    brandId: "kestrel",
    name: "Strata 500 Wh Loop Edition",
    category: "battery",
    emoji: "♻️",
    description: "Built from cells and housing recovered from returned Strata packs.",
    inputs: [
      { batchId: rec("lithium-iron-phosphate").batchId, massKg: rec("lithium-iron-phosphate").massKg },
      { batchId: lfp.id, massKg: 0.26 },
      { batchId: rec("aluminium").batchId, massKg: rec("aluminium").massKg },
      { batchId: ralu.id, massKg: 0.045 },
      { batchId: rec("copper").batchId, massKg: rec("copper").massKg },
      { batchId: copper.id, massKg: 0.015 },
    ],
    repairabilityScore: 9,
    warrantyYears: 3,
    depositCredits: 120,
    endOfLife: "Return to any partner. Cells and housing are recovered by CircuLoop.",
    co2eKg: 5,
  });
  const loopRecycled = as("kestrel", "issue-claim", d("10-10T10:00:00"), {
    productId: loop.id,
    issuerId: "kestrel",
    kind: "RECYCLED_CONTENT",
    value: 90,
    statement: "90% of cell and housing material recovered from returned Strata packs",
  });
  const loopCarbon = as("kestrel", "issue-claim", d("10-10T10:01:00"), { productId: loop.id, issuerId: "kestrel", kind: "CARBON_FOOTPRINT", value: 17, statement: "17 kg CO2e, about 65% lower than the first-generation pack" });
  as("clearsight", "attest", d("10-14T10:00:00"), { claimId: loopRecycled.id, auditorId: "clearsight", verdict: "APPROVE", note: "Mass balance of recovered lots reconciled with CircuLoop output records" });
  as("clearsight", "attest", d("10-14T10:05:00"), { claimId: loopCarbon.id, auditorId: "clearsight", verdict: "APPROVE", note: "Factory energy reconciled against metered utility invoices" });
  as("kestrel", "ship", d("10-18T09:00:00"), { productId: loop.id, actorId: "kestrel", toId: "bluewake", mode: "ship" });

  return db;
}
