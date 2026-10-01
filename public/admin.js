import {createCardCanvas,canvasToPdf,downloadBlob} from './card-export.js';
const $=id=>document.getElementById(id);
const themes=[['cream','奶油信笺','#f7f3eb','#d5dcbf'],['rose','玫瑰粉','#f8eaed','#dba8b9'],['sage','鼠尾草','#eaf0e6','#b4c6aa'],['night','星夜蓝','#1d2735','#d5b886'],['ocean','海盐青','#e4f0f0','#7ab4b9'],['lavender','薰衣草','#efebfa','#b8a1d3'],['sunset','落日橘','#f8e8da','#dfab7e'],['peach','蜜桃粉','#fff0e8','#efb6a0'],['sky','晴空蓝','#e8f0fc','#a4c3e8'],['paper','复古纸','#f1eee7','#c0b69e']];
let next=null,requestId=null,requestFingerprint=null,selectedTheme='cream',selectedCard=null,editingCard=null;
async function api(path,body,method){const response=await fetch('/api/admin/'+path,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok){if(response.status===401){$('manager').hidden=true;$('login').hidden=false;}throw Error(({unauthorized:'请检查管理密码，或重新登录。',name:'请输入 1～60 个字的名字。',actions:'请设置 1～6 个按钮，每个按钮最多 24 个字。',theme:'请重新选择卡片样式。',not_configured:'管理入口正在准备中，请稍后再试。'}[data.error])||'暂时未能完成，请重试。');}return data;}
function actionField(value='') {const div=document.createElement('div');div.className='action-field';const input=document.createElement('input');input.maxLength=24;input.required=true;input.placeholder='按钮文字';input.value=value;input.setAttribute('aria-label','按钮文字');const remove=document.createElement('button');remove.type='button';remove.className='subtle remove';remove.textContent='移除';remove.setAttribute('aria-label','移除这个按钮');remove.onclick=()=>{if($('action-fields').children.length>1)div.remove();};div.append(input,remove);$('action-fields').append(div);}
actionField('今天想见你');actionField('想要一份神秘礼物');
$('add-action').onclick=()=>{if($('action-fields').children.length<6)actionField();else $('status').textContent='最多设置 6 个按钮。';};
for(const [id,label,bg,accent] of themes){const button=document.createElement('button');button.type='button';button.className='theme';button.style.setProperty('--swatch',bg);button.style.setProperty('--accent',accent);button.textContent=label;button.dataset.theme=id;button.setAttribute('role','radio');button.setAttribute('aria-checked',String(id===selectedTheme));button.onclick=()=>{selectedTheme=id;for(const child of $('themes').children)child.setAttribute('aria-checked',String(child===button));};$('themes').append(button);}
function show(card){selectedCard=card;$('result').hidden=false;$('result-name').textContent='给 '+card.name+' 的贺卡';$('card-url').value=card.url;$('qr').src=card.qrUrl;$('open-card').href=card.url;$('download').href=card.qrUrl+'?download=1';$('download').setAttribute('download','greeting-card.svg');}
function edit(card){
 editingCard=card;requestId=null;requestFingerprint=null;
 $('name').value=card.name;$('action-fields').replaceChildren();card.actions.forEach(actionField);
 selectedTheme=card.theme;for(const button of $('themes').children)button.setAttribute('aria-checked',String(button.dataset.theme===selectedTheme));
 $('form-title').textContent='编辑贺卡';$('create').textContent='保存修改';$('cancel-edit').hidden=false;
 $('status').textContent='修改后原链接和二维码保持不变。';$('create-form').scrollIntoView({behavior:'smooth',block:'start'});
}
function finishEdit(){
 editingCard=null;requestId=null;requestFingerprint=null;$('name').value='';$('action-fields').replaceChildren();actionField('今天想见你');actionField('想要一份神秘礼物');
 selectedTheme='cream';for(const button of $('themes').children)button.setAttribute('aria-checked',String(button.dataset.theme==='cream'));
 $('form-title').textContent='创建新贺卡';$('create').textContent='生成专属贺卡 ↗';$('cancel-edit').hidden=true;
}
async function list(append=false){const data=await api('cards'+(append&&next?'?before='+next:''));if(!append)$('cards').replaceChildren();for(const card of data.cards){const div=document.createElement('div');div.className='saved';const details=document.createElement('span');details.textContent=card.name+' · '+(themes.find(t=>t[0]===card.theme)?.[1]||'奶油信笺')+' · '+card.actions.join(' / ');const open=document.createElement('button');open.className='subtle';open.textContent='查看';open.onclick=()=>{show(card);$('result').scrollIntoView({behavior:'smooth',block:'start'});};const change=document.createElement('button');change.className='subtle';change.textContent='编辑';change.onclick=()=>edit(card);const remove=document.createElement('button');remove.className='subtle danger';remove.textContent='删除';remove.onclick=async()=>{if(!confirm(`确定删除给「${card.name}」的贺卡吗？旧二维码和链接会立即失效。`))return;remove.disabled=true;try{await api('cards/'+card.id,null,'DELETE');if(selectedCard?.id===card.id){$('result').hidden=true;selectedCard=null;}if(editingCard?.id===card.id)finishEdit();await list();$('status').textContent='贺卡已删除，原链接失效。';}catch(error){remove.disabled=false;$('status').textContent=error.message;}};const controls=document.createElement('div');controls.className='row';controls.append(open,change,remove);div.append(details,controls);$('cards').append(div);}if(!data.cards.length&&!append)$('cards').textContent='还没有贺卡，先为一位朋友创建吧。';next=data.next;$('more').hidden=!next;}
async function enter(){$('login').hidden=true;$('manager').hidden=false;$('password').value='';await list();}
$('login-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;$('status').textContent='正在登录…';try{await api('login',{password:$('password').value});await enter();$('status').textContent='';}catch(error){$('status').textContent=error.message;}finally{button.disabled=false;}};
$('create-form').onsubmit=async e=>{
 e.preventDefault();const name=$('name').value.trim(),actions=[...$('action-fields').querySelectorAll('input')].map(i=>i.value.trim());if(!name||actions.some(x=>!x))return;
 const editingId=editingCard?.id,fields={name,actions,theme:selectedTheme};
 if(!editingId){const fingerprint=JSON.stringify(fields);if(requestFingerprint!==fingerprint||!requestId){requestId=crypto.randomUUID();requestFingerprint=fingerprint;}}
 $('create').disabled=true;$('cancel-edit').disabled=true;$('status').textContent=editingId?'正在保存修改…':'正在制作这份心意…';
 try{const card=editingId?await api('cards/'+editingId,fields,'PATCH'):await api('cards',{...fields,requestId});show(card);if(editingId)finishEdit();requestId=null;requestFingerprint=null;await list();$('status').textContent=editingId?'已更新，原链接和二维码继续有效。实物卡片如需更新，请重新导出。':'已生成，可以分享了。';$('result').scrollIntoView({behavior:'smooth',block:'start'});}
 catch(error){$('status').textContent=error.message;}
 finally{$('create').disabled=false;$('cancel-edit').disabled=false;}
};
$('cancel-edit').onclick=()=>{finishEdit();$('status').textContent='已取消编辑，未保存修改。';};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('card-url').value);$('status').textContent='链接已复制。';}catch{$('card-url').focus();$('card-url').select();$('status').textContent='请长按链接并选择复制。';}};
$('logout').onclick=async()=>{try{await api('logout',{},'POST');location.reload();}catch(error){$('status').textContent=error.message;}};
$('more').onclick=async()=>{try{await list(true);}catch(error){$('status').textContent=error.message;}};
api('session').then(enter).catch(()=>{});
async function exportCard(format){
  if(!selectedCard)return;
  const card=selectedCard;
  $('export-pdf').disabled=$('export-png').disabled=true;
  $('status').textContent='正在排版打印卡片…';
  try{
    const response=await fetch(card.qrUrl+'?matrix=1');
    if(!response.ok)throw Error('无法获取二维码，请确认贺卡仍有效并重新登录。');
    const canvas=await createCardCanvas(card,await response.json());
    const blob=format==='pdf'?canvasToPdf(canvas):await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw Error('导出失败，请重试。');
    downloadBlob(blob,`greeting-card-${card.id}.${format}`);
    $('status').textContent='已导出。PDF 请按“实际大小 / 100%”打印，不要选择适合页面。';
  }catch(error){$('status').textContent=error.message;}
  finally{$('export-pdf').disabled=$('export-png').disabled=false;}
}
$('export-pdf').onclick=()=>exportCard('pdf');
$('export-png').onclick=()=>exportCard('png');
