import Anthropic from '@anthropic-ai/sdk';

// One place for every Claude request the app makes: a single question in, one
// JSON object out, inside a time limit. Used by the case assistant, the audit
// and the AI connection check. Runs on the server only.

type Json = Record<string, unknown>;

export type ClaudeFile = { mime: string; data: string };
export type ClaudeContent = string | ({ text: string } | { file: ClaudeFile })[];

export const defaultClaudeModel = 'claude-opus-5-5';

// Structured outputs need every object closed and every property required.
// The app's schemas are written once, in the looser form Gemini takes.
export function strictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const node = { ...(schema as Json) };
  if (Array.isArray(node.type)) {
    // ["number", "null"] becomes anyOf, the form structured outputs document.
    const { type, ...rest } = node;
    return { anyOf: (type as string[]).map((name) => strictSchema({ ...rest, type: name })) };
  }
  for (const key of ['items', 'anyOf', 'allOf']) if (key in node) node[key] = strictSchema(node[key]);
  if (node.type === 'object' && node.properties && typeof node.properties === 'object') {
    const properties = node.properties as Json;
    node.properties = Object.fromEntries(Object.entries(properties).map(([name, value]) => [name, strictSchema(value)]));
    node.required = Object.keys(properties);
    node.additionalProperties = false;
  }
  return node;
}

function failure(error: unknown): Error {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return Object.assign(new Error('Claude took too long.'), { name: 'TimeoutError' });
  }
  if (error instanceof Anthropic.APIConnectionError) return new Error('Claude could not be reached.');
  if (error instanceof Anthropic.APIError && error.status) return new Error(`Claude request failed (${error.status}).`);
  return error instanceof Error ? error : new Error('Claude failed.');
}

export function claudeClient(apiKey: string, fetchImpl?: typeof fetch) {
  // The callers hold the time budget and decide what to try next, so the SDK
  // does not retry on its own.
  return new Anthropic({ apiKey, maxRetries: 0, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
}

export async function askClaude(options: {
  apiKey: string;
  model: string;
  system: string;
  content: ClaudeContent;
  schema: Json;
  timeout: number;
  // Thinking depth. Low keeps reading and reviewing quick; the audit's final
  // judgement asks for medium when there is time.
  effort?: 'low' | 'medium';
  fetch?: typeof fetch;
}): Promise<Json> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = typeof options.content === 'string'
    ? [{ type: 'text', text: options.content }]
    : options.content.map((part): Anthropic.Beta.BetaContentBlockParam => {
      if ('text' in part) return { type: 'text', text: part.text };
      return part.file.mime === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: part.file.data } }
        : { type: 'image', source: { type: 'base64', media_type: part.file.mime as 'image/png' | 'image/jpeg', data: part.file.data } };
    });

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await claudeClient(options.apiKey, options.fetch).beta.messages.create({
      model: options.model,
      max_tokens: 8000,
      system: options.system,
      messages: [{ role: 'user', content }],
      // Thinking is always on for this model; effort sets how long it thinks.
      output_config: { effort: options.effort ?? 'low', format: { type: 'json_schema', schema: strictSchema(options.schema) as Json } },
      // If a safety check declines the request, Anthropic re-runs it on the
      // model it recommends instead of returning the refusal.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    }, { timeout: options.timeout });
  } catch (error) {
    throw failure(error);
  }

  if (response.stop_reason === 'refusal') throw new Error('Claude declined the request.');
  const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  if (response.stop_reason !== 'end_turn' || !text) throw new Error('Claude did not return a complete answer.');
  return JSON.parse(text) as Json;
}
