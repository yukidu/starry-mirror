(() => {
  'use strict';

  const state = {
    data: null,
    cards: [],
    flips: new Set(),
    favorites: new Set(),
    category: 'all',
    current: null,
    lastPoint: { x: innerWidth / 2, y: innerHeight / 2 }
  };
  const DEVICE_KEY = 'starry_mirror_device_v1';
  const DIRECTIONS = ['事業','健康','財富','愛情','職場','人際關係','生涯規劃','學業','心靈'];

  const STYLE = `
    .mirror-card-preview{position:relative;z-index:3;width:78%;font-weight:950;line-height:1.12;text-align:center;word-break:break-all;font-size:clamp(.72rem,2.9vw,1.08rem);text-shadow:0 1px 0 #fff8}.mirror-card-id{position:absolute;z-index:4;right:7px;bottom:5px;font-size:9px;font-weight:900;opacity:.58}.mirror-card-done .card-front{background:linear-gradient(145deg,#fff7ed,#fce7f3)!important;opacity:1!important;filter:none!important}.mirror-card-done .card-emoji-bg{opacity:.12!important}.mirror-card-new .card-front{background:linear-gradient(145deg,var(--primary),#fff0a8)!important}.mirror-card-new .card-emoji-bg{opacity:.5!important}.mirror-card-shell{transition:transform .16s ease}.mirror-card-shell:active{transform:scale(.96)}
    .mirror-layer{position:fixed;z-index:15000;inset:0;background:rgba(2,6,23,.72);backdrop-filter:blur(8px);display:grid;place-items:center;padding:calc(var(--starry-nav-height,72px) + 12px) 12px 12px}.mirror-dialog{width:min(94vw,520px);max-height:calc(100dvh - var(--starry-nav-height,72px) - 28px);overflow:auto;background:#fff;color:#111827;border:5px solid #111827;border-radius:28px;box-shadow:9px 9px 0 #fff;padding:22px;position:relative}.mirror-close{position:absolute;right:10px;top:10px;width:40px;height:40px;border-radius:50%;border:3px solid #111827;background:#fff;font-size:20px;font-weight:950}.mirror-quote{font-size:clamp(1.35rem,6vw,2.15rem);font-weight:950;line-height:1.45;text-align:center;padding:34px 8px 18px}.mirror-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.mirror-actions button,.mirror-primary{min-height:46px;border:3px solid #111827;border-radius:14px;background:#fff;font-weight:900;padding:8px}.mirror-actions .fav{background:#fce7f3}.mirror-actions .ai{background:#ede9fe}.mirror-actions .share{background:#dcfce7}.mirror-direction-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0}.mirror-direction-grid button{min-height:44px;border:2px solid #111827;border-radius:12px;background:#f8fafc;font-weight:900}.mirror-direction-grid button:hover{background:#ede9fe}.mirror-reading{white-space:pre-wrap;line-height:1.75;font-size:15px;background:#f8fafc;border:2px solid #e2e8f0;border-radius:16px;padding:15px;margin:14px 0}.mirror-battery-pop{position:fixed;z-index:20000;pointer-events:none;font-size:24px;font-weight:1000;text-shadow:0 2px 2px #fff,0 0 8px #fff;transform:translate(-50%,-50%);animation:mirrorBatteryPop 1s ease-out forwards}.mirror-battery-pop.plus{color:#ef4444}.mirror-battery-pop.minus{color:#16a34a}@keyframes mirrorBatteryPop{0%{opacity:0;transform:translate(-50%,-30%) scale(.75)}20%{opacity:1;transform:translate(-50%,-55%) scale(1.2)}100%{opacity:0;transform:translate(-50%,-110%) scale(.95)}}
    .mirror-page{width:min(1000px,calc(100% - 24px));margin:0 auto;padding:22px 0 70px;color:#111827}.mirror-page-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.mirror-page h1{font-size:clamp(1.55rem,5vw,2.35rem);font-weight:1000;margin:0}.mirror-back{border:2px solid #111827;border-radius:12px;background:#fff;padding:9px 13px;font-weight:900}.mirror-list{display:grid;gap:12px}.mirror-list-card{background:#fff;border:3px solid #111827;border-radius:20px;padding:15px;box-shadow:5px 5px 0 #111827}.mirror-list-card .quote{font-size:18px;font-weight:950;line-height:1.5}.mirror-meta{font-size:12px;opacity:.62;margin:7px 0}.mirror-list-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.mirror-list-actions button{border:2px solid #111827;border-radius:11px;background:#fff;padding:8px 11px;font-weight:900}.mirror-empty{text-align:center;padding:50px 16px;font-weight:900;opacity:.6}.mirror-admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mirror-setting{background:#fff;border:2px solid #dbe3ee;border-radius:16px;padding:13px}.mirror-setting label{display:block;font-weight:900;font-size:13px;margin-bottom:7px}.mirror-setting input[type=number]{width:100%;min-height:42px;border:2px solid #111827;border-radius:10px;padding:8px;font-weight:900}.mirror-toggle{display:flex;align-items:center;gap:10px;font-weight:900}.mirror-admin-actions{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.mirror-admin-actions button{min-height:46px;border:3px solid #111827;border-radius:13px;padding:8px 15px;font-weight:950;background:#fef3c7}.mirror-admin-note{font-size:13px;line-height:1.65;background:#eff6ff;border-radius:14px;padding:12px;margin-bottom:16px}.mirror-spinner{width:26px;height:26px;border:4px solid #ddd;border-top-color:#4338ca;border-radius:50%;animation:mirrorSpin .7s linear infinite;margin:25px auto}@keyframes mirrorSpin{to{transform:rotate(360deg)}}
    html.starry-dark .mirror-page{color:#f8fafc}html.starry-dark .mirror-list-card,html.starry-dark .mirror-setting{color:#111827}
    @media(max-width:600px){.mirror-actions{grid-template-columns:1fr}.mirror-direction-grid{grid-template-columns:repeat(2,1fr)}.mirror-admin-grid{grid-template-columns:1fr}.mirror-dialog{padding:18px}.mirror-quote{padding-top:38px}}

    .mirror-date-wheel{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin:18px 0}.mirror-date-wheel label{font-weight:900;text-align:center}.mirror-date-wheel select{width:100%;height:200px;overflow-y:auto;border:2px solid #b7c6dc;border-radius:16px;background:#f8fafc;color:#111827;font-weight:950;text-align:center;font-size:20px;appearance:auto}.mirror-date-wheel option{padding:8px;min-height:38px}.mirror-choice-actions{display:flex;flex-direction:column;gap:12px}.mirror-choice-actions button{min-height:48px;border-radius:12px;border:2px solid #111827;background:#ede9fe;font-size:17px;font-weight:900}.mirror-choice-actions .mirror-secondary{background:#fff}.mirror-big-notice{width:min(95vw,550px);text-align:center;padding:35px 18px;cursor:pointer}.mirror-big-notice h2{font-size:clamp(28px,7vw,44px);line-height:1.2;margin:12px 0}.mirror-big-notice .mirror-big-number{font-size:clamp(38px,11vw,64px);font-weight:1000;color:#6d28d9;line-height:1.25;margin:12px 0}.mirror-big-notice .mirror-big-fee{font-size:clamp(19px,5vw,30px);font-weight:950;line-height:1.4}.mirror-admin-tabs{display:flex;flex-wrap:wrap;gap:9px;margin:0 0 18px}.mirror-admin-tabs button{border:2px solid #111827;border-radius:12px;padding:11px 14px;font-weight:900;background:#fff}.mirror-admin-tabs button[aria-selected="true"]{background:#ddd6fe}.mirror-admin-models{width:100%;border-collapse:collapse;background:white;color:#111827}.mirror-admin-models th,.mirror-admin-models td{padding:12px 9px;border-bottom:1px solid #cbd5e1;text-align:left;vertical-align:middle}.mirror-admin-models tr{cursor:pointer}.mirror-admin-models input{width:21px;height:21px;accent-color:#6d28d9}.mirror-admin-models tr[aria-selected="true"]{background:#ede9fe}.mirror-model-note{font-size:13px;opacity:.75}.mirror-guard-note{background:#fef3c7;border-radius:12px;padding:10px;margin:10px 0;font-weight:850}
  `;

  function installStyle() {
    if (document.getElementById('mirrorRuntimeStyle')) return;
    const style = document.createElement('style'); style.id = 'mirrorRuntimeStyle'; style.textContent = STYLE; document.head.appendChild(style);
  }
  function deviceId() {
    let value = localStorage.getItem(DEVICE_KEY) || '';
    if (/^[A-Za-z0-9_-]{20,100}$/.test(value)) return value;
    const bytes = new Uint8Array(24); crypto.getRandomValues(bytes);
    value = btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
    localStorage.setItem(DEVICE_KEY, value); return value;
  }
  function headers(jsonBody = false) {
    const result = { 'X-Mirror-Device': deviceId(), Accept: 'application/json' };
    const token = window.StarryPlatform?.auth?.getToken?.(); if (token) result.Authorization = `Bearer ${token}`;
    if (jsonBody) result['Content-Type'] = 'application/json'; return result;
  }
  async function api(path, options = {}) {
    const response = await fetch(window.StarryConfig.mirrorApiBase + path, { cache: 'no-store', ...options, headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || '操作失敗'); error.status = response.status; error.data = data; throw error; }
    return data;
  }
  function toast(message) {
    const old = document.getElementById('mirrorToast'); old?.remove(); const el = document.createElement('div'); el.id = 'mirrorToast'; el.textContent = message;
    Object.assign(el.style,{position:'fixed',left:'50%',top:'calc(var(--starry-nav-height,72px) + 14px)',transform:'translateX(-50%)',zIndex:'21000',background:'#111827',color:'#fff',padding:'10px 16px',borderRadius:'999px',fontWeight:'900',boxShadow:'0 8px 25px #0005'}); document.body.append(el); setTimeout(()=>el.remove(),2200);
  }
  function deltaPop(delta, point = state.lastPoint) {
    const amount = Number(delta || 0); if (!amount) return; const el = document.createElement('div'); el.className = `mirror-battery-pop ${amount > 0 ? 'plus' : 'minus'}`; el.textContent = `${amount > 0 ? '+' : ''}${amount} 🔋`;
    el.style.left = `${Math.max(24,Math.min(innerWidth-24,Number(point?.x)||innerWidth/2))}px`; el.style.top = `${Math.max(80,Math.min(innerHeight-24,Number(point?.y)||innerHeight/2))}px`; document.body.append(el); setTimeout(()=>el.remove(),1050);
  }
  function pointFromEvent(event) { if (event && Number.isFinite(event.clientX)) state.lastPoint = { x:event.clientX, y:event.clientY }; return state.lastPoint; }
  function chinesePreview(value) {
    const chars = Array.from(String(value || '')).filter(ch => /\p{Script=Han}/u.test(ch)); const first = chars.slice(0,10).join(''); return chars.length > 10 ? first + '…' : (first || String(value || '').slice(0,10));
  }
  function activeCards() { return state.cards.filter(card => Number(card.active) === 1); }
  function updateUiStatus(data = state.data) { if (data) window.StarryUI?.renderMirrorStatus?.(data); }
  function setUsage(usage, battery) { if (!state.data) return; if (usage) state.data.usage = usage; if (battery !== undefined) state.data.battery = battery; updateUiStatus(); }

  async function loadBootstrap() {
    if (!window.StarryPlatform?.auth?.getToken?.()) await window.StarryPlatform?.auth?.refreshIdentity?.();
    try { state.data = await api('/bootstrap'); }
    catch (error) {
      if (error.status !== 401) throw error;
      // The Starry ID session can outlive its short-lived Mirror app token.
      // Reissue that token once before incorrectly displaying an empty card grid.
      await window.StarryPlatform?.auth?.refreshIdentity?.();
      state.data = await api('/bootstrap');
    }
    state.cards = state.data.cards || []; state.flips = new Set((state.data.flips || []).map(row => row.cardId)); state.favorites = new Set((state.data.favorites || []).filter(row => Number(row.active) === 1).map(row => row.cardId)); updateUiStatus();
  }
  function populateCategories() {
    const options = document.getElementById('dropdownOptions'); if (!options) return; const categories = [...new Set(activeCards().map(card => card.category).filter(Boolean))]; options.innerHTML = '';
    const add = (value,label) => { const div = document.createElement('div'); div.className = 'dropdown-item'; div.textContent = label; div.addEventListener('click', event => { event.stopPropagation(); switchCategory(value); document.getElementById('dropdownOptions')?.classList.remove('active'); }); options.append(div); };
    add('all','🌟 全部'); categories.forEach(category => add(category,category));
  }
  function switchCategory(category) { state.category = category; const label = document.getElementById('dropdownLabel'); if (label) label.textContent = category === 'all' ? '🌟 全部' : category; renderGrid(); updateStats(); }
  function updateStats() { const total = activeCards().length; const done = activeCards().filter(card => state.flips.has(card.id)).length; const a = document.getElementById('statCompleted'), b = document.getElementById('statRemaining'); if (a) a.textContent = String(done); if (b) b.textContent = String(Math.max(0,total-done)); }
  function renderGrid() {
    const grid = document.getElementById('cardsGrid'); if (!grid) return; grid.innerHTML = ''; let cards = activeCards(); if (state.category !== 'all') cards = cards.filter(card => card.category === state.category); cards.sort((a,b)=>Number(a.position)-Number(b.position));
    const fragment = document.createDocumentFragment();
    for (const card of cards) {
      const done = state.flips.has(card.id); const shell = document.createElement('div'); shell.className = `card-container mirror-card-shell ${done?'mirror-card-done':'mirror-card-new'}`; shell.dataset.cardId = card.id;
      const preview = done ? chinesePreview(card.quoteText) : String(card.position);
      shell.innerHTML = `<div class="card-inner"><div class="card-face card-front"><div class="card-emoji-bg">${done?'🪞':'💎'}</div><span class="mirror-card-preview">${escapeHtml(preview)}</span><span class="mirror-card-id">${escapeHtml(card.id)}</span></div><div class="card-face card-back"></div></div>`;
      shell.addEventListener('click', event => openCard(card,event)); fragment.append(shell);
    }
    grid.append(fragment);
  }
  function escapeHtml(value) { return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  async function openCard(card, event) {
    pointFromEvent(event); let firstFlip = false;
    if (!state.flips.has(card.id)) {
      try {
        const result = await api('/flip',{method:'POST',body:JSON.stringify({cardId:card.id})}); firstFlip = !result.alreadyFlipped; state.flips.add(card.id); setUsage(result.usage,result.battery); deltaPop(result.batteryDelta,event);
      } catch (error) {
        if (error.status === 429) { toast('今天的抽卡次數已用完 🌙'); if (error.data?.usage) setUsage(error.data.usage); return; }
        toast('抽卡暫時失敗，請稍後再試'); return;
      }
    }
    state.current = card; renderGrid(); updateStats(); showCardDialog(card, firstFlip);
  }

  function layer(content) { const el = document.createElement('div'); el.className = 'mirror-layer'; el.innerHTML = `<div class="mirror-dialog">${content}</div>`; document.body.append(el); return el; }
  function closeLayer(el) { el?.remove(); }
  function showCardDialog(card) {
    const favorited = state.favorites.has(card.id); const el = layer(`<button class="mirror-close" aria-label="關閉">✕</button><div class="mirror-quote">${escapeHtml(card.quoteText)}</div><div class="mirror-meta" style="text-align:center">${escapeHtml(card.category)} · ${escapeHtml(card.id)}</div><div class="mirror-actions"><button class="fav">${favorited?'💔 取消收藏':'❤️ 收藏'}</button><button class="ai">🔮 AI解籤</button><button class="share">📤 分享圖片</button></div>`);
    el.querySelector('.mirror-close').onclick=()=>closeLayer(el); el.addEventListener('click',e=>{if(e.target===el)closeLayer(el)});
    el.querySelector('.fav').onclick=event=>toggleFavorite(card,event,el); el.querySelector('.ai').onclick=()=>chooseDirection(card,el); el.querySelector('.share').onclick=event=>shareQuote(card,event);
  }
  async function toggleFavorite(card,event,dialog) {
    pointFromEvent(event); const active = !state.favorites.has(card.id);
    try { const result = await api('/favorite',{method:'POST',body:JSON.stringify({cardId:card.id,active})}); if (active) state.favorites.add(card.id); else state.favorites.delete(card.id); if (result.battery !== undefined) setUsage(null,result.battery); deltaPop(result.batteryDelta,event); dialog.querySelector('.fav').textContent = active ? '💔 取消收藏' : '❤️ 收藏'; toast(active?'已加入收藏':'已取消收藏'); }
    catch { toast('收藏操作暫時失敗'); }
  }
  function chooseDirection(card,parent) {
    const el = layer(`<button class="mirror-close">✕</button><h2 style="font-size:22px;font-weight:950;margin:2px 0 8px">AI解籤方向</h2><p style="font-weight:750;opacity:.7">請選擇這一句金句要從哪個方向解讀：</p><div class="mirror-direction-grid">${DIRECTIONS.map(d=>`<button data-direction="${d}">${d}</button>`).join('')}</div>`);
    el.querySelector('.mirror-close').onclick=()=>closeLayer(el); el.querySelectorAll('[data-direction]').forEach(btn=>btn.onclick=()=>runAi(card,btn.dataset.direction,el,parent));
  }
  async function runAi(card,direction,chooser,parent) {
    const controller = new AbortController();
    let timedOut = false, canceled = false;
    const dialog = chooser.querySelector('.mirror-dialog');
    dialog.innerHTML = '<button type="button" class="mirror-close" aria-label="取消等待">✕</button><div class="mirror-spinner"></div><div class="mirror-ai-wait-text" style="text-align:center;font-weight:900">正在照見你的個人化線索…</div><div style="text-align:center;font-size:13px;opacity:.75">如果模型忙碌，會自動嘗試其他免費 AI，最長約 45 秒</div>';
    dialog.querySelector('.mirror-close').onclick = () => {
      canceled = true;
      controller.abort();
      closeLayer(chooser);
    };
    const waitText = dialog.querySelector('.mirror-ai-wait-text');
    const noticeTimer = setTimeout(() => {
      if (!controller.signal.aborted) waitText.textContent = '正在嘗試 AI 模型，請稍候…';
    }, 12_000);
    const timeoutTimer = setTimeout(() => { timedOut = true; controller.abort(); }, 46_000);
    try {
      const result = await api('/ai-readings', {
        method:'POST',
        body:JSON.stringify({cardId:card.id,direction}),
        signal:controller.signal
      });
      if (canceled || timedOut) return;
      closeLayer(chooser);
      if (result.battery !== undefined) setUsage(result.usage,result.battery);
      deltaPop(result.batteryDelta);
      showReading(result.reading);
    } catch(error) {
      if (canceled) return;
      closeLayer(chooser);
      if (timedOut || error.name === 'AbortError') {
        toast('AI 等候逾時，請稍後重試，也可到解籤紀錄查看結果');
      } else if (error.status === 429 && error.data?.error === 'ai_free_quota_exhausted') {
        toast('Cloudflare 今日免費 AI 額度已用完，請明天再試');
      } else if (error.status === 429) {
        if (error.data?.usage) setUsage(error.data.usage);
        toast('今天的 AI 解籤次數已用完');
      } else if (error.status === 402) {
        toast('電池不足，無法使用 AI 解籤');
      } else {
        toast('AI 解籤暫時忙碌，請稍後再試');
      }
    } finally {
      clearTimeout(noticeTimer);
      clearTimeout(timeoutTimer);
    }
  }
  function showReading(reading) {
    const el=layer(`<button class="mirror-close">✕</button><h2 style="font-size:22px;font-weight:950">🔮 ${escapeHtml(reading.direction)}解籤</h2><div class="mirror-meta">當前金句：${escapeHtml(reading.quoteText)}</div><div class="mirror-reading">${escapeHtml(reading.resultText)}</div><div class="mirror-list-actions"><button class="share-reading">📤 分享解籤圖片</button><button class="history">查看全部紀錄</button></div>`);
    el.querySelector('.mirror-close').onclick=()=>closeLayer(el); el.querySelector('.share-reading').onclick=e=>shareReadingImage(reading,e); el.querySelector('.history').onclick=()=>{location.href='/ai-history'};
  }

  function canvasBlob(title, subtitle, body) {
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext('2d');const gradient=ctx.createLinearGradient(0,0,1080,1350);gradient.addColorStop(0,'#fff7ed');gradient.addColorStop(.5,'#fce7f3');gradient.addColorStop(1,'#e0e7ff');ctx.fillStyle=gradient;ctx.fillRect(0,0,1080,1350);ctx.strokeStyle='#111827';ctx.lineWidth=18;ctx.strokeRect(25,25,1030,1300);ctx.fillStyle='#111827';ctx.textAlign='center';ctx.font='900 58px system-ui';ctx.fillText(title,540,120);ctx.font='800 30px system-ui';ctx.fillText(subtitle,540,175);const lines=wrapCanvas(ctx,String(body||''),850,42,'800 42px system-ui');ctx.font='800 42px system-ui';ctx.textAlign='left';let y=260;for(const line of lines.slice(0,20)){ctx.fillText(line,115,y);y+=58;}ctx.font='800 28px system-ui';ctx.textAlign='center';ctx.fillText('繁星心鏡 · Starry Mirror',540,1265);return new Promise(resolve=>canvas.toBlob(resolve,'image/png',.95));
  }
  function wrapCanvas(ctx,text,maxWidth,fontSize,font){ctx.font=font;const paras=text.split(/\n+/);const out=[];for(const para of paras){let line='';for(const ch of Array.from(para)){const next=line+ch;if(ctx.measureText(next).width>maxWidth&&line){out.push(line);line=ch}else line=next}if(line)out.push(line);if(!para)out.push('');}return out;}
  async function shareQuote(card,event){pointFromEvent(event);try{const pre=await api('/share-preflight');if(!pre.allowed){toast('電池不足，無法分享圖片');return;}const blob=await canvasBlob('繁星心鏡',card.category,card.quoteText);const result=await window.StarryPlatform.share.shareBlob({blob,fileName:window.StarryConfig.shareFileName,text:window.StarryConfig.shareText,title:window.StarryConfig.shareTitle});if(result.canceled)return;if(result.shared||result.downloaded){const operationId=crypto.randomUUID();const charged=await api('/share-charge',{method:'POST',body:JSON.stringify({operationId,cardId:card.id})});setUsage(null,charged.battery);deltaPop(charged.batteryDelta,event);toast(result.shared?'已開啟分享':'圖片已儲存到裝置');}}catch(error){toast(error.status===402?'電池不足，無法分享':'分享圖片暫時失敗');}}
  async function shareReadingImage(reading,event){pointFromEvent(event);try{const blob=await canvasBlob(`AI解籤｜${reading.direction}`,reading.quoteText,reading.resultText);const result=await window.StarryPlatform.share.shareBlob({blob,fileName:`Starry-Mirror-AI-${reading.direction}.png`,text:'我的繁星心鏡 AI 解籤',title:window.StarryConfig.shareTitle});if(!result.canceled)toast(result.shared?'已開啟分享':'圖片已儲存到裝置');}catch{toast('解籤圖片分享失敗');}}

  function prepareStandalonePage(title) {
    for (const child of [...document.body.children]) { if (child.matches('nav.sticky-nav,script,#starryConfirmLayer,#mirrorToast')) continue; child.style.display='none'; }
    let main=document.getElementById('mirrorStandalonePage');if(!main){main=document.createElement('main');main.id='mirrorStandalonePage';main.className='mirror-page';document.body.append(main);}main.style.display='block';main.innerHTML=`<div class="mirror-page-head"><h1>${escapeHtml(title)}</h1><button class="mirror-back" onclick="location.href='/'">← 回抽卡</button></div><div id="mirrorPageBody"><div class="mirror-spinner"></div></div>`;return main.querySelector('#mirrorPageBody');
  }
  async function renderFavoritesPage(){const body=prepareStandalonePage('❤️ 我的收藏');const cards=activeCards().filter(card=>state.favorites.has(card.id));if(!cards.length){body.innerHTML='<div class="mirror-empty">目前還沒有收藏的金句</div>';return;}body.className='mirror-list';body.innerHTML=cards.map(card=>`<article class="mirror-list-card"><div class="quote">${escapeHtml(card.quoteText)}</div><div class="mirror-meta">${escapeHtml(card.category)} · ${escapeHtml(card.id)}</div><div class="mirror-list-actions"><button data-open="${card.id}">查看／解籤</button><button data-remove="${card.id}">取消收藏</button></div></article>`).join('');body.querySelectorAll('[data-open]').forEach(btn=>btn.onclick=e=>showCardDialog(state.cards.find(c=>c.id===btn.dataset.open)));body.querySelectorAll('[data-remove]').forEach(btn=>btn.onclick=async e=>{const card=state.cards.find(c=>c.id===btn.dataset.remove);await toggleFavorite(card,e,{querySelector:()=>({textContent:''})});state.favorites.delete(card.id);renderFavoritesPage();});}
  async function renderAiHistoryPage(){const body=prepareStandalonePage('🔮 AI解籤紀錄');let data;try{data=await api('/ai-history')}catch{body.innerHTML='<div class="mirror-empty">讀取解籤紀錄失敗</div>';return;}const rows=data.readings||[];if(!rows.length){body.innerHTML='<div class="mirror-empty">目前還沒有 AI 解籤紀錄</div>';return;}body.className='mirror-list';body.innerHTML=rows.map(row=>`<article class="mirror-list-card"><div class="mirror-meta">${escapeHtml(row.direction)} · ${new Date(Number(row.createdAt)).toLocaleString('zh-TW')}</div><div class="quote">${escapeHtml(row.quoteText)}</div><div class="mirror-reading">${escapeHtml(row.resultText)}</div><div class="mirror-list-actions"><button data-share-ai="${row.id}">📤 分享圖片</button></div></article>`).join('');body.querySelectorAll('[data-share-ai]').forEach(btn=>btn.onclick=e=>shareReadingImage(rows.find(r=>r.id===btn.dataset.shareAi),e));}

  const SETTING_LABELS={drawRewardBatteries:'首次翻卡獎勵（顆）',favoriteRewardBatteries:'首次收藏獎勵（顆）',favoriteDailyCapBatteries:'收藏每日最多獎勵（顆）',shareCostBatteries:'分享圖片扣除（顆）',aiCostBatteries:'AI解籤扣除（顆）',drawLimitVisitor:'訪客每日抽卡',drawLimitMember:'一般會員每日抽卡',drawLimit15:'15%以上每日抽卡',drawLimitPlatinum:'白金以上每日抽卡',drawLimitDiamond:'鑽石以上每日抽卡',aiLimitVisitor:'訪客每日AI解籤',aiLimitMember:'一般會員每日AI解籤',aiLimit15:'15%以上每日AI解籤',aiLimitPlatinum:'白金以上每日AI解籤',aiLimitDiamond:'鑽石以上每日AI解籤'};
  const TOGGLE_LABELS={drawRewardEnabled:'發放抽卡獎勵',favoriteRewardEnabled:'發放收藏獎勵',shareCostEnabled:'啟用分享扣款',aiCostEnabled:'啟用AI解籤扣款',aiEnabled:'啟用AI解籤'};
  async function renderAdminPage(){const body=prepareStandalonePage('⚙️ 超級管理員');if(!state.data?.identity?.isSuperAdmin){body.innerHTML='<div class="mirror-empty">此頁只開放超級管理員</div>';return;}let result;try{result=await api('/admin/settings')}catch{body.innerHTML='<div class="mirror-empty">管理設定讀取失敗</div>';return;}const settings=result.settings||{};body.innerHTML=`<div class="mirror-admin-note">所有 X 數值都可以在這裡改，不必重新部署。下方開關就是「一鍵暫停獎勵／扣款」：發生異常時可立即單獨關閉某一種規則。</div><div class="mirror-admin-grid">${Object.entries(SETTING_LABELS).map(([key,label])=>`<div class="mirror-setting"><label>${label}</label><input type="number" min="0" step="1" data-setting="${key}" value="${Number(settings[key]??0)}"></div>`).join('')}${Object.entries(TOGGLE_LABELS).map(([key,label])=>`<div class="mirror-setting"><label class="mirror-toggle"><input type="checkbox" data-setting="${key}" ${settings[key]?'checked':''}> ${label}</label></div>`).join('')}</div><div class="mirror-admin-actions"><button id="mirrorSaveSettings">儲存設定</button><button id="mirrorSyncSheet">立即同步 Google 試算表</button></div>`;body.querySelector('#mirrorSaveSettings').onclick=async()=>{const next={};body.querySelectorAll('[data-setting]').forEach(input=>{next[input.dataset.setting]=input.type==='checkbox'?input.checked:Number(input.value)});try{await api('/admin/settings',{method:'PUT',body:JSON.stringify({settings:next})});toast('設定已儲存');await reload();}catch{toast('設定儲存失敗')}};body.querySelector('#mirrorSyncSheet').onclick=async()=>{try{const r=await api('/admin/sync',{method:'POST',body:'{}'});toast(`已同步 ${r.count||0} 張金句`);await reload();}catch{toast('同步失敗')}};}

  async function reload(){await loadBootstrap();populateCategories();renderGrid();updateStats();}
  async function boot(){installStyle();document.title='繁星心鏡 Starry Mirror';try{await loadBootstrap();}catch(error){console.error('Mirror bootstrap failed',error);toast('繁星心鏡資料讀取失敗，請稍後重新整理');return;}window.switchCategory=switchCategory;populateCategories();const path=location.pathname.replace(/\/+$/,'')||'/';if(path==='/favorites')return renderFavoritesPage();if(path==='/ai-history')return renderAiHistoryPage();if(path==='/admin')return renderAdminPage();renderGrid();updateStats();}

  window.StarryMirror=Object.freeze({reload,shareQuote,shareReadingImage});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
})();
