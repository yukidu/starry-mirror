import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_MODELS, extractAiText, runMirrorAi } from '../worker/ai-models.mjs';

test('only the three approved Workers AI models are used in order', () => {
  assert.deepEqual([...AI_MODELS], [
    '@cf/qwen/qwen3.8-27b',
    '@cf/openai/gpt-oss-120b',
    '@cf/zai-org/glm-4.7-flash',
  ]);
});

test('Qwen success does not call backup models', async () => {
  const calls = [];
  const result = await runMirrorAi({ run: async model => {
    calls.push(model); return { response: '繁體中文解籤' };
  } }, [{ role: 'user', content: 'test' }]);
  assert.deepEqual(calls, [AI_MODELS[0]]);
  assert.equal(result.model, AI_MODELS[0]);
  assert.equal(result.resultText, '繁體中文解籤');
});

test('primary errors switch to GPT-OSS without switching to GLM', async () => {
  const calls = [];
  const result = await runMirrorAi({ run: async model => {
    calls.push(model);
    if (model === AI_MODELS[0]) throw new Error('429 out of capacity');
    return { choices: [{ message: { content: '第二順位成功' } }] };
  } }, []);
  assert.deepEqual(calls, AI_MODELS.slice(0, 2));
  assert.equal(result.model, AI_MODELS[1]);
  assert.equal(result.resultText, '第二順位成功');
});

test('empty responses fall back through GLM, and model recorded is actual success', async () => {
  const calls = [];
  const result = await runMirrorAi({ run: async model => {
    calls.push(model);
    if (model === AI_MODELS[0]) return { response: '' };
    if (model === AI_MODELS[1]) throw new Error('temporarily busy');
    return { result: { choices: [{ message: { content: 'GLM 成功' } }] } };
  } }, []);
  assert.deepEqual(calls, AI_MODELS);
  assert.equal(result.model, AI_MODELS[2]);
  assert.equal(result.resultText, 'GLM 成功');
});

test('account-wide exhausted daily free Neurons stops without retrying', async () => {
  const calls = [];
  const result = await runMirrorAi({ run: async model => {
    calls.push(model); throw new Error('Daily free allocation of neurons exceeded');
  } }, []);
  assert.equal(result.error, 'ai_free_quota_exhausted');
  assert.deepEqual(calls, [AI_MODELS[0]]);
});

test('all three model errors return service unavailable instead of a fake reading', async () => {
  const result = await runMirrorAi({ run: async () => { throw new Error('server busy'); } }, []);
  assert.equal(result.error, 'ai_temporarily_unavailable');
});

test('AI binding absent fails immediately', async () => {
  assert.equal((await runMirrorAi(null, [])).error, 'ai_binding_unavailable');
});

test('structured content response works and does not consume reasoning', () => {
  assert.equal(extractAiText({
    choices: [{ message: { reasoning_content: 'hidden', content: [{ type: 'text', text: '正式答案' }] } }],
  }), '正式答案');
});

test('busy model is rejected immediately and next one receives the same prompt', async () => {
  const models = [];
  const messages = [{ role: 'user', content: '免費解籤測試' }];
  const result = await runMirrorAi({ run: async (model, params, opts) => {
    models.push({ model, params, opts });
    if (models.length === 1) throw new Error('model is busy');
    return { response: '已成功切換 GPT-OSS' };
  } }, messages);
  assert.equal(result.model, AI_MODELS[1]);
  assert.deepEqual(models.map(row => row.model), AI_MODELS.slice(0, 2));
  assert.equal(models[0].params.reasoning_effort, 'low');
  assert.equal(models[0].params.messages, messages);
  assert.equal(models[0].opts.rejectIfBusy, true);
});

test('an inference that never responds cannot block all other free backup models', async () => {
  const seen = [];
  const started = Date.now();
  const result = await runMirrorAi({ run: async model => {
    seen.push(model);
    if (model === AI_MODELS[0]) return new Promise(() => {});
    return { response: '後備模型回覆成功' };
  } }, [], { timeouts: [20, 20, 20] });
  assert.equal(result.model, AI_MODELS[1]);
  assert.deepEqual(seen, AI_MODELS.slice(0, 2));
  assert.ok(Date.now() - started < 1000, 'fallback should finish quickly');
});

test('all three unresponsive inferences fail within the combined wait budget', async () => {
  const result = await runMirrorAi({ run: () => new Promise(() => {}) }, [], { timeouts: [5, 5, 5] });
  assert.equal(result.error, 'ai_temporarily_unavailable');
});
