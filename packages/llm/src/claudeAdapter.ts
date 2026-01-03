/**
 * JAVARI ENGINEERING OS - CLAUDE ADAPTER
 * Builder role for generating code and fixes
 */

import { LLMAdapter, LLMRequest, LLMResponse, LLMError } from './types';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeContentBlock {
  type: string;
  text?: string;
}

interface ClaudeAPIResponse {
  id: string;
  content: ClaudeContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export class ClaudeAdapter implements LLMAdapter {
  provider: 'claude' = 'claude';

  private apiKey: string;
  private baseUrl: string;

  constructor(opts?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? '';
    this.baseUrl = opts?.baseUrl ?? 'https://api.anthropic.com/v1/messages';
    if (!this.apiKey) throw new LLMError('CONFIG', 'Missing ANTHROPIC_API_KEY or CLAUDE_API_KEY');
  }

  async call(req: LLMRequest): Promise<LLMResponse> {
    const model = req.model || 'claude-sonnet-4-20250514';
    const maxTokens = req.maxTokens ?? 8192;
    const temperature = req.temperature ?? 0.2;

    const messages: ClaudeMessage[] = [{ role: 'user', content: req.prompt }];

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages,
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new LLMError('CLAUDE_CALL_FAILED', `Claude API error ${res.status}: ${text}`);
    }

    let json: ClaudeAPIResponse;
    try {
      json = JSON.parse(text) as ClaudeAPIResponse;
    } catch (e) {
      throw new LLMError('CLAUDE_BAD_JSON', `Claude response not JSON: ${text}`, e);
    }

    const contentParts = Array.isArray(json.content) ? json.content : [];
    const content = contentParts
      .map((p) => (p?.type === 'text' ? p.text : ''))
      .join('\n')
      .trim();

    return {
      provider: 'claude',
      role: req.role,
      model,
      requestId: json.id ?? `claude_${Date.now()}`,
      createdAt: new Date().toISOString(),
      content,
      inputTokens: json.usage?.input_tokens,
      outputTokens: json.usage?.output_tokens,
      raw: json,
    };
  }
}
