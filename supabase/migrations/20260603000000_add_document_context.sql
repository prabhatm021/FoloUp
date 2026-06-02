-- Add document_context to interview table
-- Stores extracted PDF text so the live Pipecat interviewer
-- can reference the candidate's resume / JD during the call.
ALTER TABLE interview ADD COLUMN IF NOT EXISTS document_context TEXT;
