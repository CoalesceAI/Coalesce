import { describe, it, expect } from 'vitest';
import { SupportRequestSchema } from '../src/schemas/request.js';
import { DiagnosisResponseSchema, ErrorResponseSchema } from '../src/schemas/response.js';

describe('SupportRequestSchema', () => {
  it('succeeds with all fields', () => {
    const result = SupportRequestSchema.safeParse({
      endpoint: '/threads',
      error_code: '404',
      request_body: {},
      context: 'test',
    });
    expect(result.success).toBe(true);
  });

  it('succeeds with only required fields (request_body and context optional)', () => {
    const result = SupportRequestSchema.safeParse({
      endpoint: '/threads',
      error_code: '404',
    });
    expect(result.success).toBe(true);
  });

  it('fails with empty object (endpoint and error_code required)', () => {
    const result = SupportRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('fails with non-object input', () => {
    const result = SupportRequestSchema.safeParse('not json');
    expect(result.success).toBe(false);
  });

  it('fails with missing error_code', () => {
    const result = SupportRequestSchema.safeParse({ endpoint: '/threads' });
    expect(result.success).toBe(false);
  });

  it('fails with missing endpoint', () => {
    const result = SupportRequestSchema.safeParse({ error_code: '404' });
    expect(result.success).toBe(false);
  });
});

describe('DiagnosisResponseSchema', () => {
  it('accepts resolved status', () => {
    const result = DiagnosisResponseSchema.safeParse({
      status: 'resolved',
      diagnosis: 'The endpoint requires auth',
      fix: 'Add Authorization header',
      references: ['/docs/auth'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts needs_info status', () => {
    const result = DiagnosisResponseSchema.safeParse({
      status: 'needs_info',
      question: 'What request body did you send?',
    });
    expect(result.success).toBe(true);
  });

  it('accepts unknown status', () => {
    const result = DiagnosisResponseSchema.safeParse({
      status: 'unknown',
      explanation: 'This error is not covered in the documentation.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts error status', () => {
    const result = DiagnosisResponseSchema.safeParse({
      status: 'error',
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
