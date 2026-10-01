// Print at 100% / actual size. No card content is sent to an export service.
export const CARD_SIZE = { width:85.6, height:54, pixelsPerMm:20 };
const palettes = {
  cream:['#fffcf5','#51493f','#a3ad83'],rose:['#fff8f8','#714b58','#dba8b9'],
  sage:['#f9fcf6','#485b49','#b4c6aa'],night:['#303d50','#f2e9d9','#d5b886'],
  ocean:['#f8ffff','#315a64','#7ab4b9'],lavender:['#fbf9ff','#625479','#b8a1d3'],
  sunset:['#fffaf3','#855641','#dfab7e'],peach:['#fffbf8','#845f50','#efb6a0'],
  sky:['#fafdff','#486185','#a4c3e8'],paper:['#fffefa','#423f3a','#c0b69e']
};
const font = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", sans-serif';
function wrap(ctx,text,width){
  const lines=[];let line='';
  for(const c of Array.from(text)){if(line&&ctx.measureText(line+c).width>width){lines.push(line);line=c;}else line+=c;}
  if(line)lines.push(line);return lines;
}
export async function createCardCanvas(card,qr){
  await document.fonts.ready;
  const canvas=document.createElement('canvas');canvas.width=1712;canvas.height=1080;
  const ctx=canvas.getContext('2d');ctx.scale(20,20);ctx.textBaseline='top';
  const [paper,ink,accent]=palettes[card.theme]||palettes.cream;
  ctx.fillStyle=paper;ctx.fillRect(0,0,85.6,54);
  ctx.strokeStyle=accent;ctx.lineWidth=.25;ctx.strokeRect(2,2,81.6,50);
  ctx.fillStyle=accent;ctx.fillRect(5,7.3,8,.35);
  ctx.font=`1.6px ${font}`;ctx.fillText('A LITTLE SOMETHING, JUST FOR YOU',5,4.5);
  ctx.fillStyle=ink;
  let nameSize=3.5,nameLines;
  do{ctx.font=`600 ${nameSize}px ${font}`;nameLines=wrap(ctx,'给 '+card.name,43);if(nameLines.length*nameSize*1.18<=9)break;nameSize-=.1;}while(nameSize>1.4);
  nameLines.forEach((line,i)=>ctx.fillText(line,5,10+i*nameSize*1.18));
  ctx.font=`2.6px ${font}`;ctx.fillText('一点小心意，随时领取。',5,20);
  let actionSize=2.1,lines;
  do{ctx.font=`${actionSize}px ${font}`;lines=card.actions.flatMap((label,i)=>wrap(ctx,`${i+1}. ${label}`,43));if(lines.length*actionSize*1.25<=23)break;actionSize-=.05;}while(actionSize>1.25);
  lines.forEach((line,i)=>ctx.fillText(line,5,25+i*actionSize*1.25));
  ctx.font=`italic 2.1px Georgia, ${font}`;ctx.fillText('from like',5,49);
  // Draw modules at integer pixel boundaries with a four-module quiet zone.
  if(!Number.isInteger(qr.size)||qr.size<21||qr.size>177||!Array.isArray(qr.data)||qr.data.length!==qr.size*qr.size)throw Error('二维码数据不完整，请重试。');
  const cell=Math.floor(580/(qr.size+8))/20,offset=(29-cell*(qr.size+8))/2;
  ctx.fillStyle='#fff';ctx.fillRect(52,14,29,29);ctx.fillStyle='#000';
  for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.data[y*qr.size+x])ctx.fillRect(52+offset+(x+4)*cell,14+offset+(y+4)*cell,cell,cell);
  ctx.fillStyle=ink;ctx.textAlign='center';ctx.font=`2px ${font}`;ctx.fillText('扫码，打开你的专属贺卡',66.5,45.5);
  ctx.fillStyle=accent;ctx.font=`1.5px ${font}`;ctx.fillText(new URL(card.url).hostname,66.5,49);
  return canvas;
}
export function canvasToPdf(canvas){
  // A lossless RGB image keeps QR edges crisp and supports all browser fonts.
  const rgba=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  const rgb=new Uint8Array(canvas.width*canvas.height*3);
  for(let i=0,j=0;i<rgba.length;i+=4){rgb[j++]=rgba[i];rgb[j++]=rgba[i+1];rgb[j++]=rgba[i+2];}
  const w=(CARD_SIZE.width*72/25.4).toFixed(6),h=(CARD_SIZE.height*72/25.4).toFixed(6);
  const enc=new TextEncoder(),parts=[],offsets=[0];let size=0;
  const append=value=>{const bytes=typeof value==='string'?enc.encode(value):value;parts.push(bytes);size+=bytes.length;};
  const object=(id,content)=>{offsets[id]=size;append(`${id} 0 obj\n${content}\nendobj\n`);};
  append('%PDF-1.4\n');
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Card 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4]=size;append(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${rgb.length} >>\nstream\n`);append(rgb);append('\nendstream\nendobj\n');
  const commands=`q ${w} 0 0 ${h} 0 0 cm /Card Do Q\n`;
  object(5,`<< /Length ${enc.encode(commands).length} >>\nstream\n${commands}endstream`);
  const xref=size;append('xref\n0 6\n0000000000 65535 f \n');
  for(let i=1;i<=5;i++)append(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts,{type:'application/pdf'});
}
export function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
