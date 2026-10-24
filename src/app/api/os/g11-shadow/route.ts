import { NextResponse } from "next/server";
import { fetchShadowSnapshot, reconcileShadowCouncilCounts, shadowFeedFailure } from "@/lib/os/g11-shadow";
import { councilQuery } from "@/lib/os/council";
import { verifiedCouncilSnapshot } from "@/lib/os/council-cache";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const [shadow, council] = await Promise.all([
      fetchShadowSnapshot(),
      verifiedCouncilSnapshot(councilQuery()),
    ]);
    return NextResponse.json(reconcileShadowCouncilCounts(shadow, council), {
      headers: {
        "Cache-Control": "no-store",
        "X-Hermes-Council-As-Of": council.generated_at,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: shadowFeedFailure(error) }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
