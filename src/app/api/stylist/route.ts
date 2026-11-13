import { NextResponse } from "next/server";
import { aiConfigured, toAiError } from "@/lib/ai/client";
import { StylistRequestSchema } from "@/lib/ai/schemas";
import { aiStylist } from "@/lib/ai/stylist";

export const runtime = "nodejs";
// Webbsökningen kan ta ett par minuter.
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI-läget är inte konfigurerat." }, { status: 503 });
  }
  const body = StylistRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  }
  try {
    return NextResponse.json(await aiStylist(body.data.profile, body.data.measurements));
  } catch (error) {
    const ai = toAiError(error);
    console.error("[stylist]", error);
    return NextResponse.json({ error: ai.message }, { status: ai.status });
  }
}
