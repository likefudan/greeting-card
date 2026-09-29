import { admin } from './admin.js';
const DEFAULT_ACTIONS = ['今天想见你', '想要一份神秘礼物'];
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" };
const json = (data, status = 200, extra = {}) => Response.json(data, { status, headers: { ...headers, ...extra } });
export async function handle(request, env, send = fetch) {
  const url = new URL(request.url);
  if(url.pathname.startsWith('/api/admin/')) return admin(request,env,json,headers);
  const match = url.pathname.match(/^\/api\/cards\/([a-f0-9]{32})(\/respond)?$/);
  if (!match) {
    if (url.pathname.startsWith('/api/')) return json({error:'not_found'},404);
    if (!['GET','HEAD'].includes(request.method)) return json({error:'method'},405);
    if (!/^\/(?:c\/[a-f0-9]{32}|preview|admin|admin\/|admin.js|admin.css|app.js|style.css|robots.txt)?$/.test(url.pathname)) return json({error:'not_found'},404);
    const asset = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/preview' || url.pathname.startsWith('/c/')) asset.pathname = '/index.html';
    if(url.pathname==='/admin'||url.pathname==='/admin/') asset.pathname='/admin.html';
    const response = await env.ASSETS.fetch(new Request(asset, request));
    const out = new Response(response.body, response);
    for (const [key,value] of Object.entries(headers)) out.headers.set(key,value);
    return out;
  }
  const [, id, respond] = match;
  if (request.method !== (respond ? 'POST' : 'GET')) return json({error:'method'},405);
  if (respond && request.headers.get('Origin') !== url.origin) return json({error:'origin'},403);
  const card = await env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind(id).first();
  if (!card) return json({error:'not_found'},404);
  const actions = card.actions_json ? JSON.parse(card.actions_json) : DEFAULT_ACTIONS;
  if (!respond) return json({greeting:card.greeting, actions, theme:card.theme_id || 'cream', cooldownUntil:card.cooldown_until});
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'content_type'},415);
  // Bound request body even when Content-Length is absent.
  const reader = request.body?.getReader();
  if (!reader) return json({error:'body'},400);
  let bytes = 0, chunks = [];
  while (true) { const {value,done} = await reader.read(); if(done) break; bytes += value.byteLength; if(bytes > 1024) { await reader.cancel(); return json({error:'body'},413); } chunks.push(value); }
  let body;
  try { const buffer = new Uint8Array(bytes); let offset=0; for(const c of chunks){buffer.set(c,offset);offset+=c.length;} body=JSON.parse(new TextDecoder().decode(buffer)); } catch { return json({error:'body'},400); }
  const actionIndex = typeof body?.action === 'string' && /^a[0-5]$/.test(body.action) ? Number(body.action.slice(1)) :
    body?.action === 'meet' ? 0 : body?.action === 'gift' ? 1 : -1;
  if (actionIndex < 0 || actionIndex >= actions.length) return json({error:'action'},400);
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return json({error:'not_configured'},503);
  const now = Date.now(), until = now + 60000, attempt = crypto.randomUUID();
  // A conditional write on D1 serializes simultaneous submissions across devices.
  const claim = await env.DB.prepare('UPDATE cards SET cooldown_until = ?, attempt_id = ? WHERE id = ? AND cooldown_until <= ?').bind(until,attempt,id,now).run();
  if (!claim.meta.changes) {
    const current = await env.DB.prepare('SELECT cooldown_until FROM cards WHERE id = ?').bind(id).first();
    return json({error:'cooldown',cooldownUntil:current.cooldown_until},429,{'Retry-After':String(Math.max(1,Math.ceil((current.cooldown_until-now)/1000)))});
  }
  const time = new Intl.DateTimeFormat('zh-CN',{timeZone:env.TIME_ZONE || 'America/Los_Angeles',dateStyle:'medium',timeStyle:'short'}).format(now);
  try {
    const response = await send(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{
      method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),
      body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:`💌 贺卡收到新心愿\n朋友：${card.friend_label}\n选择：${actions[actionIndex]}\n时间：${time}（${env.TIME_ZONE || 'America/Los_Angeles'}）`})
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) {
      await env.DB.prepare('UPDATE cards SET cooldown_until = 0 WHERE id = ? AND attempt_id = ?').bind(id,attempt).run();
      return json({error:'send_failed'},502);
    }
    return json({ok:true,cooldownUntil:until});
  } catch {
    // Timeout can mean Telegram accepted the message but the response was lost.
    // Keep the short cooldown and never automatically resend an ambiguous delivery.
    return json({error:'delivery_unknown',cooldownUntil:until},502);
  }
}
export default { async fetch(request,env) { try { return await handle(request,env); } catch { return json({error:'unavailable'},503); } } };
