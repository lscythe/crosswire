import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { connectionSchema, isSafeProviderUrl } from "../../../lib/connections";
import { discoverModels } from "../../../lib/providers";
import { POST as create, GET as list } from "../connections/route";
export async function GET() {
  const response = await list();
  if (!response.ok) return response;
  const body = await response.json();
  return NextResponse.json({ providers: body.connections });
}
export async function POST(request: Request) {
  if (!(await currentUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = connectionSchema.safeParse(
    await request
      .clone()
      .json()
      .catch(() => null),
  );
  if (!body.success || !isSafeProviderUrl(body.data.baseUrl))
    return NextResponse.json({ error: "Invalid provider configuration" }, { status: 400 });
  try {
    await discoverModels(body.data.baseUrl, body.data.apiKey);
  } catch {
    return NextResponse.json(
      { error: "Connection test failed. Check the base URL and API key." },
      { status: 502 },
    );
  }
  return create(request);
}
