"use server";

import { getLLMClient } from "@/lib/llm-client";
import {
  SYSTEM_PROMPT,
  getAdaptiveAnalyticsPrompt,
  getInterviewAnalyticsPrompt,
} from "@/lib/prompts/analytics";
import { InterviewService } from "@/services/interviews.service";
import { ResponseService } from "@/services/responses.service";
import type { Question } from "@/types/interview";
import type { Analytics } from "@/types/response";

export const generateInterviewAnalytics = async (payload: {
  callId: string;
  interviewId: string;
  transcript: string;
}) => {
  const { callId, interviewId, transcript } = payload;

  try {
    const response = await ResponseService.getResponseByCallId(callId);
    const interview = await InterviewService.getInterviewById(interviewId);

    if (response.analytics) {
      return { analytics: response.analytics as Analytics, status: 200 };
    }

    const interviewTranscript: string =
      typeof transcript === "string" ? transcript : response.details?.transcript ?? "";

    // Guard: if the candidate said nothing (no "Candidate:" lines), return a
    // minimal result instead of hallucinating scores.
    const hasUserSpeech = interviewTranscript
      .split("\n")
      .some((line) => line.startsWith("Candidate:") && line.replace("Candidate:", "").trim());

    if (!hasUserSpeech) {
      const emptyAnalytics: Analytics = {
        overallScore: 0,
        overallFeedback: "No candidate responses were captured in this session.",
        communication: { score: 0, feedback: "No speech detected from the candidate." },
        questionSummaries: [],
        softSkillSummary: "No data available.",
        userSentiment: "Neutral",
        callSummary: "The candidate did not speak during this session. If this is unexpected, check microphone permissions and try again.",
        callCompletionRating: "Incomplete",
      };
      return { analytics: emptyAnalytics, status: 200 };
    }

    const questions: Question[] = interview?.questions || [];
    const isAdaptive = questions.length === 0;

    const { client: openai, model } = getLLMClient();

    // Adaptive interviews: extract Q&A from transcript directly.
    // Fixed-question interviews: match against the pre-set question list.
    const prompt = isAdaptive
      ? getAdaptiveAnalyticsPrompt(interviewTranscript)
      : getInterviewAnalyticsPrompt(
          interviewTranscript,
          questions.map((q: Question, i: number) => `${i + 1}. ${q.question}`).join("\n"),
        );

    const baseCompletion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = baseCompletion.choices[0]?.message?.content || "{}";
    const analyticsResponse = JSON.parse(content);

    if (!isAdaptive) {
      analyticsResponse.mainInterviewQuestions = questions.map((q: Question) => q.question);
    }

    return { analytics: analyticsResponse, status: 200 };
  } catch (error) {
    console.error("Error in analytics request:", error);
    return { error: "internal server error", status: 500 };
  }
};
