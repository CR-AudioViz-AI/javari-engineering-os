/**
 * JAVARI ENGINEERING OS - LLM ADAPTER TYPES
 * Supports multiple AI providers for builder and reviewer roles
 */

export type LLMProvider = 'claude' | 'openai' | 'gemini';

export type LLMRole = 'builder' | 'reviewer' | 'summarizer' | 'discoverer';

export interface LLMRequest {
  provider: LLMProvider;
  role: LLMRole;
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

export interface LLMResponse {
  provider: LLMProvider;
  role: LLMRole;
  model: string;
  requestId: string;
  createdAt: string;
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  raw?: unknown;
}

export interface LLMAdapter {
  provider: LLMProvider;
  call(req: LLMRequest): Promise<LLMResponse>;
}

export class LLMError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = 'LLMError';
  }
}
