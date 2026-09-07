import { NextResponse } from "next/server";
import { getRuntimeSnapshot, manualModelInvocationPolicy } from "@/lib/os/runtime-snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getRuntimeSnapshot();
  const manualInvocation = manualModelInvocationPolicy(snapshot);
  return NextResponse.json(
    { ...snapshot, manualInvocation },
    { headers: { "Cache-Control": "no-store" } },
  );
}