import { NextResponse } from "next/server";
import { hermesFetch, hermesMode } from "@/lib/hermes";

export async function GET() {
  if (hermesMode() === "mock") {
    return NextResponse.json({ mode: "mock", status: "offline", ready: false, message: "Hermes connection not configured" });
  }
  try {
    const response = await hermesFetch("/health/detailed");
    const data = await response.json();
    return NextResponse.json({ mode: "live", ready: response.ok, ...data }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ mode: "live", status: "unreachable", ready: false, message: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
}
