import type { NextRequest } from "next/server";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isMutatingRequest(request: NextRequest) {
  return MUTATING_METHODS.has(request.method.toUpperCase());
}

export function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }

  return request.headers.get("sec-fetch-site") === "same-origin";
}

export function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}
