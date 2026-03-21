import { z } from 'zod';

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string(),
});

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number(),
});

// ---------------------------------------------------------------------------
// FixStep schema — structured remediation action in resolved responses
// ---------------------------------------------------------------------------

export const FixStepSchema = z.object({
  action: z.string(),
  target: z.string().optional(),
});

// ---------------------------------------------------------------------------
// DiagnosisResponseSchema — discriminated union on status
// All variants (except error) include session_id + turn_number for agent correlation
// ---------------------------------------------------------------------------

export const DiagnosisResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('resolved'),
    session_id: z.string(),
    turn_number: z.number().int().positive(),
    diagnosis: z.string(),
    fix: z.string(),
    references: z.array(z.string()),
    fix_steps: z.array(FixStepSchema),
  }),
  z.object({
    status: z.literal('needs_info'),
    session_id: z.string(),
    turn_number: z.number().int().positive(),
    question: z.string(),
    should_try: z.string().optional(),
    need_to_clarify: z.array(z.string()).optional(),
  }),
  z.object({
    status: z.literal('unknown'),
    session_id: z.string(),
    turn_number: z.number().int().positive(),
    explanation: z.string(),
  }),
  z.object({
    status: z.literal('error'),
    session_id: z.string().optional(),
    turn_number: z.number().int().positive().optional(),
    message: z.string(),
    code: z.string(),
  }),
]);

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type DiagnosisResponse = z.infer<typeof DiagnosisResponseSchema>;
export type FixStep = z.infer<typeof FixStepSchema>;
