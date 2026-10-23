// A reproducible demo world. Every record below is created through the same validated
// actions the API uses, so the seeded ledger is fully signed and verifiable.
// Calls are in chronological order so ledger timestamps only move forward.
import { anchor, attestClaim, createBatch, issueClaim, manufacture, receive, recycle, repair, returnForRecycling, sell, ship, PROTOCOL_ID } from "./actions.ts";
import { publicKeyFor } from "./crypto.ts";
import type { Actor, Db, Role } from "./types.ts";

function actor(id: string, name: string, role: Role, city: string, country: string, lat: number, lng: number, description: string): Actor {
  return { id, name, role, place: { city, country, lat, lng }, publicKey: publicKeyFor(id), description };
}

export const ACTORS: Actor[] = [
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

export function seedDb(): Db {
  const db: Db = { version: 1, actors: ACTORS.map((a) => ({ ...a })), batches: [], products: [], claims: [], ledger: [], checkpoints: [] };

  // --- raw material lots ---
  const cotton = createBatch(db, { producerId: "kutch-coop", material: "organic-cotton", massKg: 500, at: d("01-03T08:00:00") });
  const pet = createBatch(db, { producerId: "pacific-polymers", material: "polyester", massKg: 300, at: d("01-04T08:00:00") });
  const rpet = createBatch(db, { producerId: "refibre", material: "polyester", massKg: 200, recycledKg: 200, at: d("01-05T08:00:00") });
  const lfp = createBatch(db, { producerId: "atacama-minerals", material: "lithium-iron-phosphate", massKg: 2000, at: d("01-06T08:00:00") });
  const alu = createBatch(db, { producerId: "nordal", material: "aluminium", massKg: 1000, at: d("01-07T08:00:00") });
  const copper = createBatch(db, { producerId: "atacama-minerals", material: "copper", massKg: 300, at: d("01-07T09:00:00") });
  const ralu = createBatch(db, { producerId: "circuloop", material: "aluminium", massKg: 400, recycledKg: 400, at: d("01-08T08:00:00") });

  // --- 1. An honest product: every claim checks out ---
  const tee = manufacture(db, {
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
    at: d("01-15T09:00:00"),
  });
  issueClaim(db, { productId: tee.id, issuerId: "lumen", kind: "RECYCLED_CONTENT", value: 40, statement: "40% recycled polyester, 60% organic cotton", at: d("01-15T10:00:00") });
  issueClaim(db, { productId: tee.id, issuerId: "lumen", kind: "CARBON_FOOTPRINT", value: 1.8, statement: "1.8 kg CO2e from field to shelf", at: d("01-15T10:01:00") });
  issueClaim(db, { productId: tee.id, issuerId: "lumen", kind: "ORIGIN", value: "BD", statement: "Cut, made and trimmed in Dhaka, Bangladesh", at: d("01-15T10:02:00") });
  const teeLabor = issueClaim(db, {
    productId: tee.id,
    issuerId: "lumen",
    kind: "ETHICAL_LABOR",
    value: "SA8000",
    statement: "Made in an SA8000-certified factory paying audited living wages",
    evidence: "SA8000 certificate #BD-2025-1182",
    at: d("01-15T10:03:00"),
  });
  attestClaim(db, { claimId: teeLabor.id, auditorId: "clearsight", verdict: "APPROVE", note: "Unannounced site audit, wage records reconciled", at: d("01-17T14:00:00") });
  ship(db, { productId: tee.id, actorId: "lumen", toId: "bluewake", mode: "ship", at: d("01-18T10:00:00") });
  receive(db, { productId: tee.id, actorId: "bluewake", at: d("01-27T07:00:00") });
  ship(db, { productId: tee.id, actorId: "bluewake", toId: "greenloop", mode: "truck", at: d("01-28T09:00:00") });
  receive(db, { productId: tee.id, actorId: "greenloop", at: d("01-28T15:00:00") });
  sell(db, { productId: tee.id, actorId: "greenloop", toId: "priya", at: d("02-05T12:30:00") });

  // --- 2. A greenwashing product: the ledger contradicts the marketing ---
  const hoodie = manufacture(db, {
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
    at: d("02-08T09:00:00"),
  });
  issueClaim(db, { productId: hoodie.id, issuerId: "lumen", kind: "RECYCLED_CONTENT", value: 70, statement: "Made from 70% recycled materials. 100% eco-friendly!", at: d("02-08T10:00:00") });
  issueClaim(db, { productId: hoodie.id, issuerId: "lumen", kind: "CARBON_FOOTPRINT", value: 1.2, statement: "Carbon neutral: only 1.2 kg CO2e", at: d("02-08T10:01:00") });
  const hoodieLabor = issueClaim(db, { productId: hoodie.id, issuerId: "lumen", kind: "ETHICAL_LABOR", value: "SA8000", statement: "Ethically made", at: d("02-08T10:02:00") });
  ship(db, { productId: hoodie.id, actorId: "lumen", toId: "greenloop", mode: "air", at: d("02-09T09:00:00") });
  receive(db, { productId: hoodie.id, actorId: "greenloop", at: d("02-10T09:00:00") });
  attestClaim(db, { claimId: hoodieLabor.id, auditorId: "clearsight", verdict: "REJECT", note: "Fleece made at unregistered subcontractor; overtime records missing", at: d("02-12T11:00:00") });

  // --- 3. A battery that lives a full life: used, repaired, returned, recycled ---
  const battery = manufacture(db, {
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
    at: d("02-15T09:00:00"),
  });
  const batteryCarbon = issueClaim(db, { productId: battery.id, issuerId: "kestrel", kind: "CARBON_FOOTPRINT", value: 48, statement: "48 kg CO2e cradle-to-shelf, per EU Battery Regulation method", at: d("02-15T10:00:00") });
  issueClaim(db, { productId: battery.id, issuerId: "kestrel", kind: "REPAIRABILITY", value: 8, statement: "Repairability 8/10: BMS and cells replaceable with standard tools", at: d("02-15T10:01:00") });
  issueClaim(db, { productId: battery.id, issuerId: "kestrel", kind: "ORIGIN", value: "DE", statement: "Assembled in Munich, Germany", at: d("02-15T10:02:00") });
  attestClaim(db, { claimId: batteryCarbon.id, auditorId: "clearsight", verdict: "APPROVE", note: "Footprint model reviewed against PEF battery rules", at: d("02-20T10:00:00") });
  ship(db, { productId: battery.id, actorId: "kestrel", toId: "bluewake", mode: "ship", at: d("02-21T09:00:00") });
  receive(db, { productId: battery.id, actorId: "bluewake", at: d("03-20T09:00:00") });
  ship(db, { productId: battery.id, actorId: "bluewake", toId: "greenloop", mode: "truck", at: d("03-21T09:00:00") });
  receive(db, { productId: battery.id, actorId: "greenloop", at: d("03-21T13:00:00") });
  sell(db, { productId: battery.id, actorId: "greenloop", toId: "leon", at: d("03-28T11:00:00") });
  repair(db, { productId: battery.id, actorId: "fixhub", note: "Replaced faulty BMS board; cells healthy (SoH 94%)", co2eKg: 0.4, at: d("06-10T16:00:00") });
  returnForRecycling(db, { productId: battery.id, actorId: "leon", toId: "circuloop", at: d("09-02T10:00:00") });
  const { outputs } = recycle(db, { productId: battery.id, actorId: "circuloop", at: d("09-20T10:00:00") });

  // --- 4. Closed loop: a new battery built from the recovered material ---
  const rec = (m: string) => {
    const o = outputs.find((x) => x.material === m);
    if (!o) throw new Error(`seed: no recovered ${m}`);
    return o;
  };
  const loop = manufacture(db, {
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
    at: d("10-10T09:00:00"),
  });
  const loopRecycled = issueClaim(db, {
    productId: loop.id,
    issuerId: "kestrel",
    kind: "RECYCLED_CONTENT",
    value: 90,
    statement: "90% of cell and housing material recovered from returned Strata packs",
    at: d("10-10T10:00:00"),
  });
  issueClaim(db, { productId: loop.id, issuerId: "kestrel", kind: "CARBON_FOOTPRINT", value: 17, statement: "17 kg CO2e, about 65% lower than the first-generation pack", at: d("10-10T10:01:00") });
  attestClaim(db, { claimId: loopRecycled.id, auditorId: "clearsight", verdict: "APPROVE", note: "Mass balance of recovered lots reconciled with CircuLoop output records", at: d("10-14T10:00:00") });
  ship(db, { productId: loop.id, actorId: "kestrel", toId: "bluewake", mode: "ship", at: d("10-18T09:00:00") });

  anchor(db, { at: d("10-20T00:00:00") });
  return db;
}
