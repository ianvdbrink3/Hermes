import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const target = body.enabled === true;
  const url = process.env.EXECUTION_CONTROL_URL;
  const key = process.env.EXECUTION_CONTROL_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, execution_locked: true, message: "Execution service is not configured. Trading remains hard-locked." }, { status: 409 });
  }
  const response = await fetch(`${url.replace(/\/$/, "")}/trading`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: target, source: "hermes-investment-os" }),
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
