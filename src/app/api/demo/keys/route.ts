import { NextResponse } from "next/server";
import { demoKeys, isDemoMode } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

// GET /api/demo/keys — demo-mode only. Hands the console the demo actors' private keys so judges
// can role-play every party. Requests are still signed in the browser and verified by the API.
// The sequencer key is never exposed. In production, each actor's key lives in their own wallet.
export async function GET() {
  if (!isDemoMode()) return NextResponse.json({ error: "Demo mode is off" }, { status: 403 });
  return NextResponse.json({ keys: demoKeys() }, { headers: { "cache-control": "no-store" } });
}
