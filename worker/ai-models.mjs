// Allowed Cloudflare Workers AI models. Model charges still depend on account use.
// The server validates administrator selections against this fixed allowlist.
export const AI_MODELS = Object.freeze([
  '@cf/qwen/qwen3.8-27b',
  '@cf/openai/gpt-oss-120b',
  '@cf/zai-org/glm-4.7-flash',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/zai-org/glm-5.3-flash',
]);

export const DEFAULT_PRIMARY_MODEL = AI_MODELS[0];
export const MODEL_CHOICES = Object.freeze([
  { id: AI_MODELS[0], label: 'Qwen 3.8 27B', advantage: '繁體中文、深入反思與個人化解讀' },
  { id: AI_MODELS[1], label: 'GPT-OSS 120B', advantage: '複雜脈絡整理與深度推理' },
  { id: AI_MODELS[2], label: 'GLM 4.7 Flash', advantage: '回覆速度及運算效率' },
  { id: AI_MODELS[3], label: 'Qwen3 30B A3B', advantage: '輕量化推理、適合高使用量' },
  { id: AI_MODELS[4], label: 'GLM 5.3 Flash', advantage: '新世代推理能力，需留意用量費用' },
]);

export function modelFallbackOrder(primary = DEFAULT_PRIMARY_MODEL) {
  const selected = AI_MODELS.includes(primary) ? primary : DEFAULT_PRIMARY_MODEL;
  // One chosen primary and two established fallbacks keep mobile latency bounded.
  return [selected, ...AI_MODELS.slice(0, 3).filter(id => id !== selected)].slice(0, 3);
}


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
  for (const [index, model] of modelFallbackOrder(options.primaryModel).entries()) {
    const startedAt = Date.now();
    let timer;
    try {
      const request = {
        messages,
        max_tokens: MAX_AI_GENERATION_TOKENS,
        temperature: 0.55,
        // Qwen defaults to high reasoning; low is enough for a reflective
        // reading and leaves more completion budget for actual Chinese text.
        ...(model === DEFAULT_PRIMARY_MODEL ? { reasoning_effort: 'low' } : {}),
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
