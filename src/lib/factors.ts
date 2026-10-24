import type { Material, TransportMode } from "./types.ts";

// Emission factors, each with its source. The README's "Emission factors" table lists them with links.
// They are published averages: real accounting would replace them with supplier-specific data.

export interface MaterialFactor {
  label: string;
  /** kg CO2e per kg, cradle-to-gate. */
  virgin: number;
  recycled: number;
  recoveryRate: number;
  source: string;
}

export const MATERIAL_FACTORS: Record<Material, MaterialFactor> = {
  "organic-cotton": { label: "Organic cotton", virgin: 1.5, recycled: 0.8, recoveryRate: 0.75, source: "Textile Exchange/Sphera, LCA for Cotton (2026), Table 5-2: India organic 1.46; recycled cotton Table 5-7: 0.79 post-consumer" },
  cotton: { label: "Conventional cotton", virgin: 1.8, recycled: 0.8, recoveryRate: 0.75, source: "Textile Exchange, LCA of Organic Cotton Fiber (2014), p.10: conventional 1.81; recycled as above" },
  polyester: { label: "Polyester (PET)", virgin: 5.5, recycled: 3.0, recoveryRate: 0.85, source: "Textile Exchange/SCS, LCA for Polyester (2026), Tables E-2 to E-6: virgin POY 5.44 / DTY 5.83 yarn; recycled PET staple fibre 3.04" },
  aluminium: { label: "Aluminium", virgin: 14.8, recycled: 0.6, recoveryRate: 0.95, source: "International Aluminium Institute (2024): primary 14.8 t CO2e/t (2023); recycling 0.52 t/t gate-to-gate, plus scrap collection" },
  "lithium-iron-phosphate": { label: "LFP cathode cells", virgin: 9.4, recycled: 3.1, recoveryRate: 0.9, source: "Llamas-Orozco et al., PNAS Nexus 2(11) (2023): 56 kg CO2e/kWh at ~0.165 kWh/kg; recycled value is our estimate (no primary source)" },
  copper: { label: "Copper", virgin: 4.0, recycled: 0.8, recoveryRate: 0.95, source: "International Copper Association, Copper Environmental Profile (2023), Table 4: 3.97 t/t cathode; recycled value is our estimate" },
  steel: { label: "Steel", virgin: 2.3, recycled: 0.7, recoveryRate: 0.9, source: "worldsteel, Sustainability Indicators (2025): BF-BOF 2.34, scrap EAF 0.69 t CO2/t" },
  "abs-plastic": { label: "ABS plastic", virgin: 3.1, recycled: 1.4, recoveryRate: 0.7, source: "Franklin Associates for ACC, Cradle-to-Gate LCA of ABS Resin (2022), Table 7: 2.88 t/t; recycled value is our estimate" },
};

/**
 * Garment processing between fibre and factory gate, kg CO2e per kg of textile, for knitted apparel on
 * a global-average production grid. These stages are usually the largest part of a garment's footprint,
 * so they are modelled from published defaults rather than left to the factory to self-report.
 * Source: Cotton Incorporated / thinkstep, LCA Update of Cotton Fiber and Fabric (2017), Table 4-4
 * (knit fabric): yarn 4.23; knitting 0.39; preparation 0.74 + dyeing 2.57 + finishing 2.09 + compaction 0.16.
 * Polyester filament yarn is already included in its material factor, so it gets no spinning adder;
 * dyeing polyester uses about the same energy (Sandin et al. 2019, Mistra Future Fashion, Table 3.4).
 */
export const TEXTILE_PROCESSING = {
  spinning: { "organic-cotton": 4.2, cotton: 4.2, polyester: 0 } as Partial<Record<Material, number>>,
  knitting: 0.4,
  wetProcessing: 5.6,
  /** ~15% of fabric is lost in cutting (Sandin et al. 2019, p.53), so upstream stages scale by 1/0.85. */
  cuttingWaste: 1 / 0.85,
  source: "Cotton Incorporated/thinkstep, LCA Update of Cotton Fiber and Fabric (2017), Table 4-4; Sandin et al., Mistra Future Fashion 2019:05",
};

export const TEXTILES: Material[] = ["organic-cotton", "cotton", "polyester"];

/**
 * kg CO2e per tonne-km, well-to-wheel. GLEC Framework v3.0 (2023): EU heavy truck 115 g (p.91);
 * EU diesel rail 30 g (p.88); container shipping industry average 89 g/TEU-km at 10 t/TEU (p.98-99),
 * applied to sea-route distance; air freight long-haul (>1,500 km) unknown aircraft 817 g (Table 1, p.85).
 */
export const TRANSPORT_FACTORS: Record<TransportMode, number> = {
  truck: 0.115,
  rail: 0.03,
  ship: 0.009,
  air: 0.82,
};
/** Short-haul air (≤1,500 km), GLEC v3.0 Table 1: 1,359 g/t-km. */
export const AIR_SHORT_HAUL_FACTOR = 1.36;

/**
 * Generous upper bounds on door-to-door distance per day (great-circle km), used to test a declared
 * transport mode against the recipient's signed arrival time. Deliberately loose so honest
 * shipments never trip them:
 *  - ship: a fast container ship at ~20 knots covers ~900 km/day, and real routes are longer than great-circle
 *  - rail: freight trains rarely exceed ~1,200 km/day including stops
 *  - truck: a two-driver team running ~20 h at ~80 km/h is ~1,600 km/day
 *  - air: ~900 km/h cruise; anything faster is impossible
 */
export const MAX_KM_PER_DAY: Record<TransportMode, number> = {
  ship: 900,
  rail: 1200,
  truck: 1600,
  air: 20000,
};

/** Credits paid per kg of material recovered at recycling, split between returner and recycler. */
export const CREDITS_PER_KG_RECOVERED = 20;

type Pt = { lat: number; lng: number };

export function haversineKm(a: Pt, b: Pt): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// Sea-lane waypoints for Europe-Asia shipping (GLEC asks for the shortest feasible distance).
const GIBRALTAR: Pt = { lat: 35.95, lng: -5.6 };
const PORT_SAID: Pt = { lat: 31.26, lng: 32.31 };
const BAB_EL_MANDEB: Pt = { lat: 12.6, lng: 43.4 };
const inEurope = (p: Pt) => p.lat > 35 && p.lng > -12 && p.lng < 30;
const eastOfSuez = (p: Pt) => p.lng > 45;

function path(points: Pt[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);
  return km;
}

/**
 * Distance actually travelled, by mode (GLEC Framework v3.0 distance rules):
 *  - air: great-circle distance + 95 km (GLEC p.38)
 *  - truck / rail: great-circle × 1.2, a road detour index at the low end of the published
 *    1.2-1.6 range (Boscoe et al. 2012, Professional Geographer 64(2))
 *  - ship: Europe-Asia legs follow the sea lane via Gibraltar (northern Europe), Suez and Bab-el-Mandeb;
 *    other legs use great-circle distance, a lower bound.
 */
export function routeKm(mode: TransportMode, a: Pt, b: Pt): number {
  const gcd = haversineKm(a, b);
  if (mode === "air") return gcd + 95;
  if (mode === "truck" || mode === "rail") return Math.round(gcd * 1.2);
  const [eu, asia] = inEurope(a) && eastOfSuez(b) ? [a, b] : inEurope(b) && eastOfSuez(a) ? [b, a] : [null, null];
  if (!eu || !asia) return gcd;
  const legs = eu.lat > 43 ? [eu, GIBRALTAR, PORT_SAID, BAB_EL_MANDEB, asia] : [eu, PORT_SAID, BAB_EL_MANDEB, asia];
  return path(legs);
}

/** kg CO2e per tonne-km for a mode over a given great-circle distance (air depends on haul length). */
export function transportFactor(mode: TransportMode, gcdKm: number): number {
  return mode === "air" && gcdKm <= 1500 ? AIR_SHORT_HAUL_FACTOR : TRANSPORT_FACTORS[mode];
}
