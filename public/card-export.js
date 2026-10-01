// Print at 100% / actual size. No card content is sent to an export service.
export const CARD_SIZE = { width:85.6, height:54, pixelsPerMm:20 };
import {qrPath,QR_COLORS} from './qr-style.js';
const serif='"Songti SC","STSong","Noto Serif SC","Noto Serif CJK SC","Source Han Serif SC","SimSun",serif';
const kai='"Kaiti SC","STKaiti","KaiTi","LXGW WenKai","BiauKai",'+serif;
const latin='"Baskerville","Didot","Hoefler Text","Georgia",serif';
const sans='"Avenir Next","Helvetica Neue","Segoe UI",Arial,sans-serif';
// [paper, ink, accent, soft, title font, decoration]
const themes={
  cream:['#fffcf5','#51493f','#a3ad83','#edf0e5',serif,'sprig'],
  rose:['#fff8f8','#714b58','#dba8b9','#f6e3ea',kai,'hearts'],
  sage:['#f9fcf6','#485b49','#a9bf9e','#e3eedf',serif,'leaves'],
  night:['#303d50','#f2e9d9','#d5b886','#3f4e63',serif,'stars'],
  ocean:['#f8ffff','#315a64','#7ab4b9','#dcefee',serif,'waves'],
  lavender:['#fbf9ff','#625479','#b8a1d3','#ece6f7',kai,'lavender'],
  sunset:['#fffaf3','#855641','#dfab7e','#f6e0cf',kai,'sun'],
  peach:['#fffbf8','#845f50','#efb6a0','#fbe7dd',kai,'blossoms'],
  sky:['#fafdff','#486185','#a4c3e8','#e2ecfa',serif,'clouds'],
  paper:['#fffefa','#423f3a','#c0b69e','#efece4',serif,'postmark']
};
function wrap(ctx,text,width){
  const lines=[];let line='';
  for(const c of Array.from(text)){if(line&&ctx.measureText(line+c).width>width){lines.push(line);line=c;}else line+=c;}
  if(line)lines.push(line);return lines;
}
function spaced(ctx,text,x,y,gap){for(const c of text){ctx.fillText(c,x,y);x+=ctx.measureText(c).width+gap;}return x;}
const rr=(ctx,x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);};
// Small vector motifs, in millimetres, drawn with the theme accent.
const heart=(ctx,x,y,s)=>{ctx.beginPath();ctx.moveTo(x,y+s*.3);ctx.bezierCurveTo(x,y-s*.05,x-s*.5,y-s*.05,x-s*.5,y+s*.28);ctx.bezierCurveTo(x-s*.5,y+s*.55,x-s*.15,y+s*.72,x,y+s*.9);ctx.bezierCurveTo(x+s*.15,y+s*.72,x+s*.5,y+s*.55,x+s*.5,y+s*.28);ctx.bezierCurveTo(x+s*.5,y-s*.05,x,y-s*.05,x,y+s*.3);ctx.fill();};
const sparkle=(ctx,x,y,s)=>{ctx.beginPath();ctx.moveTo(x,y-s);ctx.quadraticCurveTo(x,y,x+s,y);ctx.quadraticCurveTo(x,y,x,y+s);ctx.quadraticCurveTo(x,y,x-s,y);ctx.quadraticCurveTo(x,y,x,y-s);ctx.fill();};
const leaf=(ctx,x,y,len,angle,w=.38)=>{ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(len*.5,-len*w,len,0);ctx.quadraticCurveTo(len*.5,len*w,0,0);ctx.fill();ctx.restore();};
const blossom=(ctx,x,y,s,center)=>{for(let i=0;i<5;i++){const a=i*Math.PI*2/5-Math.PI/2;ctx.beginPath();ctx.arc(x+Math.cos(a)*s*.55,y+Math.sin(a)*s*.55,s*.42,0,Math.PI*2);ctx.fill();}const f=ctx.fillStyle;ctx.fillStyle=center;ctx.beginPath();ctx.arc(x,y,s*.28,0,Math.PI*2);ctx.fill();ctx.fillStyle=f;};
const cloud=(ctx,x,y,s)=>{ctx.beginPath();ctx.arc(x,y,s*.42,Math.PI*.5,Math.PI*1.5);ctx.arc(x+s*.55,y-s*.3,s*.55,Math.PI,Math.PI*1.9);ctx.arc(x+s*1.2,y-s*.05,s*.4,Math.PI*1.3,Math.PI*.5);ctx.closePath();ctx.fill();};
const dot=(ctx,x,y,r)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();};
function wave(ctx,x,y,w,amp,period){ctx.beginPath();ctx.moveTo(x,y);for(let t=0;t<=w;t+=.25)ctx.lineTo(x+t,y+Math.sin(t/period*Math.PI*2)*amp);ctx.stroke();}
function glyph(ctx,kind,x,y,c){
  ctx.fillStyle=c.accent;ctx.strokeStyle=c.accent;ctx.lineWidth=.22;ctx.lineCap='round';
  ({hearts:()=>heart(ctx,x,y-.9,1.9),stars:()=>sparkle(ctx,x,y,1),sun:()=>{dot(ctx,x,y,.55);for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*.85,y+Math.sin(a)*.85);ctx.lineTo(x+Math.cos(a)*1.2,y+Math.sin(a)*1.2);ctx.stroke();}},
    blossoms:()=>blossom(ctx,x,y,.9,c.paper),clouds:()=>cloud(ctx,x-.6,y+.35,1.2),waves:()=>wave(ctx,x-1.3,y,2.6,.35,1.3),
    lavender:()=>{for(let i=0;i<4;i++)dot(ctx,x+(i%2?.25:-.25),y-1+i*.5,.3);},postmark:()=>heart(ctx,x,y-.9,1.9)
  }[kind]||(()=>{ctx.beginPath();ctx.moveTo(x-.2,y+1.1);ctx.quadraticCurveTo(x,y,x+.3,y-1.1);ctx.stroke();leaf(ctx,x,y+.2,1.3,-2.5);leaf(ctx,x+.1,y-.3,1.3,-.5);}))();
}
function decoration(ctx,kind,c){
  // Lower-right vignette under the QR code: box x 54–81, y 40–51.
  ctx.save();ctx.fillStyle=c.accent;ctx.strokeStyle=c.accent;ctx.lineWidth=.25;ctx.lineCap='round';ctx.lineJoin='round';
  const draw={
    sprig(){for(const [x,y,k] of [[73,50.5,1],[78.5,50.5,-.6]]){ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x-1.5*k,y-4,x-.5*k,y-8);ctx.stroke();for(let i=1;i<5;i++){const t=y-i*1.8;leaf(ctx,x-.9*k*(i/4),t,1.9,-Math.PI/2-.8,.42);leaf(ctx,x-.9*k*(i/4),t-.6,1.9,-Math.PI/2+.8,.42);}}dot(ctx,62,48,.35);dot(ctx,65,45.5,.25);dot(ctx,59,50,.25);},
    hearts(){heart(ctx,75.5,41.5,5);ctx.globalAlpha=.6;heart(ctx,69,46,3);ctx.globalAlpha=.4;heart(ctx,79,47.5,2);heart(ctx,63.5,48.5,1.5);},
    leaves(){ctx.beginPath();ctx.moveTo(57,49.5);ctx.bezierCurveTo(64,46,72,47,80,42);ctx.stroke();for(const [x,y,a] of [[60,48.3,-2.4],[63,47.3,.6],[66.5,47,-2.2],[69.5,46.6,.9],[73,45.6,-2],[76,44.2,1],[78.5,43,-1.8]]){ctx.beginPath();ctx.ellipse(x+Math.cos(a)*1,y+Math.sin(a)*1,1.1,.75,a,0,Math.PI*2);ctx.fill();}},
    stars(){ctx.beginPath();ctx.arc(76,44.5,3.2,0,Math.PI*2);ctx.fill();ctx.fillStyle=c.paper;ctx.beginPath();ctx.arc(77.4,43.4,2.9,0,Math.PI*2);ctx.fill();ctx.fillStyle=c.accent;for(const [x,y,s] of [[67,42.5,1.1],[70.5,48.5,.8],[62,46,.6],[81,49.5,.5],[58.5,49.5,.45]])sparkle(ctx,x,y,s);for(const [x,y] of [[65,49.8],[72.5,41.8],[60,43.5]])dot(ctx,x,y,.18);},
    waves(){for(const [y,a,o] of [[44.5,.6,1],[47,.7,.7],[49.5,.8,.45]]){ctx.globalAlpha=o;wave(ctx,56,y,25,a,4.5);}ctx.globalAlpha=1;ctx.lineWidth=.2;for(const [x,y,r] of [[66,41.5,.5],[68,40.7,.32],[77,41.8,.38]]){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();}},
    lavender(){for(const [x,h,lean] of [[66,8,-.12],[70,9.5,0],[74,8.5,.1],[78,7,.18]]){ctx.beginPath();ctx.moveTo(x,51);ctx.quadraticCurveTo(x+lean*4,51-h*.6,x+lean*h,51-h);ctx.stroke();for(let i=0;i<5;i++){const t=.55+i*.1,bx=x+lean*h*t,by=51-h*t;ctx.beginPath();ctx.ellipse(bx-.35,by,.32,.55,-.4,0,Math.PI*2);ctx.ellipse(bx+.35,by,.32,.55,.4,0,Math.PI*2);ctx.fill();}}},
    sun(){ctx.save();ctx.beginPath();ctx.rect(54,38,28,9.7);ctx.clip();dot(ctx,71,47.7,4);for(let i=0;i<9;i++){const a=Math.PI+i*Math.PI/8;ctx.beginPath();ctx.moveTo(71+Math.cos(a)*5,47.7+Math.sin(a)*5);ctx.lineTo(71+Math.cos(a)*6.4,47.7+Math.sin(a)*6.4);ctx.stroke();}ctx.restore();for(const [y,x0,x1] of [[48.4,58,84],[49.8,62,80],[51,66,76]]){ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(Math.min(x1,80.5),y);ctx.stroke();}},
    blossoms(){for(const [x,y,s,o] of [[75.5,45,2.2,1],[69.5,48.5,1.5,.75],[79.5,49.5,1.1,.6],[63.5,47,1,.5]]){ctx.globalAlpha=o;blossom(ctx,x,y,s,c.paper);}ctx.globalAlpha=1;leaf(ctx,72,46.5,2.4,2.5);leaf(ctx,77.5,47.5,2,.5);},
    clouds(){cloud(ctx,70,46,4);ctx.globalAlpha=.55;cloud(ctx,61,49,2.4);cloud(ctx,77.5,41.5,2);ctx.globalAlpha=1;ctx.lineWidth=.22;for(const [x,y,s] of [[64,42.5,.9],[66.5,41.5,.6]]){ctx.beginPath();ctx.moveTo(x-s,y-s*.4);ctx.quadraticCurveTo(x-s*.4,y-s*.5,x,y);ctx.quadraticCurveTo(x+s*.4,y-s*.5,x+s,y-s*.4);ctx.stroke();}},
    postmark(){ctx.lineWidth=.22;ctx.beginPath();ctx.arc(72.5,45.5,4.3,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(72.5,45.5,3.4,0,Math.PI*2);ctx.stroke();ctx.font=`600 1.05px ${sans}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('WITH LOVE',72.5,44.6);ctx.fillText('★ LIKE ★',72.5,46.4);for(const y of [43.5,45.5,47.5])wave(ctx,56.5,y,10.5,.45,2.6);}
  };
  (draw[kind]||draw.sprig)();ctx.restore();
}
export async function createCardCanvas(card,qr){
  await document.fonts.ready;
  const canvas=document.createElement('canvas');canvas.width=1712;canvas.height=1080;
  const ctx=canvas.getContext('2d');ctx.scale(20,20);ctx.textBaseline='top';
  const [paper,ink,accent,soft,titleFont,kind]=themes[card.theme]||themes.cream,c={paper,ink,accent,soft};
  ctx.fillStyle=paper;ctx.fillRect(0,0,85.6,54);
  ctx.strokeStyle=accent;ctx.lineWidth=.25;rr(ctx,2.2,2.2,81.2,49.6,2.4);ctx.stroke();
  if(kind==='postmark'){ctx.setLineDash([.5,.5]);ctx.lineWidth=.18;rr(ctx,3.1,3.1,79.4,47.8,1.8);ctx.stroke();ctx.setLineDash([]);}
  const x0=6.5,maxW=42;
  ctx.fillStyle=accent;ctx.font=`1.3px ${latin}`;spaced(ctx,'A LITTLE SOMETHING, JUST FOR YOU',x0,6.2,.32);
  // Name: as large as fits in two lines.
  ctx.fillStyle=ink;
  let nameSize=7.5,nameLines;
  do{ctx.font=`700 ${nameSize}px ${titleFont}`;nameLines=wrap(ctx,card.name,maxW);if(nameLines.length<=2&&nameLines.length*nameSize*1.15<=13)break;nameSize-=.1;}while(nameSize>2);
  let y=9.6;nameLines.forEach((line,i)=>ctx.fillText(line,x0,y+i*nameSize*1.15));y+=nameLines.length*nameSize*1.15+1.4;
  glyph(ctx,kind,x0+1.2,y+.6,c);ctx.fillStyle=accent;ctx.fillRect(x0+3.2,y+.5,7,.22);y+=2.8;
  ctx.fillStyle=ink;ctx.globalAlpha=.78;ctx.font=`2.3px ${titleFont}`;ctx.fillText('一点小心意，随时领取。',x0,y);ctx.globalAlpha=1;y+=4.6;
  // Wishes as rounded tags that wrap; shrink until they fit above the signature.
  let size=2,chips;
  do{
    ctx.font=`${size}px ${titleFont}`;const h=size*1.85,pad=size*.85,gap=size*.6;let cx=x0,cy=y;chips=[];
    for(const label of card.actions){let text=label,w=ctx.measureText(text).width+pad*2;
      while(w>maxW&&text.length>1){text=Array.from(text).slice(0,-2).join('')+'…';w=ctx.measureText(text).width+pad*2;}
      if(cx>x0&&cx+w>x0+maxW){cx=x0;cy+=h+gap;}chips.push({text,x:cx,y:cy,w,h,pad});cx+=w+gap;}
    if(chips.at(-1).y+h<=45)break;size-=.05;
  }while(size>1.2);
  for(const chip of chips){ctx.fillStyle=soft;rr(ctx,chip.x,chip.y,chip.w,chip.h,chip.h/2);ctx.fill();ctx.strokeStyle=accent;ctx.lineWidth=.14;ctx.stroke();
    ctx.fillStyle=ink;ctx.textBaseline='middle';ctx.fillText(chip.text,chip.x+chip.pad,chip.y+chip.h/2+size*.04);ctx.textBaseline='top';}
  ctx.fillStyle=ink;ctx.font=`italic 2.3px ${latin}`;const end=x0+ctx.measureText('from like').width;ctx.fillText('from like',x0,46.8);glyph(ctx,kind,end+1.8,48.1,c);
  // QR code on its own rounded panel with a quiet zone; modules are whole pixels for crisp printing.
  const colors=QR_COLORS[card.theme]||QR_COLORS.cream,px=Math.floor(520/(qr.size+8)),cell=px/20,side=cell*(qr.size+8),panel=27,pxl=54,pyl=8.5;
  ctx.fillStyle=colors.bg;rr(ctx,pxl,pyl,panel,panel,2.2);ctx.fill();ctx.strokeStyle=accent;ctx.lineWidth=.2;ctx.stroke();
  const ox=Math.round((pxl+(panel-side)/2)*20)/20+4*cell,oy=Math.round((pyl+(panel-side)/2)*20)/20+4*cell;
  ctx.fillStyle=colors.ink;ctx.fill(new Path2D(qrPath(qr,cell,ox,oy)),'evenodd');
  // Short link under the code: domain softly, the personal part in ink.
  const link=new URL(card.url),host=link.hostname+'/',path=link.pathname.replace(/^\//,'');
  let urlSize=1.9;do{ctx.font=`500 ${urlSize}px ${sans}`;if(ctx.measureText(host+path).width<=panel)break;urlSize-=.05;}while(urlSize>1);
  const hw=ctx.measureText(host).width,total=hw+ctx.measureText(path).width,ux=pxl+(panel-total)/2;
  ctx.fillStyle=accent;ctx.fillText(host,ux,pyl+panel+1.4);ctx.fillStyle=ink;ctx.fillText(path,ux+hw,pyl+panel+1.4);
  decoration(ctx,kind,c);
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
