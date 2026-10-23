import type { Place } from "@/lib/types.ts";

// Lightweight equirectangular map: graticule, stops and curved routes. No tiles, no API keys.
const W = 720;
const H = 330;

interface View {
  west: number;
  east: number;
  north: number;
  south: number;
}

/** Fit the view to the stops (with padding), keeping the map's aspect ratio. */
function fitView(points: { lat: number; lng: number }[]): View {
  if (!points.length) return { west: -180, east: 180, north: 72, south: -40 };
  let west = Math.min(...points.map((p) => p.lng)) - 12;
  let east = Math.max(...points.map((p) => p.lng)) + 18;
  let north = Math.max(...points.map((p) => p.lat)) + 10;
  let south = Math.min(...points.map((p) => p.lat)) - 10;
  const aspect = W / H;
  if ((east - west) / (north - south) < aspect) {
    const want = (north - south) * aspect;
    const pad = (want - (east - west)) / 2;
    west -= pad;
    east += pad;
  } else {
    const want = (east - west) / aspect;
    const pad = (want - (north - south)) / 2;
    north += pad;
    south -= pad;
  }
  return { west, east, north, south };
}

export interface MapStop {
  place: Place;
  label: string;
  kind: "source" | "event" | "current";
}

export function WorldMap({ stops, routes }: { stops: MapStop[]; routes: [Place, Place][] }) {
  const unique = new Map<string, MapStop>();
  for (const s of stops) {
    const k = `${Math.round(s.place.lat)},${Math.round(s.place.lng)}`; // merge stops in the same metro area
    const prev = unique.get(k);
    if (!prev || s.kind === "current") unique.set(k, s);
  }
  const v = fitView(stops.map((s) => s.place));
  const project = (p: { lat: number; lng: number }) => ({
    x: ((p.lng - v.west) / (v.east - v.west)) * W,
    y: ((v.north - p.lat) / (v.north - v.south)) * H,
  });
  const step = v.east - v.west > 120 ? 30 : v.east - v.west > 50 ? 15 : 5;
  const lngs: number[] = [];
  for (let g = Math.ceil(v.west / step) * step; g <= v.east; g += step) lngs.push(g);
  const lats: number[] = [];
  for (let g = Math.ceil(v.south / step) * step; g <= v.north; g += step) lats.push(g);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Supply chain route map">
      <defs>
        <radialGradient id="map-glow" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#c8f169" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#c8f169" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} rx="14" fill="#0d1411" />
      <rect width={W} height={H} rx="14" fill="url(#map-glow)" />
      {lngs.map((lng) => {
        const { x } = project({ lat: 0, lng });
        return <line key={`g${lng}`} x1={x} x2={x} y1={0} y2={H} stroke="#ffffff" strokeOpacity="0.06" strokeWidth="0.6" strokeDasharray="1 4" />;
      })}
      {lats.map((lat) => {
        const { y } = project({ lat, lng: 0 });
        return <line key={`t${lat}`} x1={0} x2={W} y1={y} y2={y} stroke="#ffffff" strokeOpacity={lat === 0 ? 0.14 : 0.06} strokeWidth="0.6" strokeDasharray={lat === 0 ? "4 4" : "1 4"} />;
      })}
      {routes.map(([a, b], i) => {
        const p = project(a);
        const q = project(b);
        if (Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) < 1) return null;
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2 - Math.min(60, Math.hypot(q.x - p.x, q.y - p.y) * 0.25);
        return <path key={i} className="route" style={{ animationDelay: `${i * 0.15}s` }} pathLength={1000} d={`M${p.x},${p.y} Q${mx},${my} ${q.x},${q.y}`} fill="none" stroke="#c8f169" strokeWidth="1.4" strokeOpacity="0.8" strokeLinecap="round" />;
      })}
      {[...unique.entries()].map(([key, s]) => {
        const { x, y } = project(s.place);
        const color = s.kind === "source" ? "#e0b77a" : s.kind === "current" ? "#c8f169" : "#edf2ec";
        return (
          <g key={key}>
            {s.kind === "current" && <circle cx={x} cy={y} r="5" fill="none" stroke={color} strokeWidth="1.5" className="pulse" />}
            <circle cx={x} cy={y} r="4" fill={color} stroke="#0d1411" strokeWidth="2" />
            <text x={x + 8} y={y + 4} fontSize="11" fill="#edf2ec" fontWeight="500" paintOrder="stroke" stroke="#0d1411" strokeWidth="3" fontFamily="var(--font-geist)">
              {s.place.city}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
