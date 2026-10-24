import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { councilQuery, councilRequest, parseCouncilSnapshot, presentCouncilSnapshot } from "@/lib/os/council";
export const dynamic = "force-dynamic";

// The Vercel Data Cache stores only successfully validated, source-bound
// read-only snapshots. A transient upstream failure may serve the previous
// validated response; its original generated_at remains visible.
const verifiedCouncilSnapshot = unstable_cache(
 async (query: string) => presentCouncilSnapshot(parseCouncilSnapshot(await councilRequest("snapshot", undefined, query))),
 ["hermes-council-verified-read-only-v2"],
 { revalidate: 60 },
);
export async function GET(request:NextRequest) {
 let query:string;
 try {query=councilQuery(request.nextUrl.searchParams.get("cursor") ?? "0", request.nextUrl.searchParams.get("q") ?? "");}
 catch {return NextResponse.json({error:"Ongeldige zoekopdracht."},{status:400});}
 try {
  const snapshot = await verifiedCouncilSnapshot(query);
  return NextResponse.json(snapshot, {
   headers: {
    "Cache-Control": "private, no-store",
    "X-Hermes-Snapshot-As-Of": snapshot.generated_at,
   },
  });
 }
 catch { return NextResponse.json({error:"De onderzoeksraad is nog niet bereikbaar. De actuele status is onbekend."},
   {status:503,headers:{"Cache-Control":"no-store"}}); }
}
