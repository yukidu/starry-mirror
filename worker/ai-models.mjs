// Cloudflare Workers AI models available to Workers Free users.
// This allowlist is server-only: no user input or dashboard setting may add paid frontier models.
export const AI_MODELS = Object.freeze([
  '@cf/qwen/qwen3.8-27b',
  '@cf/openai/gpt-oss-120b',
  '@cf/zai-org/glm-4.7-flash',
]);

function asText(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.filter(part => part?.type === 'text' && typeof part.text === 'string')
      .map(part => part.text).join('\n').trim();
  }
  return '';
}

export function extractAiText(output) {
  const choices = [
    output?.response, output?.result?.response, output?.text,
    output?.choices?.[0]?.message?.content,
    output?.result?.choices?.[0]?.message?.content,
    output?.output?.[0]?.content,
  ];
  for (const candidate of choices) {
    const value = asText(candidate);
    if (value) return value;
  }
  return '';
}

function freeQuotaExhausted(error) {
  const message = String(error?.message || error || '').toLowerCase();
  // A depleted account-wide free pool cannot be fixed by switching models.
  return /(?:daily|free|account)[ -]?(?:allocation|quota|neurons|limit)|neurons.{0,45}(?:exceed|limit)|quota[ -]?exhaust|billing[ -]?limit|workers paid plan/.test(message);
}

export async function runMirrorAi(ai, messages) {
  if (!ai?.run) return { error: 'ai_binding_unavailable' };
  for (const model of AI_MODELS) {
    try {
      const response = await ai.run(model, {
        messages,
        max_tokens: 1600,
        temperature: 0.55,
      });
      const resultText = extractAiText(response);
      if (resultText) return { model, resultText };
      console.warn('Mirror AI returned an empty response', model);
    } catch (error) {
      console.warn('Mirror AI model unavailable', model, Number(error?.status || 0));
      if (freeQuotaExhausted(error)) return { error: 'ai_free_quota_exhausted' };
    }
  }
  return { error: 'ai_temporarily_unavailable' };
}
