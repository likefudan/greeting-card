import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const cfToken=process.env.CLOUDFLARE_API_TOKEN?.trim();
const botToken=process.env.TELEGRAM_BOT_TOKEN?.trim();
const cfg=JSON.parse(readFileSync('wrangler.ci.json','utf8'));
const fail=message=>{throw new Error(message);};
async function cf(path,method,body){
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/'+path,{method,headers:{Authorization:'Bearer '+cfToken,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok||!data.success)fail('Cloudflare setup failed: HTTP '+response.status);return data.result;
}
async function sql(query,params=[]){
 const results=await cf('d1/database/'+cfg.d1_databases[0].database_id+'/query','POST',{sql:query,params});
 if(results.some(r=>!r.success))fail('Setup database query failed');
 return results[0].results;
}
async function telegram(method,body={}){
 const response=await fetch('https://api.telegram.org/bot'+botToken+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok||!data.ok)fail('Telegram '+method+' failed: HTTP '+response.status);return data.result;
}
async function main(){
 if(!botToken)fail('Missing TELEGRAM_BOT_TOKEN repository secret.');
 const bot=await telegram('getMe');
 if(bot.username?.toLowerCase()!=='kegreetingcard_bot')fail('Token belongs to a different bot; expected KeGreetingCard_bot.');
 await sql('CREATE TABLE IF NOT EXISTS owner_setup (id INTEGER PRIMARY KEY CHECK(id=1), chat_id TEXT NOT NULL, card_id TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0)');
 let setup=(await sql('SELECT * FROM owner_setup WHERE id=1'))[0];
 if(!setup){
  const updates=await telegram('getUpdates',{limit:100,timeout:0,allowed_updates:['message']});
  if(updates.length===100)fail('Too many updates for unambiguous automatic setup; configure owner explicitly.');
  const chats=new Map();
  for(const update of updates){
   const m=update.message;
   if(!m||m.chat?.type!=='private'||m.from?.is_bot||m.date<Date.now()/1000-86400)continue;
   const chat=chats.get(String(m.chat.id))||{start:false,hello:false};
   if(m.text==='/start')chat.start=true;
   if(m.text?.trim()==='你好')chat.hello=true;
   chats.set(String(m.chat.id),chat);
  }
  const candidates=[...chats].filter(([,m])=>m.start&&m.hello);
  if(chats.size!==1||candidates.length!==1)fail('Recipient not uniquely resolved. Send /start and 你好 in your private bot chat; multiple chats require explicit owner confirmation.');
  const chatId=candidates[0][0],cardId=randomBytes(16).toString('hex');
  await sql('INSERT INTO owner_setup(id,chat_id,card_id) VALUES(1,?,?)',[chatId,cardId]);
  setup={chat_id:chatId,card_id:cardId,completed:0};
 }
 // Never log private chat IDs or bearer card URLs to this public repository.
 for(const [name,text] of Object.entries({TELEGRAM_BOT_TOKEN:botToken,TELEGRAM_CHAT_ID:setup.chat_id})){
  await cf('workers/scripts/'+cfg.name+'/secrets','PUT',{name,text,type:'secret_text'});
 }
 if(setup.completed){console.log('Telegram secrets synchronized; initial test already completed.');return;}
 await sql('INSERT OR IGNORE INTO cards(id,friend_label,greeting) VALUES(?,?,?)',[setup.card_id,'like · 自己测试','这是一张给你自己的测试贺卡。\n试着点一下，把一份小心意送到 Telegram。']);
 const base='https://card.llmat.dev';
 let sent=false;
 for(let attempt=0;attempt<6;attempt++){
  const response=await fetch(base+'/api/cards/'+setup.card_id+'/respond',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action:'meet'}),signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  if(response.ok&&data.ok){sent=true;break;}
  if(data.error==='not_configured'){await new Promise(r=>setTimeout(r,5000));continue;}
  fail('Live card test did not confirm delivery: '+String(data.error));
 }
 if(!sent)fail('Worker secrets are not yet active; retry setup later.');
 const repeat=await fetch(base+'/api/cards/'+setup.card_id+'/respond',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action:'gift'})});
 if(repeat.status!==429){ const result=await repeat.json().catch(()=>({error:'non_json'})); fail('Live cooldown check failed: HTTP '+repeat.status+'; code '+String(result.error||'none')); }
 await telegram('sendMessage',{chat_id:setup.chat_id,text:'✅ 贺卡通知已接通！\n上一条“今天想见你”来自上线测试。\n\n这是你的专属测试贺卡：\n'+base+'/c/'+setup.card_id+'\n\n可重复使用，每次冷却 60 秒。这个链接请保留在私聊里。'});
 await sql('UPDATE owner_setup SET completed=1 WHERE id=1');
 console.log('Telegram integration verified. Live card submission and cooldown passed. Private test link delivered to the owner.');
}
main().catch(error=>{console.error(error instanceof Error && !error.message.includes('https://')?error.message:'Setup failed; sensitive error details suppressed.');process.exitCode=1;});
