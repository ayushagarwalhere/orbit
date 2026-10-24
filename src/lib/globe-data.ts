// Data for the hero globe: every registered party's location, and the routes products actually took
// on the ledger (material lots to factory, signed shipments, returns to recyclers, recycled lots
// back into new products). Legs whose declared mode the recipient's signed receipt rules out are flagged.
import { getActor, lifecycleEntries, materialLines, shipmentLegs } from "./domain.ts";
import type { Db, Role } from "./types.ts";

export interface GlobeNode {
  lat: number;
  lng: number;
  city: string;
  country: string;
  parties: { name: string; role: Role }[];
}

export interface GlobeRoute {
  from: [number, number]; // [lat, lng]
  to: [number, number];
  kind: "material" | "shipment" | "flagged" | "loop";
  label: string;
}

export function globeData(db: Db): { nodes: GlobeNode[]; routes: GlobeRoute[] } {
  const byPlace = new Map<string, GlobeNode>();
  for (const a of db.actors) {
    if (a.role === "protocol" || a.id.startsWith("guest-")) continue;
    const key = `${a.place.lat.toFixed(1)},${a.place.lng.toFixed(1)}`;
    const n = byPlace.get(key) ?? { lat: a.place.lat, lng: a.place.lng, city: a.place.city, country: a.place.country, parties: [] };
    n.parties.push({ name: a.name, role: a.role });
    byPlace.set(key, n);
  }

  const routes = new Map<string, GlobeRoute>();
  const add = (r: GlobeRoute) => {
    if (r.from[0] === r.to[0] && r.from[1] === r.to[1]) return;
    const key = `${r.from}-${r.to}`;
    const prev = routes.get(key);
    // A flagged leg wins over a plain one on the same path.
    if (!prev || r.kind === "flagged") routes.set(key, r);
  };
  for (const p of db.products) {
    const factory = getActor(db, p.brandId).place;
    for (const l of materialLines(db, p)) {
      add({ from: [l.origin.lat, l.origin.lng], to: [factory.lat, factory.lng], kind: l.closedLoop || l.recycledKg > 0 ? "loop" : "material", label: `${l.label} for ${p.name}` });
    }
    for (const leg of shipmentLegs(db, p)) {
      const a = getActor(db, leg.from).place;
      const b = getActor(db, leg.to).place;
      const flagged = leg.check === "contradicted";
      add({
        from: [a.lat, a.lng],
        to: [b.lat, b.lng],
        kind: flagged ? "flagged" : "shipment",
        label: flagged ? `${p.name}: declared ${leg.declaredMode}, but ${Math.round(leg.distanceKm).toLocaleString("en")} km in ${Math.round(leg.transitHours ?? 0)} h means it flew` : `${p.name} shipped by ${leg.mode}`,
      });
    }
    for (const e of lifecycleEntries(db, p.id)) {
      if (e.type !== "RETURNED" || !e.place) continue;
      const to = getActor(db, String(e.data.to)).place;
      add({ from: [e.place.lat, e.place.lng], to: [to.lat, to.lng], kind: "loop", label: `${p.name} returned for recycling` });
    }
  }
  return { nodes: [...byPlace.values()], routes: [...routes.values()] };
}
