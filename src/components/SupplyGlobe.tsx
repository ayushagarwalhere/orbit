"use client";

import { useEffect, useRef, useState } from "react";
import type { GlobeNode, GlobeRoute } from "@/lib/globe-data.ts";
import { LAND_BITS, LAND_COLS, LAND_ROWS } from "@/lib/land-mask.ts";

// Interactive dotted globe drawn on a 2D canvas (orthographic projection, no 3D library):
// drag to spin, hover a city to see who signs there. Routes come from the ledger.

type V3 = [number, number, number];
const RAD = Math.PI / 180;
const ROLE_LABEL: Record<string, string> = { supplier: "Supplier", manufacturer: "Brand", logistics: "Carrier", retailer: "Retailer", consumer: "Consumer", repairer: "Repairer", recycler: "Recycler", auditor: "Auditor" };
const COLORS = { material: "200,241,105", shipment: "124,196,255", flagged: "255,122,102", loop: "94,224,160" } as const;

function toVec(lat: number, lng: number): V3 {
  const c = Math.cos(lat * RAD);
  return [c * Math.sin(lng * RAD), Math.sin(lat * RAD), c * Math.cos(lng * RAD)];
}

function landPoints(): V3[] {
  const bin = atob(LAND_BITS);
  const pts: V3[] = [];
  for (let r = 0; r < LAND_ROWS; r++) {
    const lat = 90 - (r + 0.5) * (180 / LAND_ROWS);
    // Thin out cells near the poles so dot density stays even on the sphere.
    const step = Math.max(1, Math.round(1 / Math.cos(lat * RAD)));
    for (let c = 0; c < LAND_COLS; c += step) {
      const i = r * LAND_COLS + c;
      if ((bin.charCodeAt(i >> 3) >> (i & 7)) & 1) pts.push(toVec(lat, -180 + (c + 0.5) * (360 / LAND_COLS)));
    }
  }
  return pts;
}

/** Great-circle arc between two unit vectors, lifted above the surface in the middle. */
function arc(a: V3, b: V3, steps = 40): V3[] {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  const lift = 0.06 + 0.22 * (omega / Math.PI);
  const out: V3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = Math.sin(omega) || 1;
    const k1 = Math.sin((1 - t) * omega) / s;
    const k2 = Math.sin(t * omega) / s;
    const h = 1 + lift * Math.sin(Math.PI * t);
    out.push([(a[0] * k1 + b[0] * k2) * h, (a[1] * k1 + b[1] * k2) * h, (a[2] * k1 + b[2] * k2) * h]);
  }
  return out;
}

export function SupplyGlobe({ nodes, routes, className }: { nodes: GlobeNode[]; routes: GlobeRoute[]; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    const box = wrap.current;
    if (!el || !box) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const land = landPoints();
    const nodeVecs = nodes.map((n) => toVec(n.lat, n.lng));
    const arcs = routes.map((r, i) => ({ r, pts: arc(toVec(...r.from), toVec(...r.to)), offset: (i * 0.37) % 1 }));

    // View: centred on the supply chain (South / Southeast Asia), tilted to show the north.
    let yaw = -88; // degrees of longitude brought to the centre (negated)
    let pitch = 18;
    let vYaw = 0;
    let vPitch = 0;
    let lastInput = -1e9;
    let size = 0;
    let dpr = 1;
    let raf = 0;
    let visible = true;
    let drag: { x: number; y: number; t: number } | null = null;
    let hover = -1;

    const resize = () => {
      const r = box.getBoundingClientRect();
      size = Math.min(r.width, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.round(size * dpr);
      el.height = Math.round(size * dpr);
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);

    // Rotate a vector into view space: spin around the vertical axis, then tilt.
    const project = (v: V3, cy: number, sy: number, cp: number, sp: number) => {
      const x1 = v[0] * cy + v[2] * sy;
      const z1 = -v[0] * sy + v[2] * cy;
      const y2 = v[1] * cp - z1 * sp;
      const z2 = v[1] * sp + z1 * cp;
      return [x1, y2, z2] as V3;
    };

    const draw = (time: number) => {
      const W = size * dpr;
      const c = W / 2;
      const R = W * 0.36;
      ctx.clearRect(0, 0, W, W);
      const cy = Math.cos(yaw * RAD);
      const sy = Math.sin(yaw * RAD);
      const cp = Math.cos(pitch * RAD);
      const sp = Math.sin(pitch * RAD);
      const sec = time / 1000;

      // Orbit ring: ledger fingerprints travelling to the chain. Back half first.
      const ringTilt = 72 * RAD;
      const ring = (a: number): V3 => {
        const x = Math.cos(a) * 1.32;
        const z = Math.sin(a) * 1.32;
        return [x, -z * Math.cos(ringTilt) * 0.35, z * Math.sin(ringTilt)];
      };
      const drawRing = (front: boolean) => {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= 120; i++) {
          const p = ring((i / 120) * Math.PI * 2);
          if (p[2] >= 0 !== front) {
            started = false;
            continue;
          }
          const X = c + p[0] * R;
          const Y = c - p[1] * R - R * 0.05;
          if (!started) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
          started = true;
        }
        ctx.strokeStyle = `rgba(237,242,236,${front ? 0.32 : 0.12})`;
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
        for (let k = 0; k < 5; k++) {
          const p = ring(sec * (reduced ? 0 : 0.35) + (k / 5) * Math.PI * 2);
          if (p[2] >= 0 !== front) continue;
          const X = c + p[0] * R;
          const Y = c - p[1] * R - R * 0.05;
          const s = (front ? 3.2 : 2.2) * dpr;
          ctx.fillStyle = front ? "rgba(200,241,105,0.95)" : "rgba(200,241,105,0.35)";
          ctx.fillRect(X - s, Y - s, s * 2, s * 2);
        }
      };
      drawRing(false);

      // Sphere body and rim light.
      const g = ctx.createRadialGradient(c - R * 0.35, c - R * 0.4, R * 0.1, c, c, R);
      g.addColorStop(0, "rgb(26,36,31)");
      g.addColorStop(1, "rgb(8,12,10)");
      ctx.beginPath();
      ctx.arc(c, c, R, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      const rim = ctx.createRadialGradient(c, c, R * 0.92, c, c, R * 1.18);
      rim.addColorStop(0, "rgba(200,241,105,0.14)");
      rim.addColorStop(1, "rgba(200,241,105,0)");
      ctx.beginPath();
      ctx.arc(c, c, R * 1.18, 0, Math.PI * 2);
      ctx.fillStyle = rim;
      ctx.fill();

      // Land dots, brighter towards the viewer.
      const dot = 1.35 * dpr;
      for (const v of land) {
        const p = project(v, cy, sy, cp, sp);
        if (p[2] <= 0) continue;
        ctx.fillStyle = `rgba(222,234,223,${0.22 + 0.7 * p[2]})`;
        ctx.fillRect(c + p[0] * R - dot / 2, c - p[1] * R - dot / 2, dot, dot);
      }

      // Routes: visible where in front of the globe or lifted past its edge.
      for (const { r, pts, offset } of arcs) {
        const col = COLORS[r.kind];
        const flagged = r.kind === "flagged";
        ctx.lineWidth = (flagged ? 2.2 : 1.4) * dpr;
        ctx.strokeStyle = `rgba(${col},${flagged ? 0.6 + 0.35 * Math.sin(sec * 4) * (reduced ? 0 : 1) : 0.7})`;
        ctx.beginPath();
        let started = false;
        const proj = pts.map((v) => project(v, cy, sy, cp, sp));
        for (const p of proj) {
          const shown = p[2] > 0 || p[0] * p[0] + p[1] * p[1] > 1;
          if (!shown) {
            started = false;
            continue;
          }
          const X = c + p[0] * R;
          const Y = c - p[1] * R;
          if (!started) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
          started = true;
        }
        ctx.stroke();
        // A parcel travelling along the route.
        if (!reduced) {
          const t = (sec * 0.25 + offset) % 1;
          const p = proj[Math.min(proj.length - 1, Math.floor(t * (proj.length - 1)))];
          if (p[2] > 0 || p[0] * p[0] + p[1] * p[1] > 1) {
            ctx.beginPath();
            ctx.arc(c + p[0] * R, c - p[1] * R, (flagged ? 3.2 : 2.4) * dpr, 0, Math.PI * 2);
            ctx.fillStyle = `rgb(${col})`;
            ctx.shadowColor = `rgb(${col})`;
            ctx.shadowBlur = 10 * dpr;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }

      // Cities where parties sign.
      nodeVecs.forEach((v, i) => {
        const p = project(v, cy, sy, cp, sp);
        if (p[2] <= 0.02) return;
        const X = c + p[0] * R;
        const Y = c - p[1] * R;
        const pulse = reduced ? 0 : (sec * 0.8 + i * 0.21) % 1;
        ctx.beginPath();
        ctx.arc(X, Y, (3 + pulse * 9) * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(200,241,105,${0.5 * (1 - pulse) * p[2]})`;
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(X, Y, (i === hover ? 4.5 : 3) * dpr, 0, Math.PI * 2);
        ctx.fillStyle = i === hover ? "#ffffff" : "#c8f169";
        ctx.fill();
      });

      drawRing(true);
    };

    const loop = (time: number) => {
      const idle = time - lastInput > 2500;
      if (!drag) {
        if (idle && !reduced) vYaw += (0.06 - vYaw) * 0.02; // drift back to a slow eastward spin
        yaw += vYaw;
        pitch = Math.max(-50, Math.min(55, pitch + vPitch));
        vYaw *= idle ? 1 : 0.95;
        vPitch *= 0.92;
      }
      draw(time);
      raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };

    // Nearest visible city under the pointer (in CSS pixels).
    const pick = (mx: number, my: number) => {
      const c = size / 2;
      const R = size * 0.36;
      const cy = Math.cos(yaw * RAD);
      const sy = Math.sin(yaw * RAD);
      const cp = Math.cos(pitch * RAD);
      const sp = Math.sin(pitch * RAD);
      let best = -1;
      let bestD = 14 * 14;
      nodeVecs.forEach((v, i) => {
        const p = project(v, cy, sy, cp, sp);
        if (p[2] <= 0.02) return;
        const dx = c + p[0] * R - mx;
        const dy = c - p[1] * R - my;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return { best, c, R, cy, sy, cp, sp };
    };

    const onDown = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, t: performance.now() };
      lastInput = performance.now();
      el.setPointerCapture(e.pointerId);
      setGrabbing(true);
      setTip(null);
    };
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        const k = 180 / (size * 0.36 * Math.PI);
        vYaw = dx * k;
        vPitch = dy * k;
        yaw += vYaw;
        pitch = Math.max(-50, Math.min(55, pitch + vPitch));
        drag = { x: e.clientX, y: e.clientY, t: performance.now() };
        lastInput = performance.now();
        start();
        return;
      }
      const { best, c, R, cy, sy, cp, sp } = pick(e.clientX - rect.left, e.clientY - rect.top);
      if (best !== hover) {
        hover = best;
        start();
      }
      if (best >= 0) {
        const n = nodes[best];
        const p = project(nodeVecs[best], cy, sy, cp, sp);
        setTip({
          x: c + p[0] * R,
          y: c - p[1] * R,
          title: `${n.city}, ${n.country}`,
          lines: n.parties.map((q) => `${q.name} · ${ROLE_LABEL[q.role] ?? q.role}`),
        });
      } else setTip(null);
    };
    const onUp = (e: PointerEvent) => {
      drag = null;
      lastInput = performance.now();
      setGrabbing(false);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const onLeave = () => {
      hover = -1;
      setTip(null);
    };
    const onKey = (e: KeyboardEvent) => {
      const d = ({ ArrowLeft: [-2.5, 0], ArrowRight: [2.5, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] } as Record<string, number[]>)[e.key];
      if (!d) return;
      e.preventDefault();
      vYaw = d[0];
      vPitch = d[1];
      lastInput = performance.now();
      start();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("keydown", onKey);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    io.observe(el);
    const onVis = () => !document.hidden && start();
    document.addEventListener("visibilitychange", onVis);
    start();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("keydown", onKey);
    };
  }, [nodes, routes]);

  const flagged = routes.find((r) => r.kind === "flagged");
  return (
    <div ref={wrap} className={`relative ${className ?? ""}`}>
      <canvas
        ref={canvas}
        tabIndex={0}
        role="img"
        aria-label={`Globe of Orbit's supply chain: ${nodes.length} cities where parties sign, ${routes.length} routes from the ledger${flagged ? `, including a flagged leg: ${flagged.label}` : ""}. Drag or use the arrow keys to spin.`}
        className={`mx-auto block touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${grabbing ? "cursor-grabbing" : "cursor-grab"}`}
      />
      {tip && (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-[240px] -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-xl border border-line-strong bg-bg/90 px-3 py-2 text-[12px] shadow-xl backdrop-blur"
          style={{ left: tip.x, top: tip.y }}
        >
          <div className="font-semibold text-ink">{tip.title}</div>
          {tip.lines.map((l) => (
            <div key={l} className="text-ink-soft">
              {l}
            </div>
          ))}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span>
          <i className="mr-1 inline-block h-1.5 w-3 rounded-full bg-[#c8f169] align-middle" />
          materials
        </span>
        <span>
          <i className="mr-1 inline-block h-1.5 w-3 rounded-full bg-[#7cc4ff] align-middle" />
          shipments
        </span>
        <span>
          <i className="mr-1 inline-block h-1.5 w-3 rounded-full bg-[#5ee0a0] align-middle" />
          recycling loop
        </span>
        {flagged && (
          <span>
            <i className="mr-1 inline-block h-1.5 w-3 rounded-full bg-[#ff7a66] align-middle" />
            flagged leg
          </span>
        )}
        <span className="w-full text-center">Drag to spin · hover a city</span>
      </div>
    </div>
  );
}
