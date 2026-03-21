import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { SupportRequest } from '../schemas/request.js';
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

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

/**
 * Constructs the system prompt for Claude, embedding the full docs context.
 * Includes anti-hallucination rules and clear status guidance.
 */
export function buildSystemPrompt(docsContext: string): string {
  return `You are Coalesce, an AI support agent for AgentMail's API.

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

---

## AgentMail API Documentation

${docsContext}`;
}

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

/**
 * Formats the developer's error report as a clear message for Claude.
 */
export function buildUserMessage(request: SupportRequest): string {
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
 * @param client - Optional Anthropic client (for dependency injection in tests)
 */
export async function diagnose(
  request: SupportRequest,
  docsContext: string,
  client?: Pick<Anthropic, 'messages'>
): Promise<DiagnoseResult> {
  const anthropic = client ?? new Anthropic();

  const startTime = Date.now();

  try {
    const message = await anthropic.messages.parse({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: buildSystemPrompt(docsContext),
      messages: [{ role: 'user', content: buildUserMessage(request) }],
      output_config: {
        format: zodOutputFormat(DiagnosisOutputSchema),
      },
    });

    const elapsed = Date.now() - startTime;
    console.log(`[diagnosis] Claude response received in ${elapsed}ms`);

    const parsed = message.parsed_output as DiagnosisOutput | null;

    if (parsed === null) {
      console.warn('[diagnosis] parsed_output was null — Claude did not return structured output');
      return {
        status: 'unknown',
        explanation: 'Claude did not return structured output',
      };
    }

    return parsed;
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[diagnosis] Claude API error after ${elapsed}ms:`, err);

    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      message,
      code: 'CLAUDE_ERROR',
    };
  }
}
