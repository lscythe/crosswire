import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";

export async function GET() {
  const user = await currentUser(true);
  return user ? NextResponse.json(user) : NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
