// Begins the Lichess OAuth handshake. Generates a PKCE verifier and a
// CSRF state value, stashes both in HttpOnly cookies, then redirects the
// user to lichess.org to authorize. The actual token exchange happens
// in /api/lichess/oauth/callback.

import { NextResponse } from "next/server";
import {
  COOKIE_NEXT,
  COOKIE_STATE,
  COOKIE_VERIFIER,
  LICHESS_OAUTH_AUTHORIZE,
  challengeFor,
  generateState,
  generateVerifier,
  oneShotCookieOpts,
} from "@/lib/lichess-oauth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  // Where to send the user after a successful exchange. Constrained to
  // a same-origin path to avoid open-redirect issues.
  const rawNext = u.searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") ? rawNext : "/";

  const verifier = generateVerifier();
  const state = generateState();
  const challenge = await challengeFor(verifier);

  const redirectUri = `${u.origin}/api/lichess/oauth/callback`;

  const auth = new URL(LICHESS_OAUTH_AUTHORIZE);
  auth.searchParams.set("response_type", "code");
  // client_id is just an opaque identifier for public clients on Lichess;
  // we use our own origin so it's stable per environment.
  auth.searchParams.set("client_id", u.origin);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("code_challenge", challenge);
  auth.searchParams.set("code_challenge_method", "S256");
  auth.searchParams.set("state", state);
  // Explorer reads need no scopes. Leave blank.

  const res = NextResponse.redirect(auth);
  const opts = oneShotCookieOpts(u.protocol === "https:");
  res.cookies.set(COOKIE_VERIFIER, verifier, opts);
  res.cookies.set(COOKIE_STATE, state, opts);
  res.cookies.set(COOKIE_NEXT, next, opts);
  return res;
}
