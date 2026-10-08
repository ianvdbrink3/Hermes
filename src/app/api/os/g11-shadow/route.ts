import { NextResponse } from "next/server";
import { fetchShadowSnapshot } from "@/lib/os/g11-shadow";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await fetchShadowSnapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "G11 shadowgegevens tijdelijk niet beschikbaar. Geen actuele portfolio- of veiligheidsstatus bevestigd." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
