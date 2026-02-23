import OpenAI from "openai";

// ---------------------------------------------------------------------------
// OpenAI client — server-side only.
// Used for embeddings-based market matching and optional LLM verification.
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  if (!_client) {
    _client = new OpenAI({ apiKey: key });
  }
  return _client;
}

export function hasOpenAIKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
