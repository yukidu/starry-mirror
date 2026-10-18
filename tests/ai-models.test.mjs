import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_MODELS, MODEL_CHOICES, DEFAULT_PRIMARY_MODEL, modelFallbackOrder, extractAiText, runMirrorAi } from '../worker/ai-models.mjs';

test('five admin-selectable Workers AI models with three bounded defaults', () => {
  assert.deepEqual([...AI_MODELS], [
    '@cf/qwen/qwen3.8-27b',
    '@cf/openai/gpt-oss-120b',
    '@cf/zai-org/glm-4.7-flash',
    '@cf/qwen/qwen3-30b-a3b-fp8',
    '@cf/zai-org/glm-5.3-flash',
  ]);
  assert.equal(DEFAULT_PRIMARY_MODEL,AI_MODELS[0]);
  assert.equal(MODEL_CHOICES.length,5);
  assert.deepEqual(modelFallbackOrder(),AI_MODELS.slice(0,3));
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
  assert.deepEqual(calls, AI_MODELS.slice(0,3));
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


test('super-admin chosen Qwen3 30B is primary but established backup models remain', async () => {
  const calls=[];
  const result=await runMirrorAi({run:async model=>{calls.push(model);if(calls.length===1)throw Error('busy');return {response:'備援成功'};}},[],{primaryModel:AI_MODELS[3]});
  assert.deepEqual(calls,[AI_MODELS[3],AI_MODELS[0]]);
  assert.equal(result.model,AI_MODELS[0]);
});

test('invalid model choice cannot invoke arbitrary paid provider model', async () => {
  const calls=[];
  await runMirrorAi({run:async model=>{calls.push(model);return {response:'完成'};}},[],{primaryModel:'some-paid-unapproved-model'});
  assert.deepEqual(calls,[AI_MODELS[0]]);
});
