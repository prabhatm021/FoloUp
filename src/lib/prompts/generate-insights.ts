export const SYSTEM_PROMPT =
  "You are an expert interview coach who extracts sharp, useful patterns from interview response data.";

export const createUserPrompt = (
  callSummaries: string,
  interviewName: string,
  interviewObjective: string,
  interviewDescription: string,
) => `You are reviewing multiple candidate responses for a practice interview session.
Extract 3 concise insights that would help the interviewer understand patterns across responses.

###
Session: ${interviewName}
Objective: ${interviewObjective}
${interviewDescription ? `Description: ${interviewDescription}` : ""}

Candidate summaries:
${callSummaries}
###

Rules:
- Each insight must be 25 words or fewer.
- Focus on patterns, not individuals — no names or identifying details.
- Be specific and actionable, not generic ("candidates struggled with X" not "communication could improve").
- Cover different angles across the 3 insights (e.g. knowledge gaps, communication patterns, common strengths).

Output JSON:
{ "insights": [string, string, string] }`;
