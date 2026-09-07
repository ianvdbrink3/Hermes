import { NextResponse } from "next/server";
import { getRuntimeSnapshot } from "@/lib/os/runtime-snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = await getRuntimeSnapshot();
  const scheduler = runtime.scheduler;

  return NextResponse.json(
    {
      connected: runtime.telemetry.stateFeed,
      state: runtime.telemetry.stateFeed ? "connected" : "degraded",
      message: runtime.runtime.reason,
      snapshot: runtime.sourceSnapshot,
      heartbeat: {
        state: runtime.telemetry.scheduler ? "connected" : "degraded",
        message: scheduler.found ? undefined : "Research Review Router is not visible. Deprecated scheduler jobs are not used as fallback.",
        heartbeat: scheduler.found
          ? {
              id: scheduler.id,
              name: scheduler.name,
              active: scheduler.active,
              schedule: scheduler.schedule,
              nextRun: scheduler.nextRun,
              lastRun: scheduler.lastRun,
              lastStatus: scheduler.lastStatus,
            }
          : null,
      },
      runtimeState: runtime.runtime.state,
      provider: runtime.provider,
      compute: runtime.compute,
      schemaVersion: runtime.schemaVersion,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
