import test from 'node:test';
import assert from 'node:assert/strict';
import mirror from '../worker/v2.js';

const cards = [
  { id:'Q000001',quoteText:'經驗是最好的老師',category:'信心勇氣',position:1,active:1 },
  { id:'Q000002',quoteText:'今天開始改變',category:'成長',position:2,active:1 }
];

function testDb() {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      statements.push(sql);
      const stmt = {
        bind() { return stmt; },
        async first() {
          if (sql.includes('COUNT(*) AS count FROM mirror_cards')) return { count:2 };
          if (sql.includes("key='stableSyncV2At'")) return {value:String(Date.now())};
          return null;
        },
        async all() {
          if (sql.includes('FROM mirror_cards ORDER BY position')) return { results:cards };
          return { results:[] };
        },
        async run(){ return { success:true }; }
      };
      return stmt;
    },
    async batch(queries){ return queries.map(()=>({ success:true })); }
  };
}

test('guest sees stored cards even when legacy lastSheetSync timestamp is missing',async()=>{
  const db=testDb();
  const request=new Request('https://mirror.starry.phd/api/mirror/bootstrap',{
    headers:{'X-Mirror-Device':'stable-guest-device-id-00000001'}
  });
  const response=await mirror.fetch(request,{MIRROR_DB:db},{});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.cards.length,2);
  assert.equal(data.usage.draws.used,0);
  assert.equal(data.authenticated,false);
  assert.ok(!db.statements.some(sql=>sql.includes("key='lastSheetSync'")),'legacy sync must never gate cards');
});

test('signed-in member sees cards and profile with no Starry ID credentials exposed',async()=>{
  const db=testDb();
  const request=new Request('https://mirror.starry.phd/api/mirror/bootstrap',{headers:{
    'X-Mirror-Device':'stable-guest-device-id-00000001',
    Authorization:'Bearer '+'a'.repeat(40)
  }});
  const response=await mirror.fetch(request,{
    MIRROR_DB:db,
    STARRY_ECOSYSTEM:{fetch:async()=>new Response(JSON.stringify({
      authenticated:true,identity:{userId:'test-user',name:'會員測試',approvedRank:'白金',balanceUnits:20}
    }),{headers:{'content-type':'application/json'}})}
  },{});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.cards.length,2);
  assert.equal(data.authenticated,true);
  assert.equal(data.identity.name,'會員測試');
  assert.equal(data.identity.rank,'白金');
  assert.equal(data.battery,2);
  assert.equal(data.usage.tier,'platinum');
  assert.equal(JSON.stringify(data).includes('aaaaaaaa'),false);
});

test('visitor cannot obtain AI eligibility or start AI generation', async () => {
  const env={MIRROR_DB:testDb(),AI:{run:()=>{throw Error('must not execute AI')} }};
  const guest={'X-Mirror-Device':'stable-guest-device-id-00000001'};
  for(const [url,method] of [['/api/mirror/ai-access','GET'],['/api/mirror/ai-readings','POST'],['/api/mirror/birthday','POST']]){
    const response=await mirror.fetch(new Request('https://mirror.starry.phd'+url,{method,headers:guest}),env,{});
    assert.equal(response.status,401,url);
  }
});

test('signed-in member without birthday is blocked by server before AI call',async()=>{
  const env={
    MIRROR_DB:testDb(),AI:{run:()=>{throw Error('must not execute AI')}},
    STARRY_ECOSYSTEM:{fetch:async()=>new Response(JSON.stringify({
      authenticated:true,identity:{userId:'abc',name:'會員',birthday:'',balanceUnits:0}
    }),{headers:{'content-type':'application/json'}})}
  };
  const response=await mirror.fetch(new Request('https://mirror.starry.phd/api/mirror/ai-readings',{
    method:'POST',headers:{Authorization:'Bearer '+'a'.repeat(40),'Content-Type':'application/json'},
    body:JSON.stringify({cardId:'Q000001',direction:'事業'})
  }),env,{});
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,'birthday_required');
});

test('daily first AI is free and next successful attempt costs 20 batteries',async()=>{
  let aiCount=0;
  const db=testDb(),prepare=db.prepare.bind(db);
  db.prepare=sql=>{
    const statement=prepare(sql);
    if(sql.includes('FROM mirror_daily_usage'))statement.first=async()=>({aiCount,drawCount:0});
    return statement;
  };
  const env={
    MIRROR_DB:db,
    STARRY_ECOSYSTEM:{fetch:async()=>new Response(JSON.stringify({
      authenticated:true,identity:{userId:'abc',name:'會員',birthday:'1990-06-15',balanceUnits:300}
    }),{headers:{'content-type':'application/json'}})}
  };
  const request=()=>new Request('https://mirror.starry.phd/api/mirror/ai-access',{headers:{Authorization:'Bearer '+'a'.repeat(40)}});
  let response=await mirror.fetch(request(),env,{});
  let data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.costBatteries,0);
  assert.equal(data.firstFree,true);
  aiCount=1;
  response=await mirror.fetch(request(),env,{});
  data=await response.json();
  assert.equal(data.costBatteries,20);
  assert.equal(data.firstFree,false);
  assert.equal(data.remaining,1);
});
