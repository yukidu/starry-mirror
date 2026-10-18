import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../mirror-enhancements.js', import.meta.url), 'utf8');

// A tiny browser simulation: exercise the ACTUAL enhancement script without
// installing a browser or an additional dependency in this Worker-only repo.
function loadEnhancements({ previews = [], readings = [] } = {}) {
  let onMutation;
  let adminDescriptionWrites = 0;
  let quoteScanCount = 0;
  const note = {
    _text: '每日第 1 次免費，之後每次扣除管理員設定的電池數量',
    get textContent() { return this._text; },
    set textContent(value) {
      this._text = value;
      adminDescriptionWrites++;
      // A text replacement emits another childList record in real Chrome.
      // Deliberately simulate this feedback without hanging the test itself.
      if (adminDescriptionWrites < 10 && onMutation)
        onMutation([{ addedNodes: [{ nodeType: 3 }] }]);
    }
  };
  const doc = {
    readyState: 'loading',
    documentElement: {},
    head: { appendChild() {} },
    addEventListener() {},
    createElement() {
      return {
        style: {}, dataset: {}, className: '', innerHTML: '', textContent: '',
        querySelectorAll() { return []; }
      };
    },
    querySelector(selector) {
      return selector === '#mirrorPageBody .mirror-admin-note' ? note : null;
    },
    querySelectorAll(selector) {
      if (selector === '.mirror-card-preview') {
        quoteScanCount++;
        return previews;
      }
      if (selector === '.mirror-reading') return readings;
      return [];
    }
  };
  const runtime = {
    document: doc,
    location: { pathname: '/admin' },
    window: { fetch: async () => ({ ok: true, clone: () => ({ json: async () => ({ reading: { id: 'R-1', rating: 0, quoteLikeTotal: 0 } }) }) }) },
    MutationObserver: class {
      constructor(callback) { onMutation = callback; }
      observe() {}
    },
    setTimeout() {},
    console
  };
  runInNewContext(source, runtime, { filename: 'mirror-enhancements.js' });
  assert.equal(typeof onMutation, 'function');
  return {
    onMutation,
    runtime,
    note,
    get adminDescriptionWrites() { return adminDescriptionWrites; },
    get quoteScanCount() { return quoteScanCount; }
  };
}

test('admin mutations never rewrite admin descriptions or trap the browser in a loop', () => {
  const page = loadEnhancements();
  const ordinaryChange = {
    addedNodes: [{ nodeType: 1, matches: () => false, querySelector: () => null }]
  };
  for (let i = 0; i < 150; i++) page.onMutation([ordinaryChange]);
  page.onMutation([{ addedNodes: [{ nodeType: 3 }] }]);
  assert.equal(page.adminDescriptionWrites, 0, 'unrelated mutations must not rewrite textContent');
  assert.equal(page.quoteScanCount, 0, 'unrelated mutations should not scan all quote previews');
  assert.match(page.note.textContent, /每日第 1 次免費/);
});

test('fresh card previews are still sized after insertion and never re-sized twice', () => {
  const preview = {
    dataset: {},
    style: {},
    scrollWidth: 100, clientWidth: 200,
    scrollHeight: 30, clientHeight: 100
  };
  const page = loadEnhancements({ previews: [preview] });
  const newCard = {
    nodeType: 1,
    matches: () => false,
    querySelector: selector => selector.includes('mirror-card-preview') ? preview : null
  };
  page.onMutation([{ addedNodes: [newCard] }]);
  assert.equal(preview.dataset.fitted, '1');
  assert.match(preview.style.fontSize, /px$/);
  const fittedSize = preview.style.fontSize;
  page.onMutation([{ addedNodes: [newCard] }]);
  assert.equal(preview.style.fontSize, fittedSize);
});

test('new AI reading still gets one feedback panel, with no recursive additions', async () => {
  const inserted = [];
  const dialog = { querySelector: () => inserted[0] || null };
  const reading = {
    closest: selector => selector === '.mirror-dialog' ? dialog : null,
    insertAdjacentElement: (_position, node) => inserted.push(node)
  };
  const page = loadEnhancements({ readings: [reading] });
  await page.runtime.window.fetch('/api/mirror/ai-readings', { method: 'POST' });
  const newReading = {
    nodeType: 1,
    matches: selector => selector.includes('mirror-reading'),
    querySelector: () => null
  };
  page.onMutation([{ addedNodes: [newReading] }]);
  assert.equal(inserted.length, 1, 'rating buttons should still appear after AI result');
  // A newly attached feedback panel should be ignored by the observer.
  page.onMutation([{ addedNodes: [{ nodeType: 1, matches: () => false, querySelector: () => null }] }]);
  page.onMutation([{ addedNodes: [newReading] }]);
  assert.equal(inserted.length, 1, 'existing panel must not be duplicated');
});
