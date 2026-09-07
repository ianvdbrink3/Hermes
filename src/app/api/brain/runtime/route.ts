import { NextResponse } from "next/server";
import { getRuntimeSnapshot } from "@/lib/os/runtime-snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getRuntimeSnapshot();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
