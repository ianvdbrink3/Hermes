import { NextResponse } from "next/server";
import { getRuntimeSnapshot, manualModelInvocationPolicy } from "@/lib/os/runtime-snapshot";
import { guardManualInvocation, repairRuntimeSnapshot } from "@/lib/os/runtime-snapshot-repair";
import { presentRuntimeSnapshot } from "@/lib/os/runtime-snapshot-presentation";

export const dynamic = "force-dynamic";

export async function GET() {
  const rawSnapshot = await getRuntimeSnapshot();
  const repairedSnapshot = repairRuntimeSnapshot(rawSnapshot);
  const manualInvocation = guardManualInvocation(
    repairedSnapshot,
    manualModelInvocationPolicy(repairedSnapshot),
  );
  const snapshot = presentRuntimeSnapshot(repairedSnapshot);

  return NextResponse.json(
    { ...snapshot, manualInvocation },
    { headers: { "Cache-Control": "no-store" } },
  );
}
