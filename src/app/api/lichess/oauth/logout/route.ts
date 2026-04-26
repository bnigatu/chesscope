// Clears the Lichess token cookie. POST only so a CSRF GET can't trigger
// it. Optionally we could also call Lichess's /api/token/revoke to
// invalidate the token server-side; skipping for V1.

import { NextResponse } from "next/server";
import { COOKIE_TOKEN } from "@/lib/lichess-oauth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_TOKEN);
  return res;
}
