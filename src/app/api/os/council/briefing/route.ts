import { NextResponse } from "next/server";
import { councilRequest, parseCouncilBriefing } from "@/lib/os/council";

export const dynamic="force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(parseCouncilBriefing(await councilRequest("briefing")), {
      headers:{"Cache-Control":"no-store"},
    });
  } catch {
    return NextResponse.json({error:"Het geverifieerde dagelijkse rapport is niet beschikbaar."},
      {status:503,headers:{"Cache-Control":"no-store"}});
  }
}
