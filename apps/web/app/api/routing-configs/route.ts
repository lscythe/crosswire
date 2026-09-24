import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { routingSchema } from "../../../lib/routing";
import { routingConfigs, saveRouting } from "../../../lib/routing-store";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ configs: await routingConfigs(user.id) });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = routingSchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "Invalid config: provide routes with unique priorities per alias" },
      { status: 400 },
    );
  try {
    const id = await saveRouting(user.id, body.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Route connections must be enabled and accessible"
    )
      return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
