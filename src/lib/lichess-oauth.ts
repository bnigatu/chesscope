// Helpers for the per-user Lichess OAuth flow used to authorize Opening
// Explorer requests. Lichess started requiring auth on the explorer in
// 2026; the only ToS-compliant approach is per-user tokens, so each user
// authorizes chesscope against their own Lichess account.
//
// Flow: PKCE-secured OAuth 2.0. No client secret (we're a public client).
// Tokens are stored in HTTP-only secure cookies — never reach JS.

import { cookies } from "next/headers";

export const LICHESS_OAUTH_AUTHORIZE = "https://lichess.org/oauth";
export const LICHESS_OAUTH_TOKEN = "https://lichess.org/api/token";

export const COOKIE_TOKEN = "lichess_token";
export const COOKIE_VERIFIER = "lichess_pkce_verifier";
export const COOKIE_STATE = "lichess_oauth_state";
export const COOKIE_NEXT = "lichess_oauth_next";

// 1 year — Lichess access tokens are long-lived (years). When they do
// expire, the explorer call returns 401 and the BookPanel re-prompts.
export const TOKEN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// 10 minutes — only needs to survive the round-trip to lichess.org.
const ONE_SHOT_COOKIE_MAX_AGE = 600;

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export async function challengeFor(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64url(new Uint8Array(hash));
}

export async function getLichessToken(): Promise<string | null> {
  const c = await cookies();
  return c.get(COOKIE_TOKEN)?.value ?? null;
}

/**
 * Cookie options for one-shot OAuth flow values (verifier, state, next).
 * Short TTL, HttpOnly so JS can't read, SameSite=lax so the redirect
 * back from lichess.org carries them.
 */
export function oneShotCookieOpts(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: ONE_SHOT_COOKIE_MAX_AGE,
  };
}

/**
 * Cookie options for the persistent token cookie.
 */
export function tokenCookieOpts(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: TOKEN_COOKIE_MAX_AGE,
  };
}
