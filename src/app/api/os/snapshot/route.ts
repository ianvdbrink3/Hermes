import { NextResponse } from "next/server";
import { getRuntimeSnapshot, manualModelInvocationPolicy } from "@/lib/os/runtime-snapshot";
import { guardManualInvocation, repairRuntimeSnapshot } from "@/lib/os/runtime-snapshot-repair";

export const dynamic = "force-dynamic";

export async function GET() {
  const rawSnapshot = await getRuntimeSnapshot();
  const snapshot = repairRuntimeSnapshot(rawSnapshot);
  const manualInvocation = guardManualInvocation(
    snapshot,
    manualModelInvocationPolicy(snapshot),
  );

  return NextResponse.json(
    { ...snapshot, manualInvocation },
    { headers: { "Cache-Control": "no-store" } },
  );
}
