const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const SESSION_COOKIE = "hermes_os_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export type SessionPayload = {
  sub: "owner";
  iat: number;
  exp: number;
  nonce: string;
  v: 1;
};

export function getAuthConfig() {
  const password = process.env.OS_ACCESS_PASSWORD || "";
  const secret = process.env.OS_SESSION_SECRET || "";
  return {
    password,
    secret,
    ready: password.length >= 12 && secret.length >= 32,
  };
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

export async function createSessionToken(secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: "owner",
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    nonce: crypto.randomUUID(),
    v: 1,
  };
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = bytesToBase64Url(await hmac(body, secret));
  return `${body}.${signature}`;
}

export async function verifySessionToken(token: string | undefined, secret: string) {
  if (!token || !secret) return false;
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;

  try {
    const expected = await hmac(body, secret);
    const supplied = base64UrlToBytes(signature);
    if (!constantTimeEqual(expected, supplied)) return false;

    const payload = JSON.parse(decoder.decode(base64UrlToBytes(body))) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    return payload.v === 1 && payload.sub === "owner" && payload.exp > now && payload.iat <= now + 60;
  } catch {
    return false;
  }
}

export async function secureStringEqual(left: string, right: string) {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return constantTimeEqual(new Uint8Array(leftDigest), new Uint8Array(rightDigest));
}
