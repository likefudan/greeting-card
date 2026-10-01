import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handle} from '../src/worker.js';
const id='a'.repeat(32), other='b'.repeat(32);
function environment(){const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_cards.sql',import.meta.url),'utf8'));db.exec(readFileSync(new URL('../migrations/0002_admin.sql',import.meta.url),'utf8'));db.exec(readFileSync(new URL('../migrations/0003_card_options.sql',import.meta.url),'utf8'));for(const token of [id,other])db.prepare('INSERT INTO cards(id,friend_label,greeting) VALUES(?,?,?)').run(token,'私密备注','你好');return{ADMIN_PASSWORD:'test-admin-password',TELEGRAM_BOT_TOKEN:'test',TELEGRAM_CHAT_ID:'test',DB:{prepare(sql){return{bind(...values){return{async first(){return db.prepare(sql).get(...values)||null;},async all(){return{results:db.prepare(sql).all(...values)};},async run(){return{meta:{changes:Number(db.prepare(sql).run(...values).changes)}};}};}};}}};}
function request(action='meet',token=id,origin='https://card.llmat.dev'){return new Request(`https://card.llmat.dev/api/cards/${token}/respond`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action})});}
const success=async()=>Response.json({ok:true});
test('simultaneous clicks send exactly once; another card remains usable',async()=>{const env=environment();let count=0;const sender=async()=>{count++;return success();};const results=await Promise.all([handle(request(),env,sender),handle(request('gift'),env,sender)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);assert.equal(count,1);assert.equal((await handle(request('gift',other),env,sender)).status,200);});
test('public metadata never reveals owner-only friend label',async()=>{const data=await(await handle(new Request(`https://card.llmat.dev/api/cards/${id}`),environment())).json();assert.equal(data.greeting,'你好');assert.equal(data.friend_label,undefined);});
test('explicit Telegram rejection permits retry',async()=>{const env=environment();assert.equal((await handle(request(),env,async()=>Response.json({ok:false},{status:403}))).status,502);assert.equal((await handle(request(),env,success)).status,200);});
test('ambiguous delivery keeps cooldown to reduce duplicate messages',async()=>{const env=environment();const result=await handle(request(),env,async()=>{throw new Error('timeout');});assert.equal((await result.json()).error,'delivery_unknown');assert.equal((await handle(request(),env,success)).status,429);});
test('rejects cross-origin, unknown cards and unsupported actions',async()=>{const env=environment();assert.equal((await handle(request('meet',id,'https://other.test'),env)).status,403);assert.equal((await handle(request('meet','c'.repeat(32)),env)).status,404);assert.equal((await handle(request('__proto__'),env)).status,400);});
test('unconfigured bot does not claim cooldown',async()=>{const env=environment();delete env.TELEGRAM_BOT_TOKEN;assert.equal((await handle(request(),env)).status,503);env.TELEGRAM_BOT_TOKEN='test';assert.equal((await handle(request(),env,success)).status,200);});
test('expired cooldown permits reuse and payload uses server label',async()=>{const env=environment();await env.DB.prepare('UPDATE cards SET cooldown_until = ? WHERE id = ?').bind(Date.now()-1,id).run();let payload;const result=await handle(request('gift'),env,async(url,options)=>{payload=JSON.parse(options.body);return success();});assert.equal(result.status,200);assert.match(payload.text,/私密备注/);assert.match(payload.text,/想要一份神秘礼物/);});
test('location is included only when supplied, with coordinates, map link and accuracy',async()=>{const env=environment();let message;const sender=async(_,options)=>{message=JSON.parse(options.body).text;return success();};await handle(request(),env,sender);assert.match(message,/位置：未共享/);assert.doesNotMatch(message,/maps\/search/);await env.DB.prepare('UPDATE cards SET cooldown_until = 0 WHERE id = ?').bind(id).run();const req=new Request(`https://card.llmat.dev/api/cards/${id}/respond`,{method:'POST',headers:{Origin:'https://card.llmat.dev','Content-Type':'application/json'},body:JSON.stringify({action:'a0',position:{latitude:37.7749,longitude:-122.4194,accuracy:15}})});assert.equal((await handle(req,env,sender)).status,200);assert.match(message,/37\.774900, -122\.419400/);assert.match(message,/15 米/);assert.match(message,/maps\/search\/\?api=1&query=37\.774900%2C-122\.419400/);});
test('invalid location is rejected before claiming cooldown or sending',async()=>{const env=environment();let sent=0;for(const position of [{latitude:91,longitude:0,accuracy:1},{latitude:0,longitude:0,accuracy:'15'},{latitude:0,longitude:0,accuracy:-1}]){const req=new Request(`https://card.llmat.dev/api/cards/${id}/respond`,{method:'POST',headers:{Origin:'https://card.llmat.dev','Content-Type':'application/json'},body:JSON.stringify({action:'a0',position})});assert.equal((await handle(req,env,async()=>{sent++;return success();})).status,400);}assert.equal(sent,0);assert.equal((await handle(request(),env,success)).status,200);});

function adminRequest(path,body,cookie,origin='https://card.llmat.dev'){return new Request('https://card.llmat.dev/api/admin/'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});}
async function login(env){const r=await handle(adminRequest('login',{password:env.ADMIN_PASSWORD}),env);assert.equal(r.status,200);const cookie=r.headers.get('Set-Cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);return cookie.split(';')[0];}
test('admin requires valid password, rejects forged cookie and cross-origin creation',async()=>{const env=environment();assert.equal((await handle(adminRequest('cards'),env)).status,401);assert.equal((await handle(adminRequest('login',{password:'wrong'}),env)).status,401);const cookie=await login(env);assert.equal((await handle(adminRequest('session',null,cookie+'x'),env)).status,401);assert.equal((await handle(adminRequest('cards',{name:'A',requestId:crypto.randomUUID()},cookie,'https://other.test'),env)).status,403);});
test('admin creation is idempotent and name is stored safely; QR and list require authentication',async()=>{const env=environment();const cookie=await login(env);const payload={name:"小王 <script> & '朋友'",requestId:crypto.randomUUID()};const one=await(await handle(adminRequest('cards',payload,cookie),env)).json();const two=await(await handle(adminRequest('cards',payload,cookie),env)).json();assert.equal(one.id,two.id);assert.equal(one.name,payload.name);assert.match(one.url,/https:\/\/card.llmat.dev\/c\/[a-f0-9]{32}$/);const qr=await handle(adminRequest('cards/'+one.id+'/qr',null,cookie),env);assert.equal(qr.status,200);assert.match(await qr.text(),/<svg/);assert.equal((await handle(adminRequest('cards/'+one.id+'/qr'),env)).status,401);const list=await(await handle(adminRequest('cards',null,cookie),env)).json();assert.equal(list.cards.filter(c=>c.id===one.id).length,1);const publicCard=await(await handle(new Request(one.url.replace('/c/','/api/cards/')),env)).json();assert.ok(publicCard.greeting.includes(payload.name));});
test('admin validates names and changing password invalidates existing sessions',async()=>{const env=environment();const cookie=await login(env);for(const name of ['', 'x'.repeat(61),'bad\nname'])assert.equal((await handle(adminRequest('cards',{name,requestId:crypto.randomUUID()},cookie),env)).status,400);env.ADMIN_PASSWORD='changed';assert.equal((await handle(adminRequest('session',null,cookie),env)).status,401);});
test('print QR matrix requires admin authentication and is unavailable after deletion',async()=>{
 const env=environment(),cookie=await login(env),path='cards/'+id+'/qr?matrix=1';
 assert.equal((await handle(adminRequest(path),env)).status,401);
 const response=await handle(adminRequest(path,null,cookie),env);assert.equal(response.status,200);
 const matrix=await response.json();assert.ok(matrix.size>=21);assert.equal(matrix.data.length,matrix.size**2);assert.ok(matrix.data.every(x=>x===0||x===1));
 await env.DB.prepare('DELETE FROM cards WHERE id = ?').bind(id).run();assert.equal((await handle(adminRequest(path,null,cookie),env)).status,404);
});
test('admin edits preserve card URL, QR matrix and cooldown while updating recipient content',async()=>{
 const env=environment(),cookie=await login(env),path='https://card.llmat.dev/api/admin/cards/'+id;
 const before=await(await handle(adminRequest('cards/'+id+'/qr?matrix=1',null,cookie),env)).json();
 const until=Date.now()+60000;await env.DB.prepare('UPDATE cards SET cooldown_until = ? WHERE id = ?').bind(until,id).run();
 const fields={name:'新名字',actions:['一起喝茶','一起旅行'],theme:'rose'};
 const update=(data=fields,auth=cookie,origin='https://card.llmat.dev',token=id)=>new Request(path.replace(id,token),{method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Cookie:auth}:{})},body:JSON.stringify(data)});
 assert.equal((await handle(update(fields,''),env)).status,401);assert.equal((await handle(update(fields,cookie,'https://other.test'),env)).status,403);
 assert.equal((await handle(update({...fields,actions:[]}),env)).status,400);assert.equal((await handle(update(fields,cookie,'https://card.llmat.dev','c'.repeat(32)),env)).status,404);
 const result=await handle(update(),env);assert.equal(result.status,200);const edited=await result.json();assert.equal(edited.id,id);assert.equal(edited.url,'https://card.llmat.dev/c/'+id);
 const publicCard=await(await handle(new Request(edited.url.replace('/c/','/api/cards/')),env)).json();assert.match(publicCard.greeting,/新名字/);assert.deepEqual(publicCard.actions,fields.actions);assert.equal(publicCard.theme,'rose');assert.equal(publicCard.cooldownUntil,until);
 assert.deepEqual(await(await handle(adminRequest('cards/'+id+'/qr?matrix=1',null,cookie),env)).json(),before);
 await env.DB.prepare('UPDATE cards SET cooldown_until = 0 WHERE id = ?').bind(id).run();let text;await handle(request('a1'),env,async(_,options)=>{text=JSON.parse(options.body).text;return success();});assert.match(text,/新名字/);assert.match(text,/一起旅行/);
});

test('custom actions and theme reach recipient; deleting card invalidates QR, URL, and button',async()=>{
 const env=environment(),cookie=await login(env);
 const creation=await handle(adminRequest('cards',{name:'小李',actions:['一起喝茶','收到礼物','聊聊天'],theme:'night',requestId:crypto.randomUUID()},cookie),env);
 assert.equal(creation.status,201);const card=await creation.json();
 const publicData=await(await handle(new Request(card.url.replace('/c/','/api/cards/')),env)).json();
 assert.deepEqual(publicData.actions,['一起喝茶','收到礼物','聊聊天']);assert.equal(publicData.theme,'night');
 let telegram;const response=await handle(request('a2',card.id),env,async(_,opts)=>{telegram=JSON.parse(opts.body);return success()});
 assert.equal(response.status,200);assert.match(telegram.text,/小李/);assert.match(telegram.text,/聊聊天/);
 assert.equal((await handle(request('a3',card.id),env,success)).status,400);
 const deletion=await handle(adminRequest('cards/'+card.id,null,cookie),env);
 assert.equal(deletion.status,404); // GET for a single card is unsupported
 const remove=await handle(new Request('https://card.llmat.dev/api/admin/cards/'+card.id,{method:'DELETE',headers:{Origin:'https://card.llmat.dev',Cookie:cookie}}),env);
 assert.equal(remove.status,200);
 assert.equal((await handle(new Request(card.url.replace('/c/','/api/cards/')),env)).status,404);
 assert.equal((await handle(request('a0',card.id),env,success)).status,404);
 assert.equal((await handle(adminRequest('cards/'+card.id+'/qr',null,cookie),env)).status,404);
 const cards=await(await handle(adminRequest('cards',null,cookie),env)).json();assert.ok(!cards.cards.some(c=>c.id===card.id));
});
test('invalid custom buttons and theme rejected without creating a card',async()=>{
 const env=environment(),cookie=await login(env),base={name:'A',requestId:crypto.randomUUID()};
 for(const payload of [{...base,actions:[]},{...base,actions:['a'.repeat(25)]},{...base,actions:['x','y','z','1','2','3','4']}])assert.equal((await handle(adminRequest('cards',payload,cookie),env)).status,400);
 assert.equal((await handle(adminRequest('cards',{...base,theme:'unknown'},cookie),env)).status,400);
 assert.equal((await handle(new Request('https://card.llmat.dev/api/admin/cards/'+id,{method:'DELETE',headers:{Origin:'https://other.test',Cookie:cookie}}),env)).status,403);
});
