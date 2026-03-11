import { z } from 'zod';

export const SupportRequestSchema = z.object({
  endpoint: z.string().min(1),
  error_code: z.string().min(1),
  request_body: z.record(z.string(), z.unknown()).optional(),
  context: z.string().optional(),
  // Phase 2 prep
  session_id: z.uuid().optional(),
  answer: z.string().optional(),
});

export type SupportRequest = z.infer<typeof SupportRequestSchema>;
