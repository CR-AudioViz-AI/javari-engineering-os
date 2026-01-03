/**
 * JAVARI ENGINEERING OS - OPENAI ADAPTER
 * Reviewer role for architecture review and scoring
 */

import { LLMAdapter, LLMRequest, LLMResponse, LLMError } from './types';

interface OpenAIChoice {
  message?: {
    content?: string;
  };
}

interface OpenAIAPIResponse {
  id: string;
  choices?: OpenAIChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export class OpenAIAdapter implements LLMAdapter {
  provider: 'openai' = 'openai';

  private apiKey: string;
  private baseUrl: string;

  constructor(opts?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.baseUrl = opts?.baseUrl ?? 'https://api.openai.com/v1/chat/completions';
    if (!this.apiKey) throw new LLMError('CONFIG', 'Missing OPENAI_API_KEY');
  }

  async call(req: LLMRequest): Promise<LLMResponse> {
    const model = req.model || 'gpt-4o-mini';
    const maxTokens = req.maxTokens ?? 4096;
    const temperature = req.temperature ?? 0.2;

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: req.prompt }],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new LLMError('OPENAI_CALL_FAILED', `OpenAI API error ${res.status}: ${text}`);
    }

    let json: OpenAIAPIResponse;
    try {
      json = JSON.parse(text) as OpenAIAPIResponse;
    } catch (e) {
      throw new LLMError('OPENAI_BAD_JSON', `OpenAI response not JSON: ${text}`, e);
    }

    const content = json.choices?.[0]?.message?.content?.trim() ?? '';
    const usage = json.usage ?? {};

    return {
      provider: 'openai',
      role: req.role,
      model,
      requestId: json.id ?? `openai_${Date.now()}`,
      createdAt: new Date().toISOString(),
      content,
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      raw: json,
    };
  }
}
