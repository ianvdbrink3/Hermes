import { NextRequest, NextResponse } from "next/server";
import { councilRequest, parseCouncilSnapshot } from "@/lib/os/council";
export const dynamic = "force-dynamic";
export const maxDuration = 150;
export async function POST(request:NextRequest) {
 try {
   const raw=await request.text();
   if(raw.length>8000) return NextResponse.json({error:"De vraag is te lang."},{status:400});
   const data:unknown=JSON.parse(raw);
   if(!data || typeof data!=="object" || Array.isArray(data)) throw new Error("invalid");
   const value=data as Record<string,unknown>;
   if(Object.keys(value).some(k=>!["text","request_key"].includes(k)) ||
      typeof value.text!=="string" || !value.text.trim() || value.text.length>2000 ||
      typeof value.request_key!=="string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.request_key))
     return NextResponse.json({error:"Vul een vraag van maximaal 2.000 tekens in."},{status:400});
   const result=await councilRequest("chat",{text:value.text.trim(),request_key:value.request_key});
   return NextResponse.json(parseCouncilSnapshot(result),{headers:{"Cache-Control":"no-store"}});
 } catch {
   return NextResponse.json({error:"De CIO kon geen antwoord leveren. Er wordt geen extra aanvraag gestart. Controleer het gesprek en het resterende dagbudget."},
     {status:503,headers:{"Cache-Control":"no-store"}});
 }
}
