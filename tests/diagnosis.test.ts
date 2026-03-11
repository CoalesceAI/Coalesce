import { describe, it, expect, vi, beforeEach } from 'vitest';
import { diagnose, buildSystemPrompt, buildUserMessage } from '../src/services/diagnosis.js';
import type { SupportRequest } from '../src/schemas/request.js';

// ---------------------------------------------------------------------------
// Mock Anthropic client factory
// ---------------------------------------------------------------------------

function makeMockClient(parsedOutput: unknown) {
  return {
    messages: {
      parse: vi.fn().mockResolvedValue({
        parsed_output: parsedOutput,
      }),
    },
  };
}

function makeMockClientThatThrows(error: Error) {
  return {
    messages: {
      parse: vi.fn().mockRejectedValue(error),
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseRequest: SupportRequest = {
  endpoint: '/threads',
  error_code: '401',
  context: 'Missing Authorization header',
};

const docsContext = 'AgentMail API documentation content here.';

// ---------------------------------------------------------------------------
// diagnose() — resolved path
// ---------------------------------------------------------------------------

describe('diagnose() — resolved path', () => {
  it('returns resolved response when Claude returns resolved output', async () => {
    const mockOutput = {
      status: 'resolved',
      diagnosis: 'Missing Authorization header causes 401.',
      fix: 'Add Authorization: Bearer <token> header.',
      references: ['Authentication', '/threads endpoint'],
    };
    const client = makeMockClient(mockOutput);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await diagnose(baseRequest, docsContext, client as any);

    expect(result).toEqual({
      status: 'resolved',
      diagnosis: 'Missing Authorization header causes 401.',
      fix: 'Add Authorization: Bearer <token> header.',
      references: ['Authentication', '/threads endpoint'],
    });
  });
});

// ---------------------------------------------------------------------------
// diagnose() — unknown path
// ---------------------------------------------------------------------------

describe('diagnose() — unknown path', () => {
  it('returns unknown response when Claude returns unknown output', async () => {
    const mockOutput = {
      status: 'unknown',
      explanation: 'This error is not covered in the provided documentation.',
    };
    const client = makeMockClient(mockOutput);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await diagnose(baseRequest, docsContext, client as any);

    expect(result).toEqual({
      status: 'unknown',
      explanation: 'This error is not covered in the provided documentation.',
    });
  });
});

// ---------------------------------------------------------------------------
// diagnose() — null parsed_output fallback
// ---------------------------------------------------------------------------

describe('diagnose() — null parsed_output fallback', () => {
  it('returns unknown fallback when parsed_output is null', async () => {
    const client = makeMockClient(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await diagnose(baseRequest, docsContext, client as any);

    expect(result.status).toBe('unknown');
    expect((result as { status: 'unknown'; explanation: string }).explanation).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// diagnose() — API error path
// ---------------------------------------------------------------------------

describe('diagnose() — API error path', () => {
  it('returns error response when Claude API throws', async () => {
    const client = makeMockClientThatThrows(new Error('API connection failed'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await diagnose(baseRequest, docsContext, client as any);

    expect(result).toEqual({
      status: 'error',
      message: 'API connection failed',
      code: 'CLAUDE_ERROR',
    });
  });
});

// ---------------------------------------------------------------------------
// buildSystemPrompt()
// ---------------------------------------------------------------------------

describe('buildSystemPrompt()', () => {
  it('includes the docsContext string in the prompt', () => {
    const prompt = buildSystemPrompt(docsContext);
    expect(prompt).toContain(docsContext);
  });

  it('includes anti-hallucination instruction using "only" and "provided documentation"', () => {
    const prompt = buildSystemPrompt(docsContext);
    expect(prompt.toLowerCase()).toContain('only');
    expect(prompt.toLowerCase()).toContain('provided documentation');
  });

  it('includes instruction to return "unknown" when docs do not cover the error', () => {
    const prompt = buildSystemPrompt(docsContext);
    expect(prompt.toLowerCase()).toContain('unknown');
  });
});

// ---------------------------------------------------------------------------
// buildUserMessage()
// ---------------------------------------------------------------------------

describe('buildUserMessage()', () => {
  it('includes endpoint in the message', () => {
    const msg = buildUserMessage(baseRequest);
    expect(msg).toContain('/threads');
  });

  it('includes error_code in the message', () => {
    const msg = buildUserMessage(baseRequest);
    expect(msg).toContain('401');
  });

  it('includes context when provided', () => {
    const msg = buildUserMessage(baseRequest);
    expect(msg).toContain('Missing Authorization header');
  });

  it('includes request_body as JSON when provided', () => {
    const req: SupportRequest = { ...baseRequest, request_body: { to: 'test@example.com' } };
    const msg = buildUserMessage(req);
    expect(msg).toContain('test@example.com');
  });

  it('does not include request_body section when not provided', () => {
    const req: SupportRequest = { endpoint: '/threads', error_code: '401' };
    const msg = buildUserMessage(req);
    expect(msg).not.toContain('Request body');
  });
});

// ---------------------------------------------------------------------------
// diagnose() — verifies Claude API call parameters
// ---------------------------------------------------------------------------

describe('diagnose() — Claude API call parameters', () => {
  it('calls messages.parse with model claude-sonnet-4-6', async () => {
    const client = makeMockClient({ status: 'unknown', explanation: 'test' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await diagnose(baseRequest, docsContext, client as any);

    expect(client.messages.parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' })
    );
  });

  it('calls messages.parse with output_config containing a format field', async () => {
    const client = makeMockClient({ status: 'unknown', explanation: 'test' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await diagnose(baseRequest, docsContext, client as any);

    expect(client.messages.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        output_config: expect.objectContaining({ format: expect.anything() }),
      })
    );
  });
});
