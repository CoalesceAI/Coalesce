import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { SupportRequest } from '../schemas/request.js';
import type { ConversationTurn } from './session-store.js';

// ---------------------------------------------------------------------------
// Internal schema for Claude structured output
// NOTE: "error" is NOT included — that variant is for Coalesce-side failures,
//       not Claude responses.
// NOTE: session_id and turn_number are NOT in DiagnosisOutput — they are added
//       by the route handler, not Claude. diagnose() returns DiagnosisOutput;
//       the route assembles the full DiagnosisResponse.
// ---------------------------------------------------------------------------

const DiagnosisOutputSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('resolved'),
    diagnosis: z.string(),
    fix: z.string(),
    references: z.array(z.string()),
    fix_steps: z.array(z.object({ action: z.string(), target: z.string().optional() })),
  }),
  z.object({
    status: z.literal('needs_info'),
    question: z.string(),
    should_try: z.string().optional(),
    need_to_clarify: z.array(z.string()).optional(),
  }),
  z.object({
    status: z.literal('unknown'),
    explanation: z.string(),
  }),
]);

type DiagnosisOutput = z.infer<typeof DiagnosisOutputSchema>;

// Coalesce-side error shape (Claude API failures) — not in DiagnosisOutputSchema
// because Claude never returns this; only diagnose() itself can emit it.
export type DiagnoseError = { status: 'error'; message: string; code: string };

// Public return type of diagnose() — includes Claude output OR a Coalesce error
export type DiagnoseResult = DiagnosisOutput | DiagnoseError;

// Wrapped return type including raw assistant content for session storage
export type DiagnoseWrappedResult = {
  response: DiagnoseResult;
  assistantContent: string;
};

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

/**
 * Constructs the system prompt for Claude, embedding the full docs context.
 * Includes anti-hallucination rules and clear status guidance.
 *
 * @param docsContext - Full AgentMail docs loaded at startup
 * @param tried - Optional list of actions already attempted (generates anti-repeat section)
 */
export function buildSystemPrompt(docsContext: string, tried?: string[]): string {
  let prompt = `You are Coalesce, an AI support agent for AgentMail's API.

## Core Rules

Rule 1: Base ALL diagnoses exclusively on the provided documentation below. Do NOT use training knowledge about AgentMail — only the provided documentation is authoritative.

Rule 2: If the provided documentation does not address the error, you MUST return status "unknown". Do NOT guess, extrapolate, or infer from similar APIs.

Rule 3: Never hallucinate API endpoints, parameters, or behaviors that are not explicitly described in the provided documentation.

Rule 4: References must be exact section names or endpoint paths found in the provided documentation. Do not fabricate reference names.

## Response Status Guide

Use exactly one of these statuses:

- **resolved**: You found a clear explanation and fix in the documentation.
  - diagnosis: What caused the error (grounded in docs)
  - fix: Exact steps to resolve it (from docs)
  - references: List of relevant section names or endpoint paths from docs

- **needs_info**: The docs suggest a resolution but you need more information from the developer.
  - question: A specific question to gather the missing info

- **unknown**: The documentation does not cover this error.
  - explanation: An honest explanation that the docs don't address this specific error. Do NOT guess.

---`;

  if (tried !== undefined && tried.length > 0) {
    const triedList = tried.map((item) => `- ${item}`).join('\n');
    prompt += `

## Already Attempted (DO NOT suggest these)
The agent has already tried:
${triedList}
Do NOT suggest any of the above steps.

---`;
  }

  prompt += `

## AgentMail API Documentation

${docsContext}`;

  return prompt;
}

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

/**
 * Formats the developer's error report as a clear message for Claude.
 *
 * @param request - The validated support request from the developer
 * @param isFollowUp - When true, formats the answer fields instead of the initial error report
 */
export function buildUserMessage(request: SupportRequest, isFollowUp?: boolean): string {
  // Follow-up request: format the answer payload
  if (isFollowUp === true && request.answer !== undefined) {
    const lines: string[] = ['Here is my follow-up response:'];

    if (request.answer.clarifications !== undefined) {
      const entries = Object.entries(request.answer.clarifications);
      if (entries.length > 0) {
        lines.push('\nClarifications:');
        for (const [question, answer] of entries) {
          lines.push(`- ${question}: ${answer}`);
        }
      }
    }

    if (request.answer.tried_since !== undefined && request.answer.tried_since.length > 0) {
      lines.push('\nAdditional steps tried since last response:');
      for (const action of request.answer.tried_since) {
        lines.push(`- ${action}`);
      }
    }

    return lines.join('\n');
  }

  // Initial request: format the original error report
  const lines: string[] = [
    "I'm getting an error with the AgentMail API.",
    `Endpoint: ${request.endpoint}`,
    `Error code: ${request.error_code}`,
  ];

  if (request.request_body !== undefined) {
    lines.push(`Request body: ${JSON.stringify(request.request_body, null, 2)}`);
  }

  if (request.context !== undefined) {
    lines.push(`Additional context: ${request.context}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main diagnosis function
// ---------------------------------------------------------------------------

/**
 * Calls Claude with the full docs context and returns a structured diagnosis.
 *
 * @param request - The validated support request from the developer
 * @param docsContext - Full AgentMail docs loaded at startup
 * @param conversationHistory - Prior conversation turns for multi-turn sessions (default [])
 * @param client - Optional Anthropic client (for dependency injection in tests)
 */
export async function diagnose(
  request: SupportRequest,
  docsContext: string,
  conversationHistory?: ConversationTurn[],
  client?: Pick<Anthropic, 'messages'>
): Promise<DiagnoseWrappedResult> {
  const anthropic = client ?? new Anthropic();
  const history = conversationHistory ?? [];

  // Determine if this is a follow-up (has prior history)
  const isFollowUp = history.length > 0;

  // Gather all tried items: from initial request + from history context
  const tried = request.tried ?? [];

  const startTime = Date.now();

  try {
    // Build message array: prior history turns + current user message
    const historyMessages: Anthropic.MessageParam[] = history.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));

    const currentMessage: Anthropic.MessageParam = {
      role: 'user',
      content: buildUserMessage(request, isFollowUp),
    };

    const messages: Anthropic.MessageParam[] = [...historyMessages, currentMessage];

    const message = await anthropic.messages.parse({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: buildSystemPrompt(docsContext, tried.length > 0 ? tried : undefined),
      messages,
      output_config: {
        format: zodOutputFormat(DiagnosisOutputSchema),
      },
    });

    const elapsed = Date.now() - startTime;
    console.log(`[diagnosis] Claude response received in ${elapsed}ms`);

    const parsed = message.parsed_output as DiagnosisOutput | null;

    if (parsed === null) {
      console.warn('[diagnosis] parsed_output was null — Claude did not return structured output');
      const fallback: DiagnoseResult = {
        status: 'unknown',
        explanation: 'Claude did not return structured output',
      };
      return { response: fallback, assistantContent: fallback.explanation };
    }

    // Extract human-readable assistant content for session storage
    let assistantContent: string;
    if (parsed.status === 'resolved') {
      assistantContent = parsed.fix;
    } else if (parsed.status === 'needs_info') {
      assistantContent = parsed.question;
    } else {
      // unknown
      assistantContent = parsed.explanation;
    }

    return { response: parsed, assistantContent };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[diagnosis] Claude API error after ${elapsed}ms:`, err);

    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorResult: DiagnoseResult = {
      status: 'error',
      message: errorMessage,
      code: 'CLAUDE_ERROR',
    };
    return { response: errorResult, assistantContent: errorMessage };
  }
}
