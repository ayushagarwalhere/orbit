"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { GlobeNode, GlobeRoute } from "@/lib/globe-data.ts";

// The globe's code loads only on screens wide enough to show it, after the page has painted.
const SupplyGlobe = dynamic(() => import("./SupplyGlobe.tsx").then((m) => m.SupplyGlobe), { ssr: false });

export function HeroGlobe(props: { nodes: GlobeNode[]; routes: GlobeRoute[]; className?: string }) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide ? <SupplyGlobe {...props} /> : null;
}
