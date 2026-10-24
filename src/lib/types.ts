// Core domain model for Orbit.
// Loosely aligned with the UN Transparency Protocol (UNTP) Digital Product Passport
// and GS1 EPCIS 2.0 event vocabulary, simplified for a working prototype.

export type Role =
  | "supplier"
  | "manufacturer"
  | "logistics"
  | "retailer"
  | "consumer"
  | "repairer"
  | "recycler"
  | "auditor"
  | "protocol";

export interface Place {
  city: string;
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lng: number;
}

export interface Actor {
  id: string;
  name: string;
  role: Role;
  place: Place;
  publicKey: string; // hex Ed25519
  description: string;
}

export type Material =
  | "organic-cotton"
  | "cotton"
  | "polyester"
  | "aluminium"
  | "lithium-iron-phosphate"
  | "copper"
  | "steel"
  | "abs-plastic";

/** A lot of raw or recovered material. Recycled batches link back to the products they came from. */
export interface Batch {
  id: string;
  material: Material;
  massKg: number;
  recycledKg: number; // portion of massKg that is post-consumer recycled
  producerId: string;
  place: Place;
  createdAt: string;
  sourceProductIds: string[]; // products this batch was recovered from (closed loop)
}

export interface MaterialInput {
  batchId: string;
  massKg: number;
}

export interface Product {
  id: string; // passport id
  gtin: string;
  serial: string;
  name: string;
  category: "apparel" | "battery" | "electronics" | "packaging";
  emoji: string;
  brandId: string;
  description: string;
  inputs: MaterialInput[];
  repairabilityScore: number; // 0-10, per EU repairability index style
  warrantyYears: number;
  depositCredits: number; // credits paid back when product is returned for recycling
  endOfLife: string;
  createdAt: string;
}

export type ClaimKind =
  | "RECYCLED_CONTENT" // value: percent 0-100
  | "CARBON_FOOTPRINT" // value: kgCO2e (total cradle-to-gate + logistics)
  | "ORIGIN" // value: ISO country code of manufacture
  | "ETHICAL_LABOR" // value: standard name e.g. "SA8000"
  | "REPAIRABILITY"; // value: score 0-10

export interface Attestation {
  auditorId: string;
  verdict: "APPROVE" | "REJECT";
  note: string;
  at: string;
  entryHash: string;
}

export interface Claim {
  id: string;
  productId: string;
  kind: ClaimKind;
  statement: string; // marketing wording shown to consumers
  value: number | string;
  issuerId: string;
  evidenceHash?: string; // sha256 of supporting document
  createdAt: string;
  attestations: Attestation[];
}

export type EntryType =
  | "ACTOR_REGISTERED"
  | "BATCH_CREATED"
  | "MANUFACTURED"
  | "SHIPPED"
  | "RECEIVED"
  | "SOLD"
  | "REPAIRED"
  | "RETURNED"
  | "RECYCLED"
  | "CLAIM_ISSUED"
  | "CLAIM_ATTESTED"
  | "CREDIT_MINTED"
  | "CREDIT_REDEEMED"
  | "ANCHORED";

export type TransportMode = "truck" | "rail" | "ship" | "air";

/** What an actor actually authorised: signed in their own wallet/browser, never by the server. */
export interface ActionRequest {
  action: string;
  actorId: string;
  body: Record<string, unknown>;
  nonce: string;
  issuedAt: string;
}

export interface SignedRequest {
  request: ActionRequest;
  signature: string; // Ed25519 by the actor over sha256(canonical request)
}

/** One record in the append-only, hash-chained, signed ledger. */
export interface LedgerEntry {
  index: number;
  type: EntryType;
  subjectId: string; // product, batch, claim or actor id
  actorId: string; // who acted
  timestamp: string;
  place?: Place;
  data: Record<string, unknown>;
  auth?: SignedRequest; // the actor's own signed instruction that caused this entry
  prevHash: string;
  hash: string; // sha256(canonical body incl. prevHash and auth)
  signature: string; // Ed25519 by the sequencer (orbit-protocol) over hash: fixes order
}

export interface Checkpoint {
  covers: number; // number of ledger entries in the Merkle tree (indexes 0..covers-1)
  merkleRoot: string;
  at: string;
  onChain: boolean;
  chainId?: number;
  network: string;
  contract?: string;
  checkpointId?: number; // index in OrbitAnchor.checkpoints
  ledgerId?: string;
  submitter?: string; // EVM address that published it
  txHash?: string;
  blockNumber?: number;
  explorerTx?: string;
}

export interface Db {
  version: number;
  /** Random id of this ledger instance; groups its checkpoints on-chain (OrbitAnchor v2). */
  ledgerId?: string;
  actors: Actor[];
  batches: Batch[];
  products: Product[];
  claims: Claim[];
  ledger: LedgerEntry[];
  checkpoints: Checkpoint[];
  /** Demo only: original ledger before the tamper simulator edited it, so it can be restored. */
  tamper?: { index: number; mode: "edit" | "rewrite"; at: number; original: LedgerEntry[]; originalCheckpoints: Checkpoint[] };
}

export type LifecycleStage =
  | "manufactured"
  | "in-transit"
  | "in-stock"
  | "in-use"
  | "returned"
  | "recycled";
