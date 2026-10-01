import {pinyin} from 'pinyin-pro';
// Short public links look like /keke_7hq2mx: name pinyin + a random code.
// The random part (31^6 ≈ 8.9e8) is still the access secret; the prefix is only for readability.
export const SLUG = /^[a-z0-9]{1,12}_[a-z2-9]{6}$/;
const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';
export function namePrefix(name){
  const text = pinyin(name,{toneType:'none',type:'array',surname:'head',nonZh:'consecutive'}).join('');
  return text.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,12) || 'card';
}
export function randomCode(length=6){
  let out='';
  while(out.length<length){for(const b of crypto.getRandomValues(new Uint8Array(length*2))){if(b<248&&out.length<length)out+=alphabet[b%31];}}
  return out;
}
export const makeSlug = name => namePrefix(name)+'_'+randomCode();
export const cardUrl = (origin,row) => origin+(row.slug ? '/'+row.slug : '/c/'+row.id);
