export const SYSTEM_PROMPT =
  "You are an expert interview coach who gives honest, specific, and actionable feedback. Output only valid JSON matching the requested schema — no extra text.";

// ── Fixed-question interview analytics ───────────────────────────────────────
export const getInterviewAnalyticsPrompt = (
  interviewTranscript: string,
  mainInterviewQuestions: string,
) => `Analyse this interview transcript and provide structured coaching feedback.

###
Transcript:
${interviewTranscript}

Pre-set questions:
${mainInterviewQuestions}
###

Generate the following in JSON:

1. Overall Score (0–100) and Overall Feedback (max 60 words).
   Score based on: depth of answers, use of concrete examples, clarity, confidence, relevance, and how well the candidate addressed the questions.

2. Communication Score (0–10) and Feedback (max 60 words).
   Scale: 10=fluent & precise, 9=near-fluent minor slips, 8=clear with occasional errors,
   7=effective despite some inaccuracies, 6=partial command, 5=basic familiar topics only,
   4=frequent breakdowns, 3=hard to follow, 2=isolated words only, 1=no meaningful response.

3. Question Summaries — use ONLY the pre-set questions above.
   For each: output the question and a brief summary of the candidate's answer.
   If not asked: summary = "Not Asked". If asked but not answered: summary = "Not Answered".

4. Soft Skills Summary (10–15 words): confidence, composure, structure, self-awareness.

5. Candidate Sentiment: overall emotional tone. Exactly one of: "Positive", "Neutral", "Negative".

6. Call Summary: 2–3 plain sentences — what the candidate did well and one concrete thing to improve.

7. Call Completion Rating: "Complete" = addressed all questions well, "Partial" = some answered, "Incomplete" = little or no engagement.

Output:
{
  "overallScore": number,
  "overallFeedback": string,
  "communication": { "score": number, "feedback": string },
  "questionSummaries": [{ "question": string, "summary": string }],
  "softSkillSummary": string,
  "userSentiment": "Positive" | "Neutral" | "Negative",
  "callSummary": string,
  "callCompletionRating": "Complete" | "Partial" | "Incomplete"
}`;

// ── Adaptive interview analytics (no pre-set questions) ──────────────────────
export const getAdaptiveAnalyticsPrompt = (interviewTranscript: string) =>
  `Analyse this adaptive practice interview transcript and provide structured coaching feedback.
In an adaptive interview the interviewer generates questions dynamically — there is no fixed list.

###
Transcript:
${interviewTranscript}
###

Generate the following in JSON:

1. Overall Score (0–100) and Overall Feedback (max 60 words).
   Score based on: depth of answers, use of concrete examples, clarity, confidence, relevance, and how well the candidate engaged with each question.

2. Communication Score (0–10) and Feedback (max 60 words).
   Scale: 10=fluent & precise, 9=near-fluent minor slips, 8=clear with occasional errors,
   7=effective despite some inaccuracies, 6=partial command, 5=basic familiar topics only,
   4=frequent breakdowns, 3=hard to follow, 2=isolated words only, 1=no meaningful response.

3. Question Summaries — extract each distinct question the Interviewer asked from the transcript.
   For each: output the question exactly as asked and a concise summary of the candidate's answer.
   If the candidate did not answer a question, summary = "Not Answered".

4. Soft Skills Summary (10–15 words): confidence, composure, structure, self-awareness.

5. Candidate Sentiment: overall emotional tone. Exactly one of: "Positive", "Neutral", "Negative".

6. Call Summary: 2–3 plain sentences — what the candidate did well and one concrete thing to improve.

7. Call Completion Rating: "Complete" = engaged well with most questions, "Partial" = some answered, "Incomplete" = little or no engagement.

Output:
{
  "overallScore": number,
  "overallFeedback": string,
  "communication": { "score": number, "feedback": string },
  "questionSummaries": [{ "question": string, "summary": string }],
  "softSkillSummary": string,
  "userSentiment": "Positive" | "Neutral" | "Negative",
  "callSummary": string,
  "callCompletionRating": "Complete" | "Partial" | "Incomplete"
}`;
