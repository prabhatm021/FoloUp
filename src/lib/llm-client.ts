/**
 * Shared LLM client — Groq preferred, OpenAI fallback.
 *
 * Priority:
 *   1. GROQ_API_KEY set  → Groq (llama-3.3-70b-versatile, free tier)
 *   2. OPENAI_API_KEY    → OpenAI (gpt-4o)
 *
 * Groq's API is 100% OpenAI-SDK compatible — same chat.completions.create()
 * call, different baseURL + model name.
 *
 * Phase 5 note: swap DEFAULT_MODEL or add a PREFERRED_LLM env var if you
 * want to change providers without touching route code.
 */

import { OpenAI } from "openai";

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const GROQ_MODEL    = "llama-3.3-70b-versatile";
export const OPENAI_MODEL  = "gpt-4o";

/** Returns { client, model } ready for chat.completions.create() */
export function getLLMClient(): { client: OpenAI; model: string } {
  const groqKey   = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (groqKey && groqKey !== "placeholder") {
    return {
      client: new OpenAI({
        apiKey: groqKey,
        baseURL: GROQ_BASE_URL,
        maxRetries: 3,
      }),
      model: GROQ_MODEL,
    };
  }

  // Fallback to OpenAI (requires a real key)
  return {
    client: new OpenAI({
      apiKey: openaiKey ?? "",
      maxRetries: 5,
      dangerouslyAllowBrowser: true,
    }),
    model: OPENAI_MODEL,
  };
}
