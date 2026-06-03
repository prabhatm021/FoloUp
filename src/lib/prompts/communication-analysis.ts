export const SYSTEM_PROMPT =
  "You are an expert interview coach who gives honest, specific, actionable feedback on communication. Output only valid JSON matching the requested schema.";

export const getCommunicationAnalysisPrompt = (
  transcript: string,
) => `Analyse the communication skills shown in this interview transcript and provide coaching feedback.

Transcript:
${transcript}

Output valid JSON:
{
  "communicationScore": number,       // 0–10: 10=fluent & precise, 7=effective with minor slips, 5=basic, 1=no response
  "overallFeedback": string,          // 2–3 sentences: what worked and one specific thing to improve
  "supportingQuotes": [               // 2–4 quotes from the transcript with coaching notes
    {
      "quote": string,                // exact quote from the transcript
      "analysis": string,             // what this reveals about their communication
      "type": "strength" | "improvement_area"
    }
  ],
  "strengths": [string],              // 2–3 specific communication strengths shown
  "improvementAreas": [string]        // 2–3 concrete areas to work on
}`;
