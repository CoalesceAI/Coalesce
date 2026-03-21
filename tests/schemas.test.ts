import { describe, it, expect } from 'vitest';
import { SupportRequestSchema, AnswerSchema } from '../src/schemas/request.js';
import { DiagnosisResponseSchema, ErrorResponseSchema } from '../src/schemas/response.js';

describe('SupportRequestSchema', () => {
  it('succeeds with all fields (initial request)', () => {
    const result = SupportRequestSchema.safeParse({
      endpoint: '/threads',
      error_code: '404',
      request_body: {},
      context: 'test',
    });
    expect(result.success).toBe(true);
  });

  it('succeeds with only required fields for initial request (request_body and context optional)', () => {
    const result = SupportRequestSchema.safeParse({
      endpoint: '/threads',
      error_code: '404',
    });
    expect(result.success).toBe(true);
  });

  it('succeeds with initial request including tried array', () => {
    const result = SupportRequestSchema.safeParse({
      endpoint: '/threads',
      error_code: '404',
      tried: ['resize_body', 'check_auth'],
    });
    expect(result.success).toBe(true);
  });

  it('fails with empty object (no session_id and no endpoint/error_code)', () => {
    const result = SupportRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('fails with non-object input', () => {
    const result = SupportRequestSchema.safeParse('not json');
    expect(result.success).toBe(false);
  });

  it('fails with missing error_code on initial request (no session_id)', () => {
    const result = SupportRequestSchema.safeParse({ endpoint: '/threads' });
    expect(result.success).toBe(false);
  });

  it('fails with missing endpoint on initial request (no session_id)', () => {
    const result = SupportRequestSchema.safeParse({ error_code: '404' });
    expect(result.success).toBe(false);
  });

  describe('superRefine — follow-up request validation', () => {
    // Zod v4 validates UUID version bits — use a proper v4 UUID
    const VALID_UUID = 'a1b2c3d4-e5f6-4789-8abc-def012345678';

    it('follow-up with session_id + answer passes WITHOUT endpoint/error_code', () => {
      const result = SupportRequestSchema.safeParse({
        session_id: VALID_UUID,
        answer: { clarifications: { field: 'value' } },
      });
      expect(result.success).toBe(true);
    });

    it('follow-up with session_id but missing answer fails', () => {
      const result = SupportRequestSchema.safeParse({
        session_id: VALID_UUID,
      });
      expect(result.success).toBe(false);
    });

    it('follow-up with session_id and empty answer object passes (all answer fields optional)', () => {
      const result = SupportRequestSchema.safeParse({
        session_id: VALID_UUID,
        answer: {},
      });
      expect(result.success).toBe(true);
    });

    it('follow-up includes optional tried_since in answer', () => {
      const result = SupportRequestSchema.safeParse({
        session_id: VALID_UUID,
        answer: {
          clarifications: { request_size: 'under 10mb' },
          tried_since: ['reduced_payload'],
        },
      });
      expect(result.success).toBe(true);
    });

    it('initial request missing endpoint fails via superRefine', () => {
      const result = SupportRequestSchema.safeParse({ error_code: '500' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('endpoint');
      }
    });

    it('initial request missing error_code fails via superRefine', () => {
      const result = SupportRequestSchema.safeParse({ endpoint: '/threads' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0]);
        expect(paths).toContain('error_code');
      }
    });
  });
});

describe('AnswerSchema', () => {
  it('accepts empty object (both fields optional)', () => {
    const result = AnswerSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts clarifications record', () => {
    const result = AnswerSchema.safeParse({
      clarifications: { field1: 'value1', field2: 'value2' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts tried_since array', () => {
    const result = AnswerSchema.safeParse({
      tried_since: ['action_a', 'action_b'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts both clarifications and tried_since', () => {
    const result = AnswerSchema.safeParse({
      clarifications: { request_size: 'small' },
      tried_since: ['reduced_headers'],
    });
    expect(result.success).toBe(true);
  });

  it('fails with non-string values in clarifications', () => {
    const result = AnswerSchema.safeParse({
      clarifications: { field: 123 },
    });
    expect(result.success).toBe(false);
  });

  it('fails with non-array tried_since', () => {
    const result = AnswerSchema.safeParse({
      tried_since: 'not_an_array',
    });
    expect(result.success).toBe(false);
  });
});

describe('DiagnosisResponseSchema', () => {
  it('accepts resolved status with new fields', () => {
    const result = DiagnosisResponseSchema.safeParse({
      status: 'resolved',
      session_id: 'session-abc-123',
      turn_number: 1,
      diagnosis: 'The endpoint requires auth',
      fix: 'Add Authorization header',
      references: ['/docs/auth'],
      fix_steps: [{ action: 'Add Authorization header', target: 'request.headers' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts resolved status with fix_steps having optional target', () => {
    const result = DiagnosisResponseSchema.safeParse({
      status: 'resolved',
      session_id: 'session-abc-123',
      turn_number: 2,
      diagnosis: 'Body too large',
      fix: 'Reduce payload',
      references: [],
      fix_steps: [{ action: 'reduce request body size' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts needs_info status with new fields', () => {
    const result = DiagnosisResponseSchema.safeParse({
      status: 'needs_info',
      session_id: 'session-abc-123',
      turn_number: 1,
      question: 'What request body did you send?',
      should_try: 'Try adding Content-Type header',
      need_to_clarify: ['request body size', 'auth method'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts needs_info status with only required fields (should_try and need_to_clarify optional)', () => {
    const result = DiagnosisResponseSchema.safeParse({
      status: 'needs_info',
      session_id: 'session-abc-123',
      turn_number: 1,
      question: 'What request body did you send?',
    });
    expect(result.success).toBe(true);
  });

  it('accepts unknown status with session_id and turn_number', () => {
    const result = DiagnosisResponseSchema.safeParse({
      status: 'unknown',
      session_id: 'session-abc-123',
      turn_number: 1,
      explanation: 'This error is not covered in the documentation.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts error status (session_id and turn_number optional for error)', () => {
    const result = DiagnosisResponseSchema.safeParse({
      status: 'error',
      message: 'Internal error',
      code: 'INTERNAL_ERROR',
    });
    expect(result.success).toBe(true);
  });

  it('accepts error status with optional session_id and turn_number', () => {
    const result = DiagnosisResponseSchema.safeParse({
      status: 'error',
      session_id: 'session-abc-123',
      turn_number: 1,
      message: 'Internal error',
      code: 'INTERNAL_ERROR',
    });
    expect(result.success).toBe(true);
  });

  it('fails with invalid status discriminant', () => {
    const result = DiagnosisResponseSchema.safeParse({
      status: 'invalid_status',
      explanation: 'something',
    });
    expect(result.success).toBe(false);
  });

  it('fails resolved status missing session_id', () => {
    const result = DiagnosisResponseSchema.safeParse({
      status: 'resolved',
      turn_number: 1,
      diagnosis: 'x',
      fix: 'y',
      references: [],
      fix_steps: [],
    });
    expect(result.success).toBe(false);
  });

  it('fails resolved status missing turn_number', () => {
    const result = DiagnosisResponseSchema.safeParse({
      status: 'resolved',
      session_id: 'session-abc-123',
      diagnosis: 'x',
      fix: 'y',
      references: [],
      fix_steps: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('ErrorResponseSchema', () => {
  it('succeeds with valid { error, code }', () => {
    const result = ErrorResponseSchema.safeParse({
      error: 'msg',
      code: 'CODE',
    });
    expect(result.success).toBe(true);
  });

  it('fails without error field', () => {
    const result = ErrorResponseSchema.safeParse({ code: 'CODE' });
    expect(result.success).toBe(false);
  });

  it('fails without code field', () => {
    const result = ErrorResponseSchema.safeParse({ error: 'msg' });
    expect(result.success).toBe(false);
  });
});
