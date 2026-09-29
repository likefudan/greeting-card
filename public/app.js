const buttons = [...document.querySelectorAll('button[data-action]')];
const status = document.querySelector('#status');
const id = location.pathname.match(/^\/c\/([a-f0-9]{32})$/)?.[1];
const preview = location.pathname === '/preview';
const key = `card-cooldown:${id || 'preview'}`;
let until = 0, ready = false, sending = false, message = '';
try { until = Number(localStorage.getItem(key)) || 0; } catch {}
function remember(value) { until = value; try { localStorage.setItem(key,String(value)); } catch {} }
function render() {
  const seconds = Math.max(0,Math.ceil((until-Date.now())/1000));
  buttons.forEach(b => b.disabled = !ready || sending || seconds>0);
  status.textContent = sending ? '正在送出你的心意…' : seconds ? `${message || '这张贺卡刚刚使用过。'} ${seconds} 秒后可再次使用。` : message || (preview ? '预览模式 · 点击只演示效果，不发送通知。' : '点一下，把心意送出去。');
}
async function load() {
  if(preview){ready=true;render();return;}
  if(!id){message='请扫描或打开属于你的贺卡链接。';render();return;}
  try {
    const response=await fetch(`/api/cards/${id}`);
    const data=await response.json();
    if(!response.ok) throw new Error(response.status===404?'这张贺卡暂时找不到，请确认链接。':'暂时无法打开，请稍后刷新。');
    document.querySelector('#greeting').textContent=data.greeting;
    remember(data.cooldownUntil);ready=true;
  } catch(error){message=error.message;}
  render();
}
buttons.forEach(button=>button.addEventListener('click',async()=>{
  if(!ready || sending || until>Date.now())return;
  sending=true;render();
  try {
    if(preview){remember(Date.now()+60000);message='演示：心意已送达（未发送通知）。';return;}
    const response=await fetch(`/api/cards/${id}/respond`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:button.dataset.action}),signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    if(data.cooldownUntil)remember(data.cooldownUntil);
    if(response.ok)message='心意已经送达。';
    else if(data.error==='cooldown')message='这张贺卡刚刚使用过。';
    else if(data.error==='delivery_unknown')message='暂时无法确认是否送达，请稍后再试。';
    else if(data.error==='not_configured')message='贺卡还在准备中，请稍后再来。';
    else message='这次没能送达，请再试一次。';
  }catch{remember(Date.now()+60000);message='网络中断，暂时无法确认是否送达。';}
  finally{sending=false;render();}
}));
window.addEventListener('storage',event=>{if(event.key===key){until=Number(event.newValue)||0;render();}});
setInterval(render,1000);load();
