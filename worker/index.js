const APP_NAME = '繁星心鏡';
const APP_ID = 'starry-mirror';
const BATTERY_SCALE = 10;
const SHEET_SYNC_MS = 10 * 60 * 1000;
const DIRECTIONS = new Set(['事業','健康','財富','愛情','職場','人際關係','生涯規劃','學業','心靈']);
const DEFAULT_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const DEFAULT_SETTINGS = Object.freeze({
  drawRewardBatteries: 1,
  favoriteRewardBatteries: 1,
  favoriteDailyCapBatteries: 5,
  shareCostBatteries: 1,
  aiCostBatteries: 0,
  drawLimitVisitor: 3,
  drawLimitMember: 5,
  drawLimit15: 8,
  drawLimitPlatinum: 12,
  drawLimitDiamond: 20,
  aiLimitVisitor: 1,
  aiLimitMember: 2,
  aiLimit15: 3,
  aiLimitPlatinum: 5,
  aiLimitDiamond: 8,
  drawRewardEnabled: true,
  favoriteRewardEnabled: true,
  shareCostEnabled: true,
  aiCostEnabled: false,
  aiEnabled: true
});
const NUMERIC_SETTING_LIMITS = Object.freeze({
  drawRewardBatteries: [0, 1000], favoriteRewardBatteries: [0, 1000], favoriteDailyCapBatteries: [0, 10000],
  shareCostBatteries: [0, 1000], aiCostBatteries: [0, 1000],
  drawLimitVisitor: [0, 1000], drawLimitMember: [0, 1000], drawLimit15: [0, 1000], drawLimitPlatinum: [0, 1000], drawLimitDiamond: [0, 1000],
  aiLimitVisitor: [0, 100], aiLimitMember: [0, 100], aiLimit15: [0, 100], aiLimitPlatinum: [0, 100], aiLimitDiamond: [0, 100]
});
const BOOLEAN_SETTINGS = new Set(['drawRewardEnabled','favoriteRewardEnabled','shareCostEnabled','aiCostEnabled','aiEnabled']);
const authCache = new Map();
let syncPromise = null;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    ...headers
  }});
}
function text(value) { return value == null ? '' : String(value).trim(); }
function clampInt(value, min, max) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}
function batteryToUnits(value) { return Math.round(Number(value || 0) * BATTERY_SCALE); }
function unitsToBattery(value) { return Math.round(Number(value || 0)) / BATTERY_SCALE; }
function taiwanDay(now = Date.now()) { return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10); }
function bearer(request) { return request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i)?.[1] || ''; }
function deviceId(request) {
  const id = text(request.headers.get('X-Mirror-Device'));
  return /^[A-Za-z0-9_-]{20,100}$/.test(id) ? id : '';
}
function normalizeQuote(value) { return text(value).normalize('NFKC').replace(/\s+/g, ' '); }
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
function parseCsv(input) {
  const rows = [[]]; let row = rows[0], cell = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); cell = ''; row = []; rows.push(row);
    } else cell += ch;
  }
  row.push(cell);
  return rows.filter(r => r.some(value => text(value)));
}

async function bridge(env, path, token, body = {}) {
  if (!env.STARRY_ECOSYSTEM?.fetch) return { ok: false, status: 503, data: { error: 'starry_bridge_unavailable' } };
  const response = await env.STARRY_ECOSYSTEM.fetch(new Request(`https://starry-id.internal${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  }));
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
}

async function verifyUser(env, token) {
  if (!token) return null;
  const cached = authCache.get(token);
  if (cached && cached.until > Date.now()) return cached.identity;
  const result = await bridge(env, '/internal/starry-mirror/verify', token);
  if (!result.ok || !result.data?.authenticated) return null;
  const identity = result.data.identity || null;
  if (authCache.size > 200) authCache.clear();
  authCache.set(token, { until: Date.now() + 60_000, identity });
  return identity;
}

async function ownerFor(request, env, requireUser = false) {
  const token = bearer(request);
  if (token) {
    const identity = await verifyUser(env, token);
    if (!identity) return { error: json({ error: '登入狀態已失效，請重新登入 Starry ID' }, 401) };
    return { ownerType: 'user', ownerId: text(identity.userId), token, identity, deviceId: deviceId(request) };
  }
  if (requireUser) return { error: json({ error: '請先登入 Starry ID' }, 401) };
  const device = deviceId(request);
  if (!device) return { error: json({ error: 'visitor_device_required' }, 400) };
  return { ownerType: 'device', ownerId: device, token: '', identity: null, deviceId: device };
}

const RANK_ORDER = ['無','3%','6%','9%','12%','12%初階','15%','15%銅章','18%','21%','銀章','金章','白金','紅寶石','創辦人白金','創辦人紅寶石','藍寶石','創辦人藍寶石','明珠','翡翠','創辦人翡翠','鑽石級以上'];
function tierFor(identity) {
  if (!identity) return 'visitor';
  const rank = text(identity.approvedRank || identity.rank);
  if (/鑽石|皇冠|大使/.test(rank)) return 'diamond';
  const index = RANK_ORDER.indexOf(rank);
  if (index >= RANK_ORDER.indexOf('白金')) return 'platinum';
  if (index >= RANK_ORDER.indexOf('15%')) return 'rank15';
  return 'member';
}
function drawLimit(settings, tier) {
  return ({ visitor: settings.drawLimitVisitor, member: settings.drawLimitMember, rank15: settings.drawLimit15, platinum: settings.drawLimitPlatinum, diamond: settings.drawLimitDiamond })[tier] ?? settings.drawLimitMember;
}
function aiLimit(settings, tier) {
  return ({ visitor: settings.aiLimitVisitor, member: settings.aiLimitMember, rank15: settings.aiLimit15, platinum: settings.aiLimitPlatinum, diamond: settings.aiLimitDiamond })[tier] ?? settings.aiLimitMember;
}

async function readSettings(db) {
  const result = await db.prepare('SELECT key,value FROM mirror_settings').all().catch(() => ({ results: [] }));
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of result?.results || []) {
    if (Object.prototype.hasOwnProperty.call(NUMERIC_SETTING_LIMITS, row.key)) settings[row.key] = Number(row.value);
    else if (BOOLEAN_SETTINGS.has(row.key)) settings[row.key] = row.value === '1' || row.value === 'true';
  }
  return settings;
}

async function syncCards(env) {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const db = env.MIRROR_DB;
    const sheetUrl = text(env.MIRROR_SHEET_CSV_URL);
    if (!db || !sheetUrl) throw new Error('mirror_storage_not_ready');
    const response = await fetch(sheetUrl, { headers: { Accept: 'text/csv,*/*;q=0.8' } });
    if (!response.ok) throw new Error(`sheet_fetch_${response.status}`);
    const rows = parseCsv(await response.text());
    if (rows.length < 2) throw new Error('sheet_empty');
    const headers = rows[0].map(value => text(value));
    const found = [];
    for (let col = 2; col < headers.length; col++) {
      const category = headers[col];
      if (!category || category === '未分類') continue;
      for (let row = 1; row < rows.length; row++) {
        const quoteText = normalizeQuote(rows[row]?.[col]);
        if (quoteText) found.push({ quoteText, category });
      }
    }
    if (!found.length) throw new Error('sheet_has_no_quotes');

    const currentResult = await db.prepare('SELECT id,sourceKey,quoteText,category,position,active FROM mirror_cards ORDER BY position').all();
    const current = currentResult?.results || [];
    const byKey = new Map(current.map(row => [text(row.sourceKey), row]));
    let nextPosition = current.reduce((max, row) => Math.max(max, Number(row.position || 0)), 0) + 1;
    const seen = new Set();
    const statements = [];
    const now = Date.now();
    for (const item of found) {
      const key = await sha256(item.quoteText);
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = byKey.get(key);
      if (existing) {
        statements.push(db.prepare(`UPDATE mirror_cards SET quoteText=?,category=?,active=1,lastSeenAt=? WHERE sourceKey=?`)
          .bind(item.quoteText, item.category, now, key));
      } else {
        const id = `Q${String(nextPosition).padStart(6, '0')}`;
        statements.push(db.prepare(`INSERT INTO mirror_cards(id,sourceKey,quoteText,category,position,active,firstSeenAt,lastSeenAt)
          VALUES(?,?,?,?,?,1,?,?)`).bind(id, key, item.quoteText, item.category, nextPosition, now, now));
        nextPosition++;
      }
    }
    for (const existing of current) {
      const key = text(existing.sourceKey);
      if (!seen.has(key) && Number(existing.active || 0) !== 0) {
        statements.push(db.prepare('UPDATE mirror_cards SET active=0,lastSeenAt=? WHERE sourceKey=?').bind(now, key));
      }
    }
    statements.push(db.prepare(`INSERT INTO mirror_sync_state(key,value,updatedAt) VALUES('lastSheetSync',?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt`).bind(String(now), now));
    if (statements.length) await db.batch(statements);
    return { synced: true, count: seen.size };
  })().finally(() => { syncPromise = null; });
  return syncPromise;
}

async function ensureCards(env, ctx) {
  const db = env.MIRROR_DB;
  const countRow = await db.prepare('SELECT COUNT(*) AS count FROM mirror_cards').first().catch(() => ({ count: 0 }));
  const state = await db.prepare("SELECT value FROM mirror_sync_state WHERE key='lastSheetSync' LIMIT 1").first().catch(() => null);
  const last = Number(state?.value || 0);
  if (Number(countRow?.count || 0) === 0) await syncCards(env);
  else if (Date.now() - last > SHEET_SYNC_MS) {
    const task = syncCards(env).catch(error => console.warn('Mirror sheet background sync failed', error));
    if (ctx?.waitUntil) ctx.waitUntil(task); else void task;
  }
}

async function usageRow(db, ownerType, ownerId, day = taiwanDay()) {
  return await db.prepare(`SELECT drawCount,aiCount,favoriteRewardUnits FROM mirror_daily_usage
    WHERE ownerType=? AND ownerId=? AND day=? LIMIT 1`).bind(ownerType, ownerId, day).first().catch(() => null) || { drawCount: 0, aiCount: 0, favoriteRewardUnits: 0 };
}
async function bumpUsage(db, ownerType, ownerId, day, field, amount) {
  if (!['drawCount','aiCount','favoriteRewardUnits'].includes(field)) throw new Error('invalid_usage_field');
  const now = Date.now();
  await db.prepare(`INSERT INTO mirror_daily_usage(ownerType,ownerId,day,drawCount,aiCount,favoriteRewardUnits,updatedAt)
    VALUES(?,?,?,0,0,0,?) ON CONFLICT(ownerType,ownerId,day) DO NOTHING`).bind(ownerType, ownerId, day, now).run();
  await db.prepare(`UPDATE mirror_daily_usage SET ${field}=${field}+?,updatedAt=? WHERE ownerType=? AND ownerId=? AND day=?`)
    .bind(amount, now, ownerType, ownerId, day).run();
}

export async function mergeVisitor(db, userId, device) {
  if (!userId || !device) return;
  const deviceUsage = await db.prepare(`SELECT day,drawCount,aiCount FROM mirror_daily_usage WHERE ownerType='device' AND ownerId=?`).bind(device).all().catch(() => ({ results: [] }));
  for (const row of deviceUsage?.results || []) {
    await db.prepare(`INSERT INTO mirror_daily_usage(ownerType,ownerId,day,drawCount,aiCount,favoriteRewardUnits,updatedAt)
      VALUES('user',?,?,?,?,0,?)
      ON CONFLICT(ownerType,ownerId,day) DO UPDATE SET
        drawCount=mirror_daily_usage.drawCount+excluded.drawCount,
        aiCount=mirror_daily_usage.aiCount+excluded.aiCount,
        updatedAt=excluded.updatedAt`)
      .bind(userId, text(row.day), Number(row.drawCount || 0), Number(row.aiCount || 0), Date.now()).run();
  }
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO mirror_flips(ownerType,ownerId,cardId,firstFlippedAt,rewardUnits,batterySettled)
      SELECT 'user',?,cardId,firstFlippedAt,0,1 FROM mirror_flips WHERE ownerType='device' AND ownerId=?`).bind(userId, device),
    db.prepare(`INSERT OR IGNORE INTO mirror_favorites(ownerType,ownerId,cardId,active,firstFavoritedAt,updatedAt,rewardUnits,batterySettled)
      SELECT 'user',?,cardId,active,firstFavoritedAt,updatedAt,0,1 FROM mirror_favorites WHERE ownerType='device' AND ownerId=?`).bind(userId, device),
    db.prepare(`UPDATE mirror_ai_readings SET ownerType='user',ownerId=? WHERE ownerType='device' AND ownerId=?`).bind(userId, device),
    db.prepare(`DELETE FROM mirror_flips WHERE ownerType='device' AND ownerId=?`).bind(device),
    db.prepare(`DELETE FROM mirror_favorites WHERE ownerType='device' AND ownerId=?`).bind(device),
    db.prepare(`DELETE FROM mirror_daily_usage WHERE ownerType='device' AND ownerId=?`).bind(device)
  ]);
}

function usagePayload(settings, tier, usage) {
  const drawCap = drawLimit(settings, tier);
  const aiCap = aiLimit(settings, tier);
  const usedDraws = Number(usage.drawCount || 0);
  const usedAi = Number(usage.aiCount || 0);
  return {
    tier,
    draws: { used: usedDraws, limit: drawCap, remaining: Math.max(0, drawCap - usedDraws) },
    ai: { used: usedAi, limit: aiCap, remaining: Math.max(0, aiCap - usedAi) }
  };
}

async function settleBattery(env, owner, deltaUnits, type, sourceId, description, uniqueKey) {
  if (owner.ownerType !== 'user' || !deltaUnits) return { success: true, deltaUnits: 0, balanceUnits: Number(owner.identity?.balanceUnits || 0) };
  const result = await bridge(env, '/internal/starry-mirror/battery', owner.token, { deltaUnits, type, sourceId, description, uniqueKey });
  if (!result.ok) return { success: false, status: result.status, ...result.data };
  if (owner.identity) owner.identity.balanceUnits = Number(result.data.balanceUnits || 0);
  return { success: true, ...result.data };
}

async function bootstrap(request, env, ctx) {
  const owner = await ownerFor(request, env);
  if (owner.error) return owner.error;
  const db = env.MIRROR_DB;
  if (owner.ownerType === 'user' && owner.deviceId) await mergeVisitor(db, owner.ownerId, owner.deviceId);
  await ensureCards(env, ctx);
  const [cardsResult, flipsResult, favoritesResult, settings, usage] = await Promise.all([
    db.prepare('SELECT id,quoteText,category,position,active FROM mirror_cards ORDER BY position').all(),
    db.prepare('SELECT cardId,firstFlippedAt FROM mirror_flips WHERE ownerType=? AND ownerId=? ORDER BY firstFlippedAt DESC').bind(owner.ownerType, owner.ownerId).all(),
    db.prepare('SELECT cardId,active,firstFavoritedAt,updatedAt FROM mirror_favorites WHERE ownerType=? AND ownerId=?').bind(owner.ownerType, owner.ownerId).all(),
    readSettings(db),
    usageRow(db, owner.ownerType, owner.ownerId)
  ]);
  const tier = tierFor(owner.identity);
  return json({
    app: { id: APP_ID, name: APP_NAME },
    authenticated: owner.ownerType === 'user',
    identity: owner.identity ? { name: owner.identity.name, rank: owner.identity.approvedRank || owner.identity.rank || '', isSuperAdmin: Boolean(owner.identity.isSuperAdmin) } : null,
    battery: owner.ownerType === 'user' ? unitsToBattery(owner.identity?.balanceUnits || 0) : null,
    cards: cardsResult?.results || [],
    flips: flipsResult?.results || [],
    favorites: favoritesResult?.results || [],
    usage: usagePayload(settings, tier, usage),
    settings: {
      drawRewardBatteries: settings.drawRewardBatteries,
      favoriteRewardBatteries: settings.favoriteRewardBatteries,
      favoriteDailyCapBatteries: settings.favoriteDailyCapBatteries,
      shareCostBatteries: settings.shareCostBatteries,
      aiCostBatteries: settings.aiCostBatteries,
      drawRewardEnabled: settings.drawRewardEnabled,
      favoriteRewardEnabled: settings.favoriteRewardEnabled,
      shareCostEnabled: settings.shareCostEnabled,
      aiCostEnabled: settings.aiCostEnabled,
      aiEnabled: settings.aiEnabled
    }
  });
}

async function flipCard(request, env) {
  const owner = await ownerFor(request, env);
  if (owner.error) return owner.error;
  const input = await request.json().catch(() => ({}));
  const cardId = text(input.cardId);
  const db = env.MIRROR_DB;
  const card = await db.prepare('SELECT id,active FROM mirror_cards WHERE id=? LIMIT 1').bind(cardId).first();
  if (!card || !Number(card.active)) return json({ error: 'card_not_available' }, 404);
  const existing = await db.prepare('SELECT rewardUnits,batterySettled FROM mirror_flips WHERE ownerType=? AND ownerId=? AND cardId=? LIMIT 1')
    .bind(owner.ownerType, owner.ownerId, cardId).first();
  const settings = await readSettings(db);
  const tier = tierFor(owner.identity);
  const day = taiwanDay();
  if (existing) {
    let battery = { success: true, deltaUnits: 0, balanceUnits: Number(owner.identity?.balanceUnits || 0) };
    if (owner.ownerType === 'user' && Number(existing.rewardUnits || 0) && !Number(existing.batterySettled || 0)) {
      battery = await settleBattery(env, owner, Number(existing.rewardUnits), 'mirror_draw_reward', cardId, '繁星心鏡首次翻卡獎勵', `mirror:flip:${owner.ownerId}:${cardId}`);
      if (battery.success) await db.prepare('UPDATE mirror_flips SET batterySettled=1 WHERE ownerType=? AND ownerId=? AND cardId=?').bind(owner.ownerType, owner.ownerId, cardId).run();
    }
    const usage = await usageRow(db, owner.ownerType, owner.ownerId, day);
    return json({ success: true, alreadyFlipped: true, batteryDelta: unitsToBattery(battery.deltaUnits || 0), battery: owner.ownerType === 'user' ? unitsToBattery(battery.balanceUnits || owner.identity?.balanceUnits || 0) : null, usage: usagePayload(settings, tier, usage) });
  }

  const usage = await usageRow(db, owner.ownerType, owner.ownerId, day);
  const limit = drawLimit(settings, tier);
  if (Number(usage.drawCount || 0) >= limit) return json({ error: 'daily_draw_limit', usage: usagePayload(settings, tier, usage) }, 429);
  const rewardUnits = owner.ownerType === 'user' && settings.drawRewardEnabled ? batteryToUnits(settings.drawRewardBatteries) : 0;
  const now = Date.now();
  await db.batch([
    db.prepare('INSERT INTO mirror_flips(ownerType,ownerId,cardId,firstFlippedAt,rewardUnits,batterySettled) VALUES(?,?,?,?,?,?)')
      .bind(owner.ownerType, owner.ownerId, cardId, now, rewardUnits, rewardUnits ? 0 : 1),
    db.prepare(`INSERT INTO mirror_daily_usage(ownerType,ownerId,day,drawCount,aiCount,favoriteRewardUnits,updatedAt)
      VALUES(?,?,?,1,0,0,?) ON CONFLICT(ownerType,ownerId,day) DO UPDATE SET drawCount=drawCount+1,updatedAt=excluded.updatedAt`)
      .bind(owner.ownerType, owner.ownerId, day, now)
  ]);
  let battery = { success: true, deltaUnits: 0, balanceUnits: Number(owner.identity?.balanceUnits || 0) };
  if (rewardUnits) {
    battery = await settleBattery(env, owner, rewardUnits, 'mirror_draw_reward', cardId, '繁星心鏡首次翻卡獎勵', `mirror:flip:${owner.ownerId}:${cardId}`);
    if (battery.success) await db.prepare('UPDATE mirror_flips SET batterySettled=1 WHERE ownerType=? AND ownerId=? AND cardId=?').bind(owner.ownerType, owner.ownerId, cardId).run();
  }
  const nextUsage = await usageRow(db, owner.ownerType, owner.ownerId, day);
  return json({ success: true, alreadyFlipped: false, batteryDelta: battery.success ? unitsToBattery(rewardUnits) : 0, battery: owner.ownerType === 'user' ? unitsToBattery(battery.balanceUnits || owner.identity?.balanceUnits || 0) : null, usage: usagePayload(settings, tier, nextUsage) });
}

async function favoriteCard(request, env) {
  const owner = await ownerFor(request, env);
  if (owner.error) return owner.error;
  const input = await request.json().catch(() => ({}));
  const cardId = text(input.cardId);
  const active = input.active !== false;
  const db = env.MIRROR_DB;
  const card = await db.prepare('SELECT id,active FROM mirror_cards WHERE id=? LIMIT 1').bind(cardId).first();
  if (!card || !Number(card.active)) return json({ error: 'card_not_available' }, 404);
  const existing = await db.prepare('SELECT active,rewardUnits,batterySettled,firstFavoritedAt FROM mirror_favorites WHERE ownerType=? AND ownerId=? AND cardId=? LIMIT 1')
    .bind(owner.ownerType, owner.ownerId, cardId).first();
  const now = Date.now();
  if (!active) {
    if (existing) await db.prepare('UPDATE mirror_favorites SET active=0,updatedAt=? WHERE ownerType=? AND ownerId=? AND cardId=?').bind(now, owner.ownerType, owner.ownerId, cardId).run();
    return json({ success: true, active: false, batteryDelta: 0 });
  }
  if (existing) {
    await db.prepare('UPDATE mirror_favorites SET active=1,updatedAt=? WHERE ownerType=? AND ownerId=? AND cardId=?').bind(now, owner.ownerType, owner.ownerId, cardId).run();
    let battery = { success: true, deltaUnits: 0, balanceUnits: Number(owner.identity?.balanceUnits || 0) };
    if (owner.ownerType === 'user' && Number(existing.rewardUnits || 0) && !Number(existing.batterySettled || 0)) {
      battery = await settleBattery(env, owner, Number(existing.rewardUnits), 'mirror_favorite_reward', cardId, '繁星心鏡首次收藏獎勵', `mirror:favorite:${owner.ownerId}:${cardId}`);
      if (battery.success) await db.prepare('UPDATE mirror_favorites SET batterySettled=1 WHERE ownerType=? AND ownerId=? AND cardId=?').bind(owner.ownerType, owner.ownerId, cardId).run();
    }
    return json({ success: true, active: true, firstReward: false, batteryDelta: unitsToBattery(battery.deltaUnits || 0), battery: owner.ownerType === 'user' ? unitsToBattery(battery.balanceUnits || owner.identity?.balanceUnits || 0) : null });
  }

  const settings = await readSettings(db);
  const day = taiwanDay();
  const usage = await usageRow(db, owner.ownerType, owner.ownerId, day);
  const dailyCapUnits = batteryToUnits(settings.favoriteDailyCapBatteries);
  const alreadyRewardedUnits = Number(usage.favoriteRewardUnits || 0);
  const rewardUnits = owner.ownerType === 'user' && settings.favoriteRewardEnabled
    ? Math.max(0, Math.min(batteryToUnits(settings.favoriteRewardBatteries), dailyCapUnits - alreadyRewardedUnits)) : 0;
  await db.prepare(`INSERT INTO mirror_favorites(ownerType,ownerId,cardId,active,firstFavoritedAt,updatedAt,rewardUnits,batterySettled)
    VALUES(?,?,?,1,?,?,?,?,?)`).bind(owner.ownerType, owner.ownerId, cardId, now, now, rewardUnits, rewardUnits ? 0 : 1).run();
  if (rewardUnits) await bumpUsage(db, owner.ownerType, owner.ownerId, day, 'favoriteRewardUnits', rewardUnits);
  let battery = { success: true, deltaUnits: 0, balanceUnits: Number(owner.identity?.balanceUnits || 0) };
  if (rewardUnits) {
    battery = await settleBattery(env, owner, rewardUnits, 'mirror_favorite_reward', cardId, '繁星心鏡首次收藏獎勵', `mirror:favorite:${owner.ownerId}:${cardId}`);
    if (battery.success) await db.prepare('UPDATE mirror_favorites SET batterySettled=1 WHERE ownerType=? AND ownerId=? AND cardId=?').bind(owner.ownerType, owner.ownerId, cardId).run();
  }
  return json({ success: true, active: true, firstReward: rewardUnits > 0, batteryDelta: battery.success ? unitsToBattery(rewardUnits) : 0, battery: owner.ownerType === 'user' ? unitsToBattery(battery.balanceUnits || owner.identity?.balanceUnits || 0) : null });
}

async function sharePreflight(request, env) {
  const owner = await ownerFor(request, env);
  if (owner.error) return owner.error;
  const settings = await readSettings(env.MIRROR_DB);
  const costUnits = owner.ownerType === 'user' && settings.shareCostEnabled ? batteryToUnits(settings.shareCostBatteries) : 0;
  const balanceUnits = Number(owner.identity?.balanceUnits || 0);
  return json({ allowed: owner.ownerType !== 'user' || costUnits <= balanceUnits, cost: unitsToBattery(costUnits), battery: owner.ownerType === 'user' ? unitsToBattery(balanceUnits) : null });
}

async function chargeShare(request, env) {
  const owner = await ownerFor(request, env);
  if (owner.error) return owner.error;
  const input = await request.json().catch(() => ({}));
  const operationId = text(input.operationId);
  const cardId = text(input.cardId);
  if (!/^[A-Za-z0-9_-]{12,120}$/.test(operationId)) return json({ error: 'invalid_operation' }, 400);
  const db = env.MIRROR_DB;
  const existing = await db.prepare('SELECT costUnits FROM mirror_share_events WHERE operationId=? LIMIT 1').bind(operationId).first();
  if (existing) return json({ success: true, duplicate: true, batteryDelta: 0, cost: unitsToBattery(existing.costUnits || 0) });
  const settings = await readSettings(db);
  const costUnits = owner.ownerType === 'user' && settings.shareCostEnabled ? batteryToUnits(settings.shareCostBatteries) : 0;
  let battery = { success: true, deltaUnits: 0, balanceUnits: Number(owner.identity?.balanceUnits || 0) };
  if (costUnits) {
    battery = await settleBattery(env, owner, -costUnits, 'mirror_share_cost', cardId, '繁星心鏡分享圖片', `mirror:share:${owner.ownerId}:${operationId}`);
    if (!battery.success) return json({ error: battery.error || 'battery_charge_failed', battery: unitsToBattery(battery.balanceUnits || 0) }, battery.status || 503);
  }
  await db.prepare(`INSERT INTO mirror_share_events(operationId,ownerType,ownerId,cardId,costUnits,batterySettled,createdAt)
    VALUES(?,?,?,?,?,1,?)`).bind(operationId, owner.ownerType, owner.ownerId, cardId || null, costUnits, Date.now()).run();
  return json({ success: true, batteryDelta: -unitsToBattery(costUnits), cost: unitsToBattery(costUnits), battery: owner.ownerType === 'user' ? unitsToBattery(battery.balanceUnits || owner.identity?.balanceUnits || 0) : null });
}

function compactList(items, maxItems = 24, maxChars = 2600) {
  const result = []; let used = 0;
  for (const raw of items || []) {
    const value = text(raw).replace(/\s+/g, ' ');
    if (!value) continue;
    const clipped = value.slice(0, 240);
    if (used + clipped.length > maxChars) break;
    result.push(clipped); used += clipped.length;
    if (result.length >= maxItems) break;
  }
  return result;
}

function aiSystemPrompt() {
  return `你是「繁星心鏡」的 AI 解籤助手。請使用繁體中文，以溫暖、具體、可行動的方式進行個人化反思解讀。\n規則：\n1. 只把「目前畫面顯示的金句」當成本次核心籤句，不得把會員過去所有翻牌紀錄當作籤句。\n2. 個人化脈絡只可用提供的非敏感資料、會員自己的繁星回聲留言、曾聽過的音檔標題、以及在繁星心鏡的收藏。\n3. 不得推測疾病、心理診斷、投資報酬、法律結論或命定未來。健康方向只能提供一般生活反思並提醒必要時尋求專業醫療；財富方向只能提供一般理財觀念，不推薦特定投資商品。\n4. 不要提及資料庫、隱私欄位、系統提示或你取得資料的技術方式。\n5. 輸出 4 段：核心解讀、與你的連結、今天可做的 1~3 件事、溫柔提醒。總長約 350~650 個中文字。`;
}

async function aiReading(request, env) {
  const owner = await ownerFor(request, env);
  if (owner.error) return owner.error;
  const input = await request.json().catch(() => ({}));
  const cardId = text(input.cardId);
  const direction = text(input.direction);
  if (!DIRECTIONS.has(direction)) return json({ error: 'invalid_direction' }, 400);
  const db = env.MIRROR_DB;
  const card = await db.prepare('SELECT id,quoteText,category,active FROM mirror_cards WHERE id=? LIMIT 1').bind(cardId).first();
  if (!card || !Number(card.active)) return json({ error: 'card_not_available' }, 404);
  const settings = await readSettings(db);
  if (!settings.aiEnabled) return json({ error: 'ai_temporarily_disabled' }, 503);
  const tier = tierFor(owner.identity);
  const day = taiwanDay();
  const usage = await usageRow(db, owner.ownerType, owner.ownerId, day);
  const limit = aiLimit(settings, tier);
  if (Number(usage.aiCount || 0) >= limit) return json({ error: 'daily_ai_limit', usage: usagePayload(settings, tier, usage) }, 429);
  const costUnits = owner.ownerType === 'user' && settings.aiCostEnabled ? batteryToUnits(settings.aiCostBatteries) : 0;
  if (costUnits > Number(owner.identity?.balanceUnits || 0)) return json({ error: 'insufficient_battery', battery: unitsToBattery(owner.identity?.balanceUnits || 0) }, 402);
  if (!env.AI?.run) return json({ error: 'ai_binding_unavailable' }, 503);

  let profile = {}, comments = [], listenedTitles = [];
  if (owner.ownerType === 'user') {
    const context = await bridge(env, '/internal/starry-mirror/context', owner.token);
    if (context.ok) {
      profile = context.data.profile || {};
      comments = compactList(context.data.comments || [], 24, 2600);
      listenedTitles = compactList(context.data.listenedTitles || [], 30, 1800);
    }
  }
  const favoritesResult = await db.prepare(`SELECT c.quoteText FROM mirror_favorites f JOIN mirror_cards c ON c.id=f.cardId
    WHERE f.ownerType=? AND f.ownerId=? AND f.active=1 ORDER BY f.updatedAt DESC LIMIT 24`).bind(owner.ownerType, owner.ownerId).all().catch(() => ({ results: [] }));
  const favorites = compactList((favoritesResult?.results || []).map(row => row.quoteText), 20, 1800);

  const contextPayload = {
    解讀方向: direction,
    當前顯示金句: text(card.quoteText),
    金句分類: text(card.category),
    個人基本脈絡: profile,
    本人在繁星回聲近期留言: comments,
    本人曾聽過的繁星回聲音檔標題: listenedTitles,
    本人在繁星心鏡收藏的金句: favorites
  };
  const model = text(env.MIRROR_AI_MODEL) || DEFAULT_AI_MODEL;
  let result;
  try {
    result = await env.AI.run(model, {
      messages: [
        { role: 'system', content: aiSystemPrompt() },
        { role: 'user', content: `請針對以下資料進行「${direction}」方向的解籤。\n${JSON.stringify(contextPayload)}` }
      ],
      max_tokens: 900,
      temperature: 0.7
    });
  } catch (error) {
    console.error('Workers AI reading failed', error);
    return json({ error: 'ai_temporarily_unavailable' }, 503);
  }
  const resultText = text(result?.response || result?.result?.response || result?.text);
  if (!resultText) return json({ error: 'ai_empty_response' }, 503);
  const id = `AI-${crypto.randomUUID()}`;
  const now = Date.now();
  await db.batch([
    db.prepare(`INSERT INTO mirror_ai_readings(id,ownerType,ownerId,cardId,quoteText,direction,resultText,model,costUnits,batterySettled,createdAt)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id, owner.ownerType, owner.ownerId, cardId, text(card.quoteText), direction, resultText, model, costUnits, costUnits ? 0 : 1, now),
    db.prepare(`INSERT INTO mirror_daily_usage(ownerType,ownerId,day,drawCount,aiCount,favoriteRewardUnits,updatedAt)
      VALUES(?,?,?,0,1,0,?) ON CONFLICT(ownerType,ownerId,day) DO UPDATE SET aiCount=aiCount+1,updatedAt=excluded.updatedAt`)
      .bind(owner.ownerType, owner.ownerId, day, now)
  ]);
  let battery = { success: true, deltaUnits: 0, balanceUnits: Number(owner.identity?.balanceUnits || 0) };
  if (costUnits) {
    battery = await settleBattery(env, owner, -costUnits, 'mirror_ai_cost', id, '繁星心鏡 AI 解籤', `mirror:ai:${owner.ownerId}:${id}`);
    if (battery.success) await db.prepare('UPDATE mirror_ai_readings SET batterySettled=1 WHERE id=?').bind(id).run();
  }
  const nextUsage = await usageRow(db, owner.ownerType, owner.ownerId, day);
  return json({
    success: true,
    reading: { id, cardId, quoteText: text(card.quoteText), direction, resultText, createdAt: now },
    batteryDelta: battery.success ? -unitsToBattery(costUnits) : 0,
    battery: owner.ownerType === 'user' ? unitsToBattery(battery.balanceUnits || owner.identity?.balanceUnits || 0) : null,
    usage: usagePayload(settings, tier, nextUsage)
  });
}

async function aiHistory(request, env) {
  const owner = await ownerFor(request, env);
  if (owner.error) return owner.error;
  const rows = await env.MIRROR_DB.prepare(`SELECT id,cardId,quoteText,direction,resultText,createdAt FROM mirror_ai_readings
    WHERE ownerType=? AND ownerId=? ORDER BY createdAt DESC LIMIT 100`).bind(owner.ownerType, owner.ownerId).all();
  return json({ readings: rows?.results || [] });
}

async function requireAdmin(request, env) {
  const owner = await ownerFor(request, env, true);
  if (owner.error) return owner;
  if (!owner.identity?.isSuperAdmin) return { error: json({ error: 'super_admin_only' }, 403) };
  return owner;
}

async function adminSettings(request, env) {
  const owner = await requireAdmin(request, env);
  if (owner.error) return owner.error;
  const db = env.MIRROR_DB;
  if (request.method === 'GET') return json({ settings: await readSettings(db), directions: [...DIRECTIONS] });
  const input = await request.json().catch(() => ({}));
  const incoming = input?.settings && typeof input.settings === 'object' ? input.settings : {};
  const before = await readSettings(db);
  const statements = [];
  const now = Date.now();
  for (const [key, raw] of Object.entries(incoming)) {
    let value;
    if (Object.prototype.hasOwnProperty.call(NUMERIC_SETTING_LIMITS, key)) {
      const [min, max] = NUMERIC_SETTING_LIMITS[key]; value = String(clampInt(raw, min, max));
    } else if (BOOLEAN_SETTINGS.has(key)) value = raw ? '1' : '0';
    else continue;
    statements.push(db.prepare(`INSERT INTO mirror_settings(key,value,updatedAt,updatedBy) VALUES(?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt,updatedBy=excluded.updatedBy`)
      .bind(key, value, now, owner.ownerId));
    statements.push(db.prepare('INSERT INTO mirror_admin_audit(id,userId,key,oldValue,newValue,createdAt) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), owner.ownerId, key, String(before[key]), value, now));
  }
  if (statements.length) await db.batch(statements);
  return json({ success: true, settings: await readSettings(db) });
}

async function adminSync(request, env) {
  const owner = await requireAdmin(request, env);
  if (owner.error) return owner.error;
  try { return json({ success: true, ...(await syncCards(env)) }); }
  catch (error) { return json({ error: text(error?.message) || 'sync_failed' }, 503); }
}

async function health(env) {
  let d1 = false;
  try { const row = await env.MIRROR_DB?.prepare('SELECT 1 AS ok').first(); d1 = Number(row?.ok || 0) === 1; } catch {}
  return json({ app: APP_ID, name: APP_NAME, status: d1 ? 'ok' : 'degraded', d1, ai: Boolean(env.AI?.run), bridge: Boolean(env.STARRY_ECOSYSTEM?.fetch) }, d1 ? 200 : 503);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();
    try {
      if (path === '/api/mirror/health' && method === 'GET') return health(env);
      if (path === '/api/mirror/bootstrap' && method === 'GET') return bootstrap(request, env, ctx);
      if (path === '/api/mirror/flip' && method === 'POST') return flipCard(request, env);
      if (path === '/api/mirror/favorite' && method === 'POST') return favoriteCard(request, env);
      if (path === '/api/mirror/share-preflight' && method === 'GET') return sharePreflight(request, env);
      if (path === '/api/mirror/share-charge' && method === 'POST') return chargeShare(request, env);
      if (path === '/api/mirror/ai-readings' && method === 'POST') return aiReading(request, env);
      if (path === '/api/mirror/ai-history' && method === 'GET') return aiHistory(request, env);
      if (path === '/api/mirror/admin/settings' && (method === 'GET' || method === 'PUT')) return adminSettings(request, env);
      if (path === '/api/mirror/admin/sync' && method === 'POST') return adminSync(request, env);
      return json({ error: 'not_found' }, 404);
    } catch (error) {
      console.error('Starry Mirror worker error', error);
      return json({ error: 'server_error' }, 500);
    }
  }
};
