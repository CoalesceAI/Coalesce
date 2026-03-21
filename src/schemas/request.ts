import { z } from 'zod';

// ---------------------------------------------------------------------------
// Answer schema — structured response to a needs_info question
// ---------------------------------------------------------------------------

export const AnswerSchema = z.object({
  /** Key-value pairs mapping clarification questions to answers */
  clarifications: z.record(z.string(), z.string()).optional(),
  /** Actions the agent attempted since the last response */
  tried_since: z.array(z.string()).optional(),
});

export type AnswerPayload = z.infer<typeof AnswerSchema>;

// ---------------------------------------------------------------------------
// SupportRequestSchema — handles both initial and follow-up requests
//
// Initial request  (no session_id): endpoint + error_code required
// Follow-up request (session_id present): answer required; endpoint/error_code optional
// ---------------------------------------------------------------------------

export const SupportRequestSchema = z
  .object({
    endpoint: z.string().min(1).optional(),
    error_code: z.string().min(1).optional(),
    request_body: z.record(z.string(), z.unknown()).optional(),
    context: z.string().optional(),
    tried: z.array(z.string()).optional(),
    session_id: z.uuid().optional(),
    answer: AnswerSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.session_id !== undefined) {
      // Follow-up request: answer is required
      if (data.answer === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'answer is required for follow-up requests (session_id is present)',
          path: ['answer'],
        });
      }
    } else {
      // Initial request: endpoint and error_code are required
      if (data.endpoint === undefined || data.endpoint === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endpoint is required for initial requests',
          path: ['endpoint'],
        });
      }
      if (data.error_code === undefined || data.error_code === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'error_code is required for initial requests',
          path: ['error_code'],
        });
      }
    }
  });

export type SupportRequest = z.infer<typeof SupportRequestSchema>;
