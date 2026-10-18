(() => {
  'use strict';

  let lastReading = null;
  const DEVICE_KEY = 'starry_mirror_device_v1';
  const style = document.createElement('style');
  style.textContent = `
    .mirror-feedback{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:14px 0 4px;padding:12px;border:2px solid #e2e8f0;border-radius:15px;background:#fff}.mirror-feedback strong{margin-right:auto}.mirror-feedback button{min-width:58px;min-height:42px;border:2px solid #111827;border-radius:12px;background:#fff;font-weight:950}.mirror-feedback button.active{background:#111827;color:#fff}.mirror-like-total{font-size:12px;font-weight:850;opacity:.68}.mirror-admin-reading{display:grid;gap:8px}.mirror-admin-person{font-size:14px;font-weight:950}.mirror-admin-vote{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:900}.mirror-card-preview{width:78%!important;height:58%!important;max-height:58%!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important}
    .starry-ai-child{padding-left:25px!important;font-size:12px!important}.starry-menu-section{padding:7px 12px 3px;font-size:11px;font-weight:950;opacity:.55;letter-spacing:.04em}
  `;
  document.head.appendChild(style);

  function ensureDevice() {
    let value = localStorage.getItem(DEVICE_KEY) || '';
    if (/^[A-Za-z0-9_-]{20,100}$/.test(value)) return value;
    const bytes = new Uint8Array(24); crypto.getRandomValues(bytes);
    value = btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
    localStorage.setItem(DEVICE_KEY, value); return value;
  }
  function headers(body=false) {
    const h = {'X-Mirror-Device': ensureDevice(), Accept:'application/json'};
    const token = window.StarryPlatform?.auth?.getToken?.(); if (token) h.Authorization=`Bearer ${token}`;
    if (body) h['Content-Type']='application/json'; return h;
  }
  async function api(path, options={}) {
    const response = await fetch((window.StarryConfig?.mirrorApiBase || '/api/mirror') + path, {cache:'no-store',...options,headers:{...headers(Boolean(options.body)),...(options.headers||{})}});
    const data = await response.json().catch(()=>({}));
    if (!response.ok) { const error=new Error(data.error||'操作失敗'); error.status=response.status; error.data=data; throw error; }
    return data;
  }
  function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function toast(message){let el=document.getElementById('mirrorEnhanceToast');el?.remove();el=document.createElement('div');el.id='mirrorEnhanceToast';el.textContent=message;Object.assign(el.style,{position:'fixed',zIndex:'24000',left:'50%',top:'calc(var(--starry-nav-height,72px) + 14px)',transform:'translateX(-50%)',background:'#111827',color:'#fff',padding:'10px 15px',borderRadius:'999px',fontWeight:'900'});document.body.append(el);setTimeout(()=>el.remove(),1800);}

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const method = String(args[1]?.method || (args[0]?.method) || 'GET').toUpperCase();
      if (method === 'POST' && /\/api\/mirror\/ai-readings(?:\?|$)/.test(url) && response.ok) {
        const data = await response.clone().json(); if (data?.reading?.id) lastReading = data.reading;
      }
    } catch {}
    return response;
  };

  async function rate(reading, vote, box) {
    try {
      const result = await api('/ai-rating',{method:'POST',body:JSON.stringify({readingId:reading.id,vote})});
      reading.rating = result.rating; reading.quoteLikeTotal = result.quoteLikeTotal;
      box.querySelectorAll('[data-vote]').forEach(btn=>btn.classList.toggle('active',Number(btn.dataset.vote)===Number(result.rating)));
      const total=box.querySelector('.mirror-like-total'); if(total) total.textContent=`這句金句全體按讚：${result.quoteLikeTotal||0}`;
      toast(vote===1?'已按讚 👍':'已倒讚 👎');
    } catch { toast('評分暫時失敗'); }
  }
  function feedbackBox(reading) {
    const box=document.createElement('div');box.className='mirror-feedback';
    box.innerHTML=`<strong>這次解籤有幫助嗎？</strong><button type="button" data-vote="1" class="${Number(reading.rating)===1?'active':''}">👍 讚</button><button type="button" data-vote="-1" class="${Number(reading.rating)===-1?'active':''}">👎 倒讚</button><span class="mirror-like-total">這句金句全體按讚：${Number(reading.quoteLikeTotal||0)}</span>`;
    box.querySelectorAll('[data-vote]').forEach(btn=>btn.onclick=()=>rate(reading,Number(btn.dataset.vote),box));return box;
  }
  function enhanceReadingDialog() {
    if(!lastReading)return;
    const readings=[...document.querySelectorAll('.mirror-reading')];
    const target=readings.find(el=>el.closest('.mirror-dialog')&&!el.closest('.mirror-list-card'));
    if(!target)return;const dialog=target.closest('.mirror-dialog');if(dialog.querySelector('.mirror-feedback'))return;
    const box=feedbackBox(lastReading);target.insertAdjacentElement('afterend',box);
  }

  function fitPreview(el){if(!el||el.dataset.fitted==='1')return;el.dataset.fitted='1';let lo=11,hi=24,best=11;while(lo<=hi){const mid=Math.floor((lo+hi)/2);el.style.fontSize=`${mid}px`;if(el.scrollWidth<=el.clientWidth+1&&el.scrollHeight<=el.clientHeight+1){best=mid;lo=mid+1}else hi=mid-1}el.style.fontSize=`${best}px`;}
  function fitAllPreviews(){document.querySelectorAll('.mirror-card-preview').forEach(fitPreview)}

  function preparePage(title){
    for(const child of [...document.body.children]){if(child.matches('nav.sticky-nav,script,#starryConfirmLayer,#mirrorEnhanceToast'))continue;child.style.display='none'}
    let main=document.getElementById('mirrorStandalonePage');if(!main){main=document.createElement('main');main.id='mirrorStandalonePage';main.className='mirror-page';document.body.append(main)}main.style.display='block';main.innerHTML=`<div class="mirror-page-head"><h1>${esc(title)}</h1><button class="mirror-back" onclick="location.href='/'">← 回抽卡</button></div><div id="mirrorPageBody"><div class="mirror-spinner"></div></div>`;return main.querySelector('#mirrorPageBody');
  }
  async function renderHistory() {
    const body=preparePage('🔮 AI解籤紀錄');let data;try{data=await api('/ai-history')}catch{body.innerHTML='<div class="mirror-empty">讀取解籤紀錄失敗</div>';return}
    const rows=data.readings||[];if(!rows.length){body.innerHTML='<div class="mirror-empty">目前還沒有 AI 解籤紀錄</div>';return}
    body.className='mirror-list';body.innerHTML='';
    for(const row of rows){const card=document.createElement('article');card.className='mirror-list-card';card.innerHTML=`<div class="mirror-meta">${esc(row.direction)} · ${new Date(Number(row.createdAt)).toLocaleString('zh-TW')}</div><div class="quote">${esc(row.quoteText)}</div><div class="mirror-reading">${esc(row.resultText)}</div><div class="mirror-feedback-slot"></div><div class="mirror-list-actions"><button type="button" class="share-ai">📤 分享圖片</button></div>`;card.querySelector('.mirror-feedback-slot').append(feedbackBox(row));card.querySelector('.share-ai').onclick=e=>window.StarryMirror?.shareReadingImage?.(row,e);body.append(card)}
  }
  async function renderAdminReadings() {
    const body=preparePage('🔮 AI解籤 > 會員解籤紀錄');let data;try{data=await api('/admin/ai-readings')}catch(error){body.innerHTML=`<div class="mirror-empty">${error.status===403?'此頁只開放超級管理員':'會員解籤紀錄讀取失敗'}</div>`;return}
    const rows=data.readings||[];if(!rows.length){body.innerHTML='<div class="mirror-empty">目前沒有會員 AI 解籤紀錄</div>';return}
    body.className='mirror-list';body.innerHTML=rows.map(row=>`<article class="mirror-list-card mirror-admin-reading"><div class="mirror-admin-person">👤 ${esc(row.memberName||'會員')} ${row.memberRank?`｜${esc(row.memberRank)}`:''}</div><div class="mirror-meta">${esc(row.direction)} · ${new Date(Number(row.createdAt)).toLocaleString('zh-TW')}</div><div class="quote">${esc(row.quoteText)}</div><div class="mirror-reading">${esc(row.resultText)}</div><div class="mirror-admin-vote">會員評分：${Number(row.rating)===1?'👍 按讚':Number(row.rating)===-1?'👎 倒讚':'尚未評分'} <span>｜本金句全體按讚：${Number(row.quoteLikeTotal||0)}</span></div></article>`).join('');
  }

  async function installMenu() {
    const menu=document.getElementById('starryMenu'), history=document.getElementById('starryMirrorAiHistory');if(!menu||!history)return false;
    const label=history.querySelector('span:last-child');if(label)label.textContent='AI解籤 > 我的解籤紀錄';history.classList.add('starry-ai-child');
    if(!document.getElementById('starryMirrorAdminReadings')){
      const row=document.createElement('button');row.type='button';row.id='starryMirrorAdminReadings';row.className='starry-menu-row starry-ai-child';row.hidden=true;row.innerHTML='<span class="icon">↳</span><span>會員解籤紀錄</span>';row.onclick=()=>{location.href='/admin/ai-readings'};history.insertAdjacentElement('afterend',row);
    }
    try{const data=await api('/bootstrap');const row=document.getElementById('starryMirrorAdminReadings');if(row)row.hidden=!data.identity?.isSuperAdmin}catch{}
    return true;
  }

  // Only react when a newly inserted subtree actually contains a quote preview
  // or an AI reading. The old global callback rewrote the admin description on
  // every DOM mutation, triggering itself indefinitely and freezing Chrome.
  function hasRelevantInsertedContent(records) {
    for (const record of records) {
      for (const node of record.addedNodes || []) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('.mirror-reading, .mirror-card-preview') ||
            node.querySelector?.('.mirror-reading, .mirror-card-preview')) return true;
      }
    }
    return false;
  }
  const observer=new MutationObserver(records=>{
    if (!hasRelevantInsertedContent(records)) return;
    enhanceReadingDialog();
    fitAllPreviews();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});

  async function boot(){
    for(let i=0;i<30;i++){if(await installMenu())break;await new Promise(r=>setTimeout(r,80))}
    if(location.pathname.replace(/\/+$/,'')==='/ai-history')setTimeout(()=>void renderHistory(),180);
    if(location.pathname.replace(/\/+$/,'')==='/admin/ai-readings')setTimeout(()=>void renderAdminReadings(),120);
    fitAllPreviews();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
})();
