/**
 * GET-CALL  (Phase 3+)
 * ---------------------
 * Reads the response and transcript from local Supabase.
 * Retell SDK has been removed — all call data is saved by the browser
 * at the end of each Pipecat session.
 *
 * If the response hasn't been analysed yet, it triggers analytics
 * (OpenAI → Groq in Phase 5) and caches the result.
 */

import { logger } from "@/lib/logger";
import { generateInterviewAnalytics } from "@/services/analytics.service";
import { ResponseService } from "@/services/responses.service";
import type { Response } from "@/types/response";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  logger.info("get-call request received");

  const body = await req.json();
  const callId: string = body.id;
  // Pass reanalyse=true to bypass the cache and regenerate analytics
  const reanalyse: boolean = body.reanalyse === true;

  if (!callId) {
    return NextResponse.json({ error: "call id required" }, { status: 400 });
  }

  // ── Fetch stored response from Supabase ────────────────────────────────────
  const callDetails: Response = await ResponseService.getResponseByCallId(callId);

  if (!callDetails) {
    return NextResponse.json({ error: "call not found" }, { status: 404 });
  }

  // ── Already analysed — return cached result (unless reanalyse=true) ──────────
  if (callDetails.is_analysed && !reanalyse) {
    return NextResponse.json(
      {
        callResponse: callDetails.details,
        analytics: callDetails.analytics,
      },
      { status: 200 },
    );
  }

  // ── Build a plain-text transcript string for the analytics prompt ──────────
  // Our Pipecat component saves details as: { transcript: [{role, content}] }
  const rawTranscript: Array<{ role: string; content: string }> =
    callDetails.details?.transcript ?? [];

  const transcriptText = rawTranscript
    .map((t) => `${t.role === "bot" ? "Interviewer" : "Candidate"}: ${t.content}`)
    .join("\n");

  // ── Run analytics (OpenAI / placeholder until Phase 5) ────────────────────
  const { analytics } = await generateInterviewAnalytics({
    callId,
    interviewId: callDetails.interview_id,
    transcript: transcriptText,
  });

  // ── Persist result ─────────────────────────────────────────────────────────
  await ResponseService.saveResponse(
    {
      is_analysed: true,
      analytics,
    },
    callId,
  );

  logger.info("Call analysed successfully");

  return NextResponse.json(
    {
      callResponse: callDetails.details,
      analytics,
    },
    { status: 200 },
  );
}
