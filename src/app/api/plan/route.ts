import { NextResponse } from "next/server";
import { aiConfigured, toAiError } from "@/lib/ai/client";
import { aiPlan } from "@/lib/ai/plan";
import { PlanRequestSchema } from "@/lib/ai/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI-läget är inte konfigurerat." }, { status: 503 });
  }
  const body = PlanRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  }
  try {
    return NextResponse.json(await aiPlan(body.data.profile));
  } catch (error) {
    const ai = toAiError(error);
    console.error("[plan]", error);
    return NextResponse.json({ error: ai.message }, { status: ai.status });
  }
}
