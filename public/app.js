const actions = document.querySelector('.actions');
const status = document.querySelector('#status');
const shareLocation = document.querySelector('#share-location');
const id = location.pathname.match(/^\/c\/([a-f0-9]{32})$/)?.[1];
const preview = location.pathname === '/preview';
const key = `card-cooldown:${id || 'preview'}`;
let until = 0, ready = false, sending = false, message = '', locating = false;
try { until = Number(localStorage.getItem(key)) || 0; } catch {}
function remember(value) { until = value; try { localStorage.setItem(key,String(value)); } catch {} }
function render() {
  const seconds = Math.max(0,Math.ceil((until-Date.now())/1000));
  actions.querySelectorAll('button').forEach(b => b.disabled = !ready || sending || seconds>0);
  status.textContent = sending ? (locating ? '正在获取你的位置…' : '正在送出你的心意…') : seconds ? `${message || '这张贺卡刚刚使用过。'} ${seconds} 秒后可再次使用。` : message || (preview ? '预览模式 · 点击只演示效果，不发送通知。' : '点一下，把心意送出去。');
}
function getPosition() {
  return new Promise((resolve,reject)=>{
    if (!navigator.geolocation) { reject(new Error('unavailable')); return; }
    navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:8000});
  });
}
async function respond(code) {
  if(!ready || sending || until>Date.now())return;
  sending=true;render();
  try {
    if(preview){remember(Date.now()+60000);message='演示：心意已送达（未发送通知）。';return;}
    const payload={action:code};
    let locationFailed=false;
    if(shareLocation.checked){
      locating=true;render();
      try {const {coords}=await getPosition();payload.position={latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy};}
      catch {locationFailed=true;}
      finally {locating=false;render();}
    }
    const response=await fetch(`/api/cards/${id}/respond`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    if(data.cooldownUntil)remember(data.cooldownUntil);
    if(response.ok)message=locationFailed?'心意已经送达；未能获取位置，因此没有附上位置。':'心意已经送达。';
    else if(data.error==='cooldown')message='这张贺卡刚刚使用过。';
    else if(data.error==='delivery_unknown')message='暂时无法确认是否送达，请稍后再试。';
    else if(data.error==='not_configured')message='贺卡还在准备中，请稍后再来。';
    else message='这次没能送达，请再试一次。';
  }catch{remember(Date.now()+60000);message='网络中断，暂时无法确认是否送达。';}
  finally{sending=false;render();}
}
function setActions(labels){
  actions.replaceChildren();
  labels.forEach((label,index)=>{
    const button=document.createElement('button');button.type='button';button.dataset.action='a'+index;
    const icon=document.createElement('span');icon.className='icon';icon.setAttribute('aria-hidden','true');icon.textContent=['☀','✧','♡','✿','★','♫'][index];
    const title=document.createElement('span');title.textContent=label;
    const arrow=document.createElement('span');arrow.setAttribute('aria-hidden','true');arrow.textContent='↗';
    button.append(icon,title,arrow);button.onclick=()=>respond(button.dataset.action);actions.append(button);
  });
}
async function load() {
  if(preview){setActions(['今天想见你','想要一份神秘礼物']);ready=true;render();return;}
  if(!id){message='请扫描或打开属于你的贺卡链接。';render();return;}
  try {
    const response=await fetch(`/api/cards/${id}`);
    const data=await response.json();
    if(!response.ok) throw new Error(response.status===404?'这张贺卡已失效或找不到，请向送卡人确认。':'暂时无法打开，请稍后刷新。');
    document.querySelector('#greeting').textContent=data.greeting;
    document.body.dataset.theme=data.theme;
    setActions(data.actions);
    remember(data.cooldownUntil);ready=true;
  } catch(error){message=error.message;}
  render();
}
window.addEventListener('storage',event=>{if(event.key===key){until=Number(event.newValue)||0;render();}});
setInterval(render,1000);load();
