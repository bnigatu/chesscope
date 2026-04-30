// Receives the authorization code from Lichess, validates the CSRF state,
// exchanges the code + PKCE verifier for an access token, stores the
// token in an HttpOnly cookie, and redirects the user back to where they
// came from.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  COOKIE_NEXT,
  COOKIE_STATE,
  COOKIE_TOKEN,
  COOKIE_VERIFIER,
  LICHESS_OAUTH_TOKEN,
  tokenCookieOpts,
} from "@/lib/lichess-oauth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const upstreamError = u.searchParams.get("error");

  const c = await cookies();
  const expectedState = c.get(COOKIE_STATE)?.value;
  const verifier = c.get(COOKIE_VERIFIER)?.value;
  const next = c.get(COOKIE_NEXT)?.value ?? "/";

  function fail(reason: string) {
    const url = new URL(next.startsWith("/") ? next : "/", u.origin);
    url.searchParams.set("oauth_error", reason);
    const r = NextResponse.redirect(url);
    r.cookies.delete(COOKIE_VERIFIER);
    r.cookies.delete(COOKIE_STATE);
    r.cookies.delete(COOKIE_NEXT);
    return r;
  }

  if (upstreamError) return fail(upstreamError);
  if (!code || !state || !verifier || !expectedState) {
    return fail("missing_params");
  }
  if (state !== expectedState) return fail("state_mismatch");

  const tokenRes = await fetch(LICHESS_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${u.origin}/api/lichess/oauth/callback`,
      client_id: u.origin,
      code_verifier: verifier,
    }),
  });

  if (!tokenRes.ok) {
    return fail(`token_exchange_${tokenRes.status}`);
  }

  let access: string | undefined;
  try {
    const body = (await tokenRes.json()) as { access_token?: string };
    access = body.access_token;
  } catch {
    return fail("malformed_token_response");
  }
  if (!access) return fail("no_access_token");

  const success = NextResponse.redirect(
    new URL(next.startsWith("/") ? next : "/", u.origin)
  );
  success.cookies.set(
    COOKIE_TOKEN,
    access,
    tokenCookieOpts(u.protocol === "https:")
  );
  success.cookies.delete(COOKIE_VERIFIER);
  success.cookies.delete(COOKIE_STATE);
  success.cookies.delete(COOKIE_NEXT);
  return success;
}
