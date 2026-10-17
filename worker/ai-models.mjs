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

// Keep synchronous mobile requests bounded. When Cloudflare is busy, reject rather
// than queue and switch to the next free Workers AI model.
export const MODEL_TIMEOUTS_MS = Object.freeze([18_000, 12_000, 10_000]);
export const MAX_AI_GENERATION_TOKENS = 1100;
const timedOut = Symbol('mirror_ai_timeout');

export async function runMirrorAi(ai, messages, options = {}) {
  if (!ai?.run) return { error: 'ai_binding_unavailable' };
  const timeouts = options.timeouts || MODEL_TIMEOUTS_MS;
  for (const [index, model] of AI_MODELS.entries()) {
    const startedAt = Date.now();
    let timer;
    try {
      const request = {
        messages,
        max_tokens: MAX_AI_GENERATION_TOKENS,
        temperature: 0.55,
        // Qwen defaults to high reasoning; low is enough for a reflective
        // reading and leaves more completion budget for actual Chinese text.
        ...(index === 0 ? { reasoning_effort: 'low' } : {}),
      };
      const result = await Promise.race([
        Promise.resolve().then(() => ai.run(model, request, { rejectIfBusy: true })),
        new Promise(resolve => { timer = setTimeout(() => resolve(timedOut), timeouts[index] || 10_000); }),
      ]);
      if (result === timedOut) {
        console.warn('Mirror AI per-model timeout', model, Date.now() - startedAt);
        continue;
      }
      const resultText = extractAiText(result);
      if (resultText) return { model, resultText };
      console.warn('Mirror AI returned an empty response', model);
    } catch (error) {
      // Log only the model and code, never users' private context or prompt.
      console.warn('Mirror AI model unavailable', model, Number(error?.status || 0));
      if (freeQuotaExhausted(error)) return { error: 'ai_free_quota_exhausted' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return { error: 'ai_temporarily_unavailable' };
}
