import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeSession } from "../../../../lib/auth/session";
import { SESSION_COOKIE, sessionRepository } from "../../../../lib/auth";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(sessionRepository, token);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
