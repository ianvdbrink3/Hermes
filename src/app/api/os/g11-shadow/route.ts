import { NextResponse } from "next/server";
import { fetchShadowSnapshot, shadowFeedFailure } from "@/lib/os/g11-shadow";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await fetchShadowSnapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: shadowFeedFailure(error) }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
