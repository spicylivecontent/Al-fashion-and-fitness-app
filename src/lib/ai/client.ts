// Gemensam koppling till Claude. Körs bara på servern – API-nyckeln når aldrig webbläsaren.
//
// Till AI:n skickas enbart siffror (mått, budget, mål). Bilder skickas aldrig.

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.PASSFORM_MODEL || "claude-opus-5-5";

/** Finns det en nyckel? Utan den kör appen i demoläge. */
export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export interface Research {
  /** Modellens sammanställning av vad den hittade. */
  text: string;
  /** Värdnamn för alla sidor som faktiskt dök upp i sökresultaten. */
  hosts: Set<string>;
}

const MAX_CONTINUATIONS = 5;

/**
 * Låter modellen söka på nätet och sammanställa vad den hittar.
 * Sökningen körs hos Anthropic; vi får tillbaka text plus de sidor som besöktes.
 */
export async function researchWithWebSearch(system: string, prompt: string, maxSearches: number): Promise<Research> {
  const anthropic = getClient();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  const hosts = new Set<string>();
  let text = "";

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const stream = anthropic.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      // Om modellen avböjer av policyskäl körs frågan om på en reservmodell i samma anrop.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system,
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: maxSearches,
          user_location: { type: "approximate", country: "SE", timezone: "Europe/Stockholm" },
        },
      ],
      messages,
    });
    const message = await stream.finalMessage();

    for (const block of message.content) {
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        // Vid sökfel är content ett felobjekt i stället för en lista – då finns inga träffar att spara.
        for (const result of block.content) {
          try {
            hosts.add(new URL(result.url).hostname.replace(/^www\./, ""));
          } catch {
            // Ogiltig adress i ett sökresultat: hoppa över.
          }
        }
      }
    }

    if (message.stop_reason === "refusal") {
      throw new AiError("AI-tjänsten avböjde förfrågan.", 422);
    }
    if (message.stop_reason === "pause_turn") {
      // Sökningen pausades hos servern: skicka tillbaka svaret så fortsätter den.
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    break;
  }
  if (!text.trim()) throw new AiError("AI-tjänsten gav inget svar.");
  return { text, hosts };
}

/** Översätter SDK:ns fel till ett svar som går att visa för användaren. */
export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.AuthenticationError) return new AiError("AI-nyckeln är ogiltig.", 500);
  if (error instanceof Anthropic.RateLimitError) return new AiError("AI-tjänsten är överbelastad just nu. Försök igen om en stund.", 429);
  if (error instanceof Anthropic.APIConnectionError) return new AiError("Kunde inte nå AI-tjänsten.", 502);
  if (error instanceof Anthropic.APIError) return new AiError(`AI-tjänsten svarade med ett fel (${error.status ?? "okänt"}).`, 502);
  return new AiError("Ett oväntat fel inträffade.", 500);
}
