import QRCode from 'qrcode/lib/core/qrcode.js';
import {qrPath,QR_COLORS} from '../public/qr-style.js';
import {makeSlug,cardUrl} from './card-link.js';
const cookieName='__Host-greeting-admin';
const themes=['cream','rose','sage','night','ocean','lavender','sunset','peach','sky','paper'];
const defaults=['今天想见你','想要一份神秘礼物'];
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
function cardInput(input){
 const name=typeof input?.name==='string'?input.name.trim():'';
 if(!name||Array.from(name).length>60||/[\u0000-\u001f\u007f]/.test(name))throw Error('name');
 const actions=input.actions===undefined?defaults:input.actions;
 if(!Array.isArray(actions)||actions.length<1||actions.length>20||actions.some(x=>typeof x!=='string'||!x.trim()||Array.from(x.trim()).length>24||/[\u0000-\u001f\u007f]/.test(x)))throw Error('actions');
 const theme=input.theme===undefined?'cream':input.theme;
 if(!themes.includes(theme))throw Error('theme');
 return {name,actions:actions.map(x=>x.trim()),theme};
}
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
 while(true){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>4096){await reader.cancel();throw Error('body');}chunks.push(r.value);}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
// Cards created before short links get one lazily; their old /c/<id> link keeps working.
async function ensureSlug(env,row){
 for(let i=0;!row.slug&&i<5;i++){const slug=makeSlug(row.name);await env.DB.prepare('UPDATE cards SET slug = ? WHERE id = ? AND slug IS NULL AND NOT EXISTS (SELECT 1 FROM cards WHERE slug = ?)').bind(slug,row.id,slug).run();row.slug=(await env.DB.prepare('SELECT slug FROM cards WHERE id = ?').bind(row.id).first())?.slug;}
 return row;
}
const view=(origin,r)=>({id:r.id,name:r.name,actions:r.actions_json?JSON.parse(r.actions_json):defaults,theme:r.theme_id||'cream',url:cardUrl(origin,r),qrUrl:'/api/admin/cards/'+r.id+'/qr'});
export async function admin(request,env,json,headers){
 const url=new URL(request.url),path=url.pathname;
 if(!['GET','POST','PATCH','DELETE'].includes(request.method))return json({error:'method'},405);
 if(['POST','PATCH','DELETE'].includes(request.method)&&request.headers.get('Origin')!==url.origin)return json({error:'origin'},403);
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
  let fields;try{fields=cardInput(input);}catch(error){return json({error:error.message},400);}
  const {name,actions:cleanActions,theme}=fields;
  // Client-generated UUID makes retries of the same creation idempotent.
  const key=input.requestId;
  if(typeof key!=='string'||!/^\w{8}-\w{4}-4\w{3}-[89ab]\w{3}-\w{12}$/i.test(key))return json({error:'request_id'},400);
  let row;
  // Retry only on the (very unlikely) slug collision; a repeated creation_key returns the original card.
  for(let i=0;!row&&i<5;i++){
   const id=hex(crypto.getRandomValues(new Uint8Array(16)));
   await env.DB.prepare('INSERT OR IGNORE INTO cards(id,friend_label,greeting,creation_key,created_at,actions_json,theme_id,slug) VALUES(?,?,?,?,?,?,?,?)').bind(id,name,`${name}，\n有些小心意，想留给你随时领取。`,key,Date.now(),JSON.stringify(cleanActions),theme,makeSlug(name)).run();
   row=await env.DB.prepare('SELECT id,slug,friend_label AS name,actions_json,theme_id FROM cards WHERE creation_key = ?').bind(key).first();
  }
  if(!row)return json({error:'unavailable'},503);
  return json(view(url.origin,await ensureSlug(env,row)),201);
 }
 if(path==='/api/admin/cards'&&request.method==='GET'){
  const before=Number(url.searchParams.get('before'))||Number.MAX_SAFE_INTEGER;
  const data=await env.DB.prepare('SELECT rowid AS cursor,id,slug,friend_label AS name,actions_json,theme_id FROM cards WHERE rowid < ? ORDER BY rowid DESC LIMIT 51').bind(before).all();
  const cards=[];for(const r of data.results.slice(0,50))cards.push({...view(url.origin,await ensureSlug(env,r)),cursor:r.cursor});
  return json({cards,next:data.results.length>50?data.results[49].cursor:null});
 }
 const cardPath=path.match(/^\/api\/admin\/cards\/([a-f0-9]{32})$/);
 if(cardPath&&request.method==='PATCH'){
  let fields;try{fields=cardInput(await body(request));}catch(error){return json({error:['name','actions','theme'].includes(error.message)?error.message:'body'},400);}
  const {name,actions,theme}=fields,id=cardPath[1];
  const updated=await env.DB.prepare('UPDATE cards SET friend_label = ?, greeting = ?, actions_json = ?, theme_id = ? WHERE id = ?').bind(name,`${name}，\n有些小心意，想留给你随时领取。`,JSON.stringify(actions),theme,id).run();
  if(!updated.meta.changes)return json({error:'not_found'},404);
  // Editing never changes an existing link, so printed QR codes keep working.
  const row=await env.DB.prepare('SELECT id,slug,friend_label AS name,actions_json,theme_id FROM cards WHERE id = ?').bind(id).first();
  return json(view(url.origin,await ensureSlug(env,row)));
 }
 if(cardPath&&request.method==='DELETE'){
  const result=await env.DB.prepare('DELETE FROM cards WHERE id = ?').bind(cardPath[1]).run();
  return result.meta.changes ? json({ok:true}) : json({error:'not_found'},404);
 }
 const qr=path.match(/^\/api\/admin\/cards\/([a-f0-9]{32})\/qr$/);
 if(qr&&request.method==='GET'){
  let row=await env.DB.prepare('SELECT id,slug,friend_label AS name,theme_id FROM cards WHERE id = ?').bind(qr[1]).first();if(!row)return json({error:'not_found'},404);
  row=await ensureSlug(env,row);const link=cardUrl(url.origin,row);
  const code=QRCode.create(link,{errorCorrectionLevel:'M'}),size=code.modules.size,matrix={size,data:Array.from(code.modules.data)};
  if(url.searchParams.has('matrix'))return json({...matrix,url:link});
  const colors=QR_COLORS[row.theme_id]||QR_COLORS.cream,cell=10,total=(size+8)*cell;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="512" height="512" shape-rendering="geometricPrecision"><rect width="${total}" height="${total}" rx="${cell*3}" fill="${colors.bg}"/><path fill="${colors.ink}" fill-rule="evenodd" d="${qrPath(matrix,cell,cell*4,cell*4)}"/></svg>`;
  return new Response(svg,{headers:{...headers,'Content-Type':'image/svg+xml','Content-Disposition':(url.searchParams.has('download')?'attachment':'inline')+'; filename="greeting-card-'+row.id+'.svg"'}});
 }
 return json({error:'not_found'},404);
}
