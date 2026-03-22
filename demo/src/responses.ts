// ---------------------------------------------------------------------------
// responses.ts — Pre-canned responses for Coalesce multi-turn follow-ups
// ---------------------------------------------------------------------------

// Clarifications shape expected by Coalesce WS protocol
export type Clarifications = Record<string, string>;

export interface AnswerPayload {
  clarifications: Clarifications;
}

// ---------------------------------------------------------------------------
// pickResponse — maps a follow-up question to a canned answer object
// ---------------------------------------------------------------------------

export function pickResponse(question: string): AnswerPayload {
  const q = question.toLowerCase();

  if (q.includes('inbox') || q.includes('inbox_id')) {
    return {
      clarifications: {
        [question]:
          'I used a randomly generated string: nonexistent-inbox-id',
      },
    };
  }

  if (q.includes('request') || q.includes('body')) {
    return {
      clarifications: {
        [question]: "{ subject: 'Test', text: 'Hello' }",
      },
    };
  }

  if (q.includes('try') || q.includes('tried')) {
    return {
      clarifications: {
        [question]: "I just started, this is my first attempt",
      },
    };
  }

  // Catch-all
  return {
    clarifications: {
      [question]:
        "I'm not sure — please provide a fix based on the available documentation",
    },
  };
}
