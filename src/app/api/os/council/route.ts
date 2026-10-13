import { NextRequest, NextResponse } from "next/server";
import { councilQuery, councilRequest, parseCouncilSnapshot } from "@/lib/os/council";
export const dynamic = "force-dynamic";
export async function GET(request:NextRequest) {
 let query:string;
 try {query=councilQuery(request.nextUrl.searchParams.get("cursor") ?? "0", request.nextUrl.searchParams.get("q") ?? "");}
 catch {return NextResponse.json({error:"Ongeldige zoekopdracht."},{status:400});}
 try { return NextResponse.json(parseCouncilSnapshot(await councilRequest("snapshot",undefined,query)),
   {headers:{"Cache-Control":"no-store"}}); }
 catch { return NextResponse.json({error:"De onderzoeksraad is nog niet bereikbaar. De actuele status is onbekend."},
   {status:503,headers:{"Cache-Control":"no-store"}}); }
}
