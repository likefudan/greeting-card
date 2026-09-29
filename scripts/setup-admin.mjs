import {readFileSync} from 'node:fs';
const cfg=JSON.parse(readFileSync('wrangler.ci.json','utf8'));
const account=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const token=process.env.CLOUDFLARE_API_TOKEN?.trim();
const password=process.env.ADMIN_PASSWORD;
const origin='https://card.llmat.dev';
async function main(){
 if(!password)throw Error('GitHub ADMIN_PASSWORD secret is missing or empty.');
 if(!account||!token)throw Error('Cloudflare deployment secrets are missing.');
 const response=await fetch(
  'https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+cfg.name+'/secrets',
  {method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({name:'ADMIN_PASSWORD',text:password,type:'secret_text'}),signal:AbortSignal.timeout(20000)}
 );
 const data=await response.json();
 if(!response.ok||!data.success)throw Error('Cloudflare secret update failed: HTTP '+response.status);
 for(let attempt=0;attempt<8;attempt++){
  const login=await fetch(origin+'/api/admin/login',{
   method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
   body:JSON.stringify({password}),signal:AbortSignal.timeout(15000)
  });
  if(login.ok){
   const cookie=login.headers.get('set-cookie')?.split(';')[0];
   if(!cookie)throw Error('Admin login returned no session.');
   const session=await fetch(origin+'/api/admin/session',{headers:{Cookie:cookie},signal:AbortSignal.timeout(15000)});
   if(!session.ok)throw Error('Admin session verification failed: HTTP '+session.status);
   console.log('GitHub ADMIN_PASSWORD synchronized to Cloudflare and live login verified.');
   return;
  }
  if(login.status!==401&&login.status!==503)throw Error('Admin login failed: HTTP '+login.status);
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
 throw Error('Admin login did not accept the new password after synchronization.');
}
main().catch(error=>{
 console.error(error instanceof Error ? error.message : 'Admin password synchronization failed.');
 process.exitCode=1;
});
