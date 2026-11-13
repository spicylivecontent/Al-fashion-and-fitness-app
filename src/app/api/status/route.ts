import { NextResponse } from "next/server";
import { aiConfigured } from "@/lib/ai/client";

export const dynamic = "force-dynamic";

/** Talar om för webbläsaren om AI-läget är påslaget (utan att avslöja nyckeln). */
export function GET() {
  return NextResponse.json({ ai: aiConfigured() });
}
