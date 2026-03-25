import { describe, it, expect, vi, beforeEach } from 'vitest';
import { diagnose, buildSystemPrompt, buildUserMessage } from '../src/services/diagnosis.js';
import type { SupportRequest } from '../src/schemas/request.js';
import type { ConversationTurn } from '../src/domain/session.js';

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
      fix_steps: [],
    };
    const client = makeMockClient(mockOutput);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await diagnose(baseRequest, docsContext, [], client as any);

    expect(result.response).toMatchObject({
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
    const result = await diagnose(baseRequest, docsContext, [], client as any);

    expect(result.response).toMatchObject({
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
    const result = await diagnose(baseRequest, docsContext, [], client as any);

    expect(result.response.status).toBe('unknown');
    expect((result.response as { status: 'unknown'; explanation: string }).explanation).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// diagnose() — API error path
// ---------------------------------------------------------------------------

describe('diagnose() — API error path', () => {
  it('returns error response when Claude API throws', async () => {
    const client = makeMockClientThatThrows(new Error('API connection failed'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await diagnose(baseRequest, docsContext, [], client as any);

    expect(result.response).toEqual({
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

  it('includes "Already Attempted" section when tried list is provided', () => {
    const prompt = buildSystemPrompt(docsContext, ['Checked API key', 'Restarted server']);
    expect(prompt).toContain('Already Attempted');
    expect(prompt).toContain('Checked API key');
    expect(prompt).toContain('Restarted server');
    expect(prompt).toContain('Do NOT suggest');
  });

  it('does not include "Already Attempted" section when tried list is empty', () => {
    const prompt = buildSystemPrompt(docsContext, []);
    expect(prompt).not.toContain('Already Attempted');
  });

  it('does not include "Already Attempted" section when tried list is undefined', () => {
    const prompt = buildSystemPrompt(docsContext);
    expect(prompt).not.toContain('Already Attempted');
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

  it('formats answer.clarifications for follow-up requests', () => {
    const req: SupportRequest = {
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      answer: { clarifications: { 'What auth method?': 'Bearer token' } },
    };
    const msg = buildUserMessage(req, true);
    expect(msg).toContain('What auth method?');
    expect(msg).toContain('Bearer token');
  });

  it('formats answer.tried_since for follow-up requests', () => {
    const req: SupportRequest = {
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      answer: { tried_since: ['Added Authorization header', 'Regenerated API key'] },
    };
    const msg = buildUserMessage(req, true);
    expect(msg).toContain('Added Authorization header');
    expect(msg).toContain('Regenerated API key');
  });
});

// ---------------------------------------------------------------------------
// diagnose() — Claude API call parameters
// ---------------------------------------------------------------------------

describe('diagnose() — Claude API call parameters', () => {
  it('calls messages.parse with model claude-sonnet-4-6', async () => {
    const client = makeMockClient({ status: 'unknown', explanation: 'test' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await diagnose(baseRequest, docsContext, [], client as any);

    expect(client.messages.parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' })
    );
  });

  it('calls messages.parse with output_config containing a format field', async () => {
    const client = makeMockClient({ status: 'unknown', explanation: 'test' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await diagnose(baseRequest, docsContext, [], client as any);

    expect(client.messages.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        output_config: expect.objectContaining({ format: expect.anything() }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// diagnose() — conversationHistory parameter (multi-turn)
// ---------------------------------------------------------------------------

describe('diagnose() — conversationHistory parameter', () => {
  it('passes prior turns to messages array when conversationHistory is non-empty', async () => {
    const mockOutput = { status: 'unknown', explanation: 'test' };
    const client = makeMockClient(mockOutput);

    const history: ConversationTurn[] = [
      { role: 'user', content: 'I have a 401 error on /threads' },
      { role: 'assistant', content: 'Can you clarify your auth method?' },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await diagnose(baseRequest, docsContext, history, client as any);

    expect(client.messages.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          { role: 'user', content: 'I have a 401 error on /threads' },
          { role: 'assistant', content: 'Can you clarify your auth method?' },
        ]),
      })
    );
  });

  it('appends current user message after history turns', async () => {
    const mockOutput = { status: 'unknown', explanation: 'test' };
    const client = makeMockClient(mockOutput);

    const history: ConversationTurn[] = [
      { role: 'user', content: 'I have a 401 error' },
      { role: 'assistant', content: 'Can you provide your request?' },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await diagnose(baseRequest, docsContext, history, client as any);

    const call = client.messages.parse.mock.calls[0][0];
    const messages = call.messages as Array<{ role: string; content: string }>;
    // Should have 3 messages: 2 history + 1 current
    expect(messages.length).toBe(3);
    // Last message should be the current user message
    expect(messages[messages.length - 1].role).toBe('user');
  });

  it('uses only current user message when conversationHistory is empty', async () => {
    const mockOutput = { status: 'unknown', explanation: 'test' };
    const client = makeMockClient(mockOutput);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await diagnose(baseRequest, docsContext, [], client as any);

    const call = client.messages.parse.mock.calls[0][0];
    const messages = call.messages as Array<{ role: string; content: string }>;
    expect(messages.length).toBe(1);
  });

  it('defaults conversationHistory to empty array when not provided', async () => {
    const mockOutput = { status: 'unknown', explanation: 'test' };
    const client = makeMockClient(mockOutput);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await diagnose(baseRequest, docsContext, undefined, client as any);

    const call = client.messages.parse.mock.calls[0][0];
    const messages = call.messages as Array<{ role: string; content: string }>;
    expect(messages.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// diagnose() — return value includes assistantContent
// ---------------------------------------------------------------------------

describe('diagnose() — return value shape', () => {
  it('returns { response, assistantContent } shape', async () => {
    const mockOutput = {
      status: 'needs_info',
      question: 'What auth method are you using?',
    };
    const client = makeMockClient(mockOutput);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await diagnose(baseRequest, docsContext, [], client as any);

    expect(result).toHaveProperty('response');
    expect(result).toHaveProperty('assistantContent');
    expect(typeof result.assistantContent).toBe('string');
  });

  it('assistantContent is question text for needs_info', async () => {
    const mockOutput = {
      status: 'needs_info',
      question: 'What auth method are you using?',
    };
    const client = makeMockClient(mockOutput);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await diagnose(baseRequest, docsContext, [], client as any);

    expect(result.assistantContent).toBe('What auth method are you using?');
  });

  it('assistantContent is fix text for resolved', async () => {
    const mockOutput = {
      status: 'resolved',
      diagnosis: 'Missing Authorization header.',
      fix: 'Add Bearer token.',
      references: [],
      fix_steps: [],
    };
    const client = makeMockClient(mockOutput);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await diagnose(baseRequest, docsContext, [], client as any);

    expect(result.assistantContent).toBe('Add Bearer token.');
  });

  it('assistantContent is explanation text for unknown', async () => {
    const mockOutput = {
      status: 'unknown',
      explanation: 'The docs do not cover this error.',
    };
    const client = makeMockClient(mockOutput);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await diagnose(baseRequest, docsContext, [], client as any);

    expect(result.assistantContent).toBe('The docs do not cover this error.');
  });

  it('assistantContent is error message for error status', async () => {
    const client = makeMockClientThatThrows(new Error('API down'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await diagnose(baseRequest, docsContext, [], client as any);

    expect(result.response.status).toBe('error');
    expect(result.assistantContent).toBe('API down');
  });
});
