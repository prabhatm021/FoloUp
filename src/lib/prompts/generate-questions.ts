export const SYSTEM_PROMPT =
  "You are an expert interview designer who crafts targeted, insightful questions tailored to any role or domain.";

export const generateQuestionsPrompt = (body: {
  name: string;
  objective: string;
  number: number;
  duration: string | number;
  context: string;
}) => {
  const minutesPerQuestion =
    body.duration && body.number
      ? Math.round(Number(body.duration) / Number(body.number))
      : null;

  return `You are designing interview questions for the following interview.

Interview Title: ${body.name}
Interview Objective: ${body.objective}
Number of questions to generate: ${body.number}
Total interview duration: ${body.duration} minutes${minutesPerQuestion ? ` (~${minutesPerQuestion} min per question)` : ""}

${body.context ? `Additional context (e.g. uploaded job description or resume):\n${body.context}\n` : ""}

Guidelines for crafting the questions:
- Tailor every question directly to the objective. If the objective is about product management, ask PM questions. If it is about engineering, ask engineering questions. Never default to generic "tell me about yourself" filler.
- Calibrate question depth to the time available: with ~${minutesPerQuestion ?? "few"} minutes per question, ${
    minutesPerQuestion && minutesPerQuestion <= 3
      ? "keep questions focused and answerable in 2-3 minutes — avoid multi-part or heavily open-ended questions."
      : minutesPerQuestion && minutesPerQuestion <= 6
        ? "questions should allow for a structured ~5 minute answer — good for STAR-format responses."
        : "questions can be broad and exploratory, expecting detailed answers with examples and follow-up depth."
  }
- Mix question types: include at least one behavioural (STAR-style), one situational ("imagine you are…"), and one domain-specific question.
- For PM/product roles specifically: cover product sense, prioritisation, metrics, stakeholder management, and cross-functional collaboration where relevant.
- Questions should be open-ended and concise — 30 words or fewer each.
- Do not ask questions that can be answered with yes/no or a single fact.

Also generate a short interview description (≤50 words, second-person "you will be asked…" style) to be shown to the interviewee. Do not repeat the objective verbatim.

Output ONLY a valid JSON object with exactly two keys:
{
  "questions": [{ "question": string }, ...],
  "description": string
}`;
};
