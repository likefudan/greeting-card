import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const [label,greeting='有些小心意，想留给你随时领取。',base='https://card.llmat.dev']=process.argv.slice(2);
if(!label){console.error('用法：npm run card -- "朋友备注" "网页祝福" [网站地址]');process.exit(1);}
const origin=new URL(base);
if(!['https:','http:'].includes(origin.protocol))throw new Error('Invalid base URL');
const id=randomBytes(16).toString('hex');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
mkdirSync('private',{recursive:true});
writeFileSync(`private/${id}.sql`,`INSERT INTO cards (id,friend_label,greeting) VALUES (${quote(id)},${quote(label)},${quote(greeting)});\n`,{mode:0o600});
const url=new URL(`/c/${id}`,origin).href;
writeFileSync(`private/${id}.json`,JSON.stringify({label,url},null,2),{mode:0o600});
console.log(`卡片配置已生成（尚未导入数据库）。\n链接：${url}\n导入：npx wrangler d1 execute qr-greeting-card --remote --file=private/${id}.sql`);
