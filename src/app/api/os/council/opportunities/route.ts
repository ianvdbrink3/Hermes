import { NextResponse } from "next/server";
import { councilRequest, parseCouncilOpportunities } from "@/lib/os/council";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(parseCouncilOpportunities(await councilRequest("opportunities")), {
      headers:{"Cache-Control":"no-store"},
    });
  } catch {
    return NextResponse.json({error:"Er zijn nog geen geverifieerde screeningsresultaten."},
      {status:503,headers:{"Cache-Control":"no-store"}});
  }
}
