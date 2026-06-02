/**
 * CREATE-INTERVIEWER  (Phase 3+)
 * --------------------------------
 * Seeds the default Lisa and Bob interviewer personas directly in Supabase.
 * Retell agent creation has been removed — Pipecat handles the voice pipeline.
 *
 * Phase 5: LLM persona prompts (from INTERVIEWERS constants) will be injected
 *          into the Groq/OpenAI system prompt at call time.
 */

import { INTERVIEWERS } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { InterviewerService } from "@/services/interviewers.service";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(_res: NextRequest) {
  logger.info("create-interviewer request received");

  try {
    // Lisa — explorer persona
    const newInterviewer = await InterviewerService.createInterviewer({
      agent_id: "pipecat-lisa",   // placeholder; not used for Retell
      ...INTERVIEWERS.LISA,
    });

    // Bob — empathy persona
    const newSecondInterviewer = await InterviewerService.createInterviewer({
      agent_id: "pipecat-bob",    // placeholder; not used for Retell
      ...INTERVIEWERS.BOB,
    });

    logger.info("Default interviewers seeded successfully");

    return NextResponse.json(
      { newInterviewer, newSecondInterviewer },
      { status: 200 },
    );
  } catch (error) {
    logger.error(`Error creating interviewers: ${error}`);
    return NextResponse.json({ error: "Failed to create interviewers" }, { status: 500 });
  }
}
