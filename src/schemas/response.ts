import { z } from 'zod';

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string(),
});

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number(),
});

export const DiagnosisResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('resolved'),
    diagnosis: z.string(),
    fix: z.string(),
    references: z.array(z.string()),
  }),
  z.object({
    status: z.literal('needs_info'),
    question: z.string(),
  }),
  z.object({
    status: z.literal('unknown'),
    explanation: z.string(),
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    code: z.string(),
  }),
]);

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type DiagnosisResponse = z.infer<typeof DiagnosisResponseSchema>;
