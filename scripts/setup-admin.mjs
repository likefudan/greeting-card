import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
const cfg=JSON.parse(readFileSync('wrangler.ci.json','utf8'));
const account=process.env.CLOUDFLARE_ACCOUNT_ID?.trim(),token=process.env.CLOUDFLARE_API_TOKEN?.trim(),bot=process.env.TELEGRAM_BOT_TOKEN?.trim();
async function cf(path,method,body){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok||!data.success)throw Error('Cloudflare admin setup failed: '+r.status);return data.result;}
async function sql(query,params=[]){const r=await cf('d1/database/'+cfg.d1_databases[0].database_id+'/query','POST',{sql:query,params});if(r.some(x=>!x.success))throw Error('Admin setup query failed');return r[0].results;}
async function main(){
 await sql('CREATE TABLE IF NOT EXISTS admin_setup (id INTEGER PRIMARY KEY CHECK(id=1), delivered INTEGER NOT NULL)');
 if((await sql('SELECT delivered FROM admin_setup WHERE id=1'))[0]?.delivered){console.log('Admin already configured; existing password preserved.');return;}
 const owner=(await sql('SELECT chat_id FROM owner_setup WHERE id=1 AND completed=1'))[0];if(!owner)throw Error('Verified Telegram owner required.');
 const password=randomBytes(24).toString('base64url');
 await cf('workers/scripts/'+cfg.name+'/secrets','PUT',{name:'ADMIN_PASSWORD',text:password,type:'secret_text'});
 const origin='https://card.llmat.dev';let cookie;
 for(let i=0;i<8;i++){
  const r=await fetch(origin+'/api/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password})});
  if(r.ok){cookie=r.headers.get('set-cookie')?.split(';')[0];break;}
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
 if(!cookie)throw Error('Admin login not ready after secret update.');
 const payload={name:'管理功能自测',actions:['测试按钮甲','测试按钮乙'],theme:'night',requestId:randomUUID()};let card;
 try {
  const make=()=>fetch(origin+'/api/admin/cards',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(payload)});
  const created=await make();if(created.status!==201)throw Error('Admin creation check failed.');card=await created.json();
  const duplicate=await(await make()).json();if(duplicate.id!==card.id)throw Error('Admin retry deduplication check failed.');
  const publicCard=await fetch(card.url.replace('/c/','/api/cards/'));const config=await publicCard.json();if(config.theme!=='night'||config.actions?.[1]!=='测试按钮乙')throw Error('Card options check failed.');
  const qr=await fetch(origin+card.qrUrl,{headers:{Cookie:cookie}});if(!qr.ok||!(await qr.text()).includes('<svg'))throw Error('Admin QR check failed.');
  const denied=await fetch(origin+'/api/admin/cards');if(denied.status!==401)throw Error('Admin authorization check failed.');
 }finally{if(card?.id){const deletion=await fetch(origin+'/api/admin/cards/'+card.id,{method:'DELETE',headers:{Origin:origin,Cookie:cookie}});if(!deletion.ok)throw Error('Admin deletion check failed.');const gone=await fetch(card.url.replace('/c/','/api/cards/'));if(gone.status!==404)throw Error('Deleted card is still active.');}}
 const response=await fetch('https://api.telegram.org/bot'+bot+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:owner.chat_id,text:'🔐 贺卡管理页面已上线\n\n管理地址：https://card.llmat.dev/admin\n管理密码：'+password+'\n\n登录后，只需输入朋友名字，就能生成专属链接和二维码，也能找回之前创建的贺卡。\n请保存好管理密码，不要分享给朋友。'})});
 if(!response.ok||!(await response.json()).ok)throw Error('Admin password delivery failed.');
 await sql('INSERT OR REPLACE INTO admin_setup(id,delivered) VALUES(1,1)');
 console.log('Admin login, card creation, retry deduplication, QR generation and access control verified. Password delivered privately to verified owner.');
}
main().catch(()=>{console.error('Admin setup failed; no credentials or private URLs logged. Check setup steps and retry.');process.exitCode=1;});
