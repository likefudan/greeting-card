import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const token=process.env.CLOUDFLARE_API_TOKEN?.trim();
if(!account || !/^[a-f0-9]{32}$/i.test(account)) throw new Error('CLOUDFLARE_ACCOUNT_ID is missing or invalid (use Account ID, not email).');
if(!token) throw new Error('CLOUDFLARE_API_TOKEN is missing.');
async function api(path,method='GET',body){
  const r=await fetch('https://api.cloudflare.com/client/v4/'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  const data=await r.json();
  if(!r.ok || !data.success) throw new Error('Cloudflare request failed: HTTP '+r.status+'; error codes: '+(data.errors||[]).map(e=>e.code).join(','));
  return data;
}
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8').split('\n').filter(line=>!line.trim().startsWith('//')).join('\n'));
const name=config.d1_databases[0].database_name;
let found=[];
for(let page=1;;page++){
 const data=await api('accounts/'+account+'/d1/database?per_page=100&page='+page);
 found.push(...data.result.filter(d=>d.name===name));
 if(data.result.length<100)break;
}
if(found.length>1)throw new Error('Multiple matching databases; refusing to choose.');
const db=found[0] || (await api('accounts/'+account+'/d1/database','POST',{name})).result;
if(!db.uuid)throw new Error('Missing database UUID');
config.d1_databases[0].database_id=db.uuid;
config.routes=[{pattern:'card.llmat.dev',custom_domain:true}];
writeFileSync('wrangler.ci.json',JSON.stringify(config,null,2));
console.log(found.length?'Existing project database selected.':'Project database created.');
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'Database ready. Deployment target: https://card.llmat.dev\n');
