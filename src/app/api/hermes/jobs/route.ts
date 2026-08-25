import { NextResponse } from "next/server";
import { hermesFetch, hermesMode } from "@/lib/hermes";

const mockJobs = [
  { id: "premarket", name: "Pre-Market CIO", schedule: "30 6 * * 1-5", enabled: true, next: "Weekdays 06:30" },
  { id: "intraday", name: "Futures Intraday Monitor", schedule: "*/15 * * * 1-5", enabled: true, next: "Every 15 minutes" },
  { id: "evening", name: "Evening Review", schedule: "15 22 * * 1-5", enabled: true, next: "Weekdays post-close" }
];

export async function GET() {
  if (hermesMode() === "mock") return NextResponse.json({ mode: "mock", jobs: mockJobs });
  try {
    const response = await hermesFetch("/api/jobs");
    return NextResponse.json({ mode: "live", jobs: await response.json() }, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Hermes request failed" }, { status: 502 });
  }
}
