import {NextRequest,NextResponse} from "next/server";
import {councilRequest,parseCouncilArchive} from "@/lib/os/council";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest) {
 const id=request.nextUrl.searchParams.get("case") || "";
 if(!/^[A-Za-z0-9:_./-]{1,160}$/.test(id)) return NextResponse.json({error:"Ongeldig onderzoek."},{status:400});
 try {
   const data=parseCouncilArchive(await councilRequest("archive",undefined,new URLSearchParams({case:id}).toString()),id);
   return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
 } catch {return NextResponse.json({error:"Het gecontroleerde onderzoeksarchief is niet bereikbaar."},{status:503});}
}
