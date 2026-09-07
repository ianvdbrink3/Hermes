import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      execution_locked: true,
      code: "BROWSER_EXECUTION_DISABLED",
      message: "Browser-triggered trading activation is hard-disabled. A future execution flow must use a separate authoritative service with explicit human approval, time-limited activation and independent risk controls.",
    },
    {
      status: 423,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
