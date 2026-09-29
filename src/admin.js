import QRCode from 'qrcode/lib/core/qrcode.js';
import SVG from 'qrcode/lib/renderer/svg.js';
const cookieName='__Host-greeting-admin';
const themes=['cream','rose','sage','night','ocean','lavender','sunset','peach','sky','paper'];
const defaults=['今天想见你','想要一份神秘礼物'];
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
async function sign(value,secret){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));}
async function equal(a,b){const hashes=await Promise.all([a,b].map(s=>crypto.subtle.digest('SHA-256',encoder.encode(s))));const x=new Uint8Array(hashes[0]),y=new Uint8Array(hashes[1]);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;}
export async function authenticated(request,env){
 if(!env.ADMIN_PASSWORD)return false;
 const cookie=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 if(!cookie)return false;
 const [expiry,signature,...rest]=cookie.split('.');
 if(rest.length||!/^\d+$/.test(expiry)||!signature||Number(expiry)<=Date.now()||Number(expiry)>Date.now()+7*86400000)return false;
 return equal(signature,await sign(expiry,env.ADMIN_PASSWORD));
}
async function body(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw Error('body');
 const reader=request.body?.getReader();if(!reader)throw Error('body');
 let length=0;const chunks=[];
 while(true){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>2048){await reader.cancel();throw Error('body');}chunks.push(r.value);}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function admin(request,env,json,headers){
 const url=new URL(request.url),path=url.pathname;
 if(!['GET','POST','DELETE'].includes(request.method))return json({error:'method'},405);
 if(['POST','DELETE'].includes(request.method)&&request.headers.get('Origin')!==url.origin)return json({error:'origin'},403);
 if(path==='/api/admin/login'&&request.method==='POST'){
  if(!env.ADMIN_PASSWORD)return json({error:'not_configured'},503);
  let input;try{input=await body(request);}catch{return json({error:'body'},400);}
  if(typeof input?.password!=='string'||!await equal(input.password,env.ADMIN_PASSWORD))return json({error:'unauthorized'},401);
  const expiry=String(Date.now()+7*86400000),value=expiry+'.'+await sign(expiry,env.ADMIN_PASSWORD);
  return json({ok:true},200,{'Set-Cookie':cookieName+'='+value+'; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800'});
 }
 if(path==='/api/admin/logout'&&request.method==='POST')return json({ok:true},200,{'Set-Cookie':cookieName+'=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
 if(!await authenticated(request,env))return json({error:'unauthorized'},401);
 if(path==='/api/admin/session'&&request.method==='GET')return json({ok:true});
 if(path==='/api/admin/cards'&&request.method==='POST'){
  let input;try{input=await body(request);}catch{return json({error:'body'},400);}
  const name=typeof input?.name==='string'?input.name.trim():'';
  if(!name||Array.from(name).length>60||/[\u0000-\u001f\u007f]/.test(name))return json({error:'name'},400);
  const actions=input.actions===undefined?defaults:input.actions;
  if(!Array.isArray(actions)||actions.length<1||actions.length>6||actions.some(x=>typeof x!=='string'||!x.trim()||Array.from(x.trim()).length>24||/[\u0000-\u001f\u007f]/.test(x)))return json({error:'actions'},400);
  const cleanActions=actions.map(x=>x.trim());
  const theme=input.theme===undefined?'cream':input.theme;
  if(!themes.includes(theme))return json({error:'theme'},400);
  // Client-generated UUID makes retries of the same creation idempotent.
  const key=input.requestId;
  if(typeof key!=='string'||!/^\w{8}-\w{4}-4\w{3}-[89ab]\w{3}-\w{12}$/i.test(key))return json({error:'request_id'},400);
  const id=hex(crypto.getRandomValues(new Uint8Array(16)));
  await env.DB.prepare('INSERT OR IGNORE INTO cards(id,friend_label,greeting,creation_key,created_at,actions_json,theme_id) VALUES(?,?,?,?,?,?,?)').bind(id,name,`${name}，\n有些小心意，想留给你随时领取。`,key,Date.now(),JSON.stringify(cleanActions),theme).run();
  const row=await env.DB.prepare('SELECT id,friend_label AS name,actions_json,theme_id FROM cards WHERE creation_key = ?').bind(key).first();
  return json({id:row.id,name:row.name,actions:JSON.parse(row.actions_json),theme:row.theme_id,url:url.origin+'/c/'+row.id,qrUrl:'/api/admin/cards/'+row.id+'/qr'},201);
 }
 if(path==='/api/admin/cards'&&request.method==='GET'){
  const before=Number(url.searchParams.get('before'))||Number.MAX_SAFE_INTEGER;
  const data=await env.DB.prepare('SELECT rowid AS cursor,id,friend_label AS name,actions_json,theme_id FROM cards WHERE rowid < ? ORDER BY rowid DESC LIMIT 51').bind(before).all();
  return json({cards:data.results.slice(0,50).map(r=>({id:r.id,cursor:r.cursor,name:r.name,actions:r.actions_json?JSON.parse(r.actions_json):defaults,theme:r.theme_id||'cream',url:url.origin+'/c/'+r.id,qrUrl:'/api/admin/cards/'+r.id+'/qr'})),next:data.results.length>50?data.results[49].cursor:null});
 }
 const cardPath=path.match(/^\/api\/admin\/cards\/([a-f0-9]{32})$/);
 if(cardPath&&request.method==='DELETE'){
  const result=await env.DB.prepare('DELETE FROM cards WHERE id = ?').bind(cardPath[1]).run();
  return result.meta.changes ? json({ok:true}) : json({error:'not_found'},404);
 }
 const qr=path.match(/^\/api\/admin\/cards\/([a-f0-9]{32})\/qr$/);
 if(qr&&request.method==='GET'){
  const row=await env.DB.prepare('SELECT id FROM cards WHERE id = ?').bind(qr[1]).first();if(!row)return json({error:'not_found'},404);
  const svg=SVG.render(QRCode.create(url.origin+'/c/'+row.id,{errorCorrectionLevel:'M'}),{margin:4,width:512});
  return new Response(svg,{headers:{...headers,'Content-Type':'image/svg+xml','Content-Disposition':(url.searchParams.has('download')?'attachment':'inline')+'; filename="greeting-card-'+row.id+'.svg"'}});
 }
 return json({error:'not_found'},404);
}
