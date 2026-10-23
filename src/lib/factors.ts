import type { Material, TransportMode } from "./types.ts";

/**
 * Illustrative emission factors (kg CO2e per kg material, cradle-to-gate).
 * Ballpark values drawn from public LCA literature (e.g. Ecoinvent summaries, Textile Exchange,
 * International Aluminium Institute). They are for demonstration, not certified accounting.
 */
export const MATERIAL_FACTORS: Record<Material, { label: string; virgin: number; recycled: number; recoveryRate: number }> = {
  "organic-cotton": { label: "Organic cotton", virgin: 3.8, recycled: 1.1, recoveryRate: 0.75 },
  cotton: { label: "Conventional cotton", virgin: 5.9, recycled: 1.1, recoveryRate: 0.75 },
  polyester: { label: "Polyester (PET)", virgin: 5.5, recycled: 1.9, recoveryRate: 0.85 },
  aluminium: { label: "Aluminium", virgin: 16.1, recycled: 0.9, recoveryRate: 0.95 },
  "lithium-iron-phosphate": { label: "LFP cathode cells", virgin: 9.4, recycled: 3.1, recoveryRate: 0.9 },
  copper: { label: "Copper", virgin: 4.2, recycled: 0.8, recoveryRate: 0.95 },
  steel: { label: "Steel", virgin: 2.3, recycled: 0.7, recoveryRate: 0.9 },
  "abs-plastic": { label: "ABS plastic", virgin: 3.5, recycled: 1.4, recoveryRate: 0.7 },
};

/** kg CO2e per tonne-km (GLEC Framework style defaults). */
export const TRANSPORT_FACTORS: Record<TransportMode, number> = {
  truck: 0.105,
  rail: 0.028,
  ship: 0.016,
  air: 0.602,
};

/** Credits paid per kg of material recovered at recycling, split between returner and recycler. */
export const CREDITS_PER_KG_RECOVERED = 20;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
