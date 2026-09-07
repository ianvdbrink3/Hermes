import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Legacy /api/hermes/runs model creation is disabled. Production is inspect-only and interactive model work must use the policy-gated his-research routes.",
      code: "LEGACY_PRODUCTION_RUN_CREATION_DISABLED",
      production_mutation: false,
    },
    { status: 423, headers: { "Cache-Control": "no-store" } },
  );
}