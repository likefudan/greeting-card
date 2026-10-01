import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canvasToPdf,CARD_SIZE} from '../public/card-export.js';
test('print export is a lossless one-page PDF with exact credit-card dimensions',async()=>{
  const canvas={width:1,height:1,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray([255,128,0,255])})})};
  const blob=canvasToPdf(canvas),bytes=new Uint8Array(await blob.arrayBuffer()),text=new TextDecoder().decode(bytes);
  assert.equal(blob.type,'application/pdf');assert.equal(CARD_SIZE.width,85.6);assert.equal(CARD_SIZE.height,54);
  assert.match(text,/MediaBox \[0 0 242\.645669 153\.070866\]/);assert.match(text,/\/Count 1/);
  assert.match(text,/\/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Length 3/);
  assert.doesNotMatch(text,/DCTDecode/); // No lossy JPEG encoding of QR edges.
  const xref=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(new TextDecoder().decode(bytes.slice(xref,xref+4)),'xref');
});
test('letter sheet places ten actual-size cards on one page, compressed losslessly, crop marks off the cards',async()=>{
  const {canvasesToSheetPdf,sheetLayout,THEME_IDS}=await import('../public/card-export.js');
  const {inflateSync}=await import('node:zlib');
  assert.equal(THEME_IDS.length,10);
  const pixel=i=>new Uint8ClampedArray([i,2*i,3*i,255,9,8,7,255]);
  const canvases=THEME_IDS.map((_,i)=>({width:2,height:1,getContext:()=>({getImageData:()=>({data:pixel(i)})})}));
  const bytes=new Uint8Array(await(await canvasesToSheetPdf(canvases)).arrayBuffer()),text=new TextDecoder('latin1').decode(bytes);
  assert.match(text,/MediaBox \[0 0 612 792\]/);assert.match(text,/\/Count 1/);
  assert.equal(text.match(/\/Filter \/FlateDecode/g).length,10);assert.equal(text.match(/\/Im\d+ Do/g).length,10);
  const at=text.indexOf('stream\n',text.indexOf('/Subtype /Image'))+7,len=Number(text.slice(text.indexOf('/Subtype /Image')).match(/\/Length (\d+)/)[1]);
  assert.deepEqual([...inflateSync(bytes.slice(at,at+len))],[0,0,0,9,8,7]);
  const xref=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(text.slice(xref,xref+4),'xref');
  const {slots,marks}=sheetLayout(),inside=(x,y)=>slots.some(s=>x>s.x&&x<s.x+CARD_SIZE.width&&y>s.y&&y<s.y+CARD_SIZE.height);
  for(const s of slots){assert.ok(s.x>=0&&s.y>=0&&s.x+CARD_SIZE.width<=215.9&&s.y+CARD_SIZE.height<=279.4);}
  for(const [x1,y1,x2,y2] of marks){assert.ok(!inside(x1,y1)&&!inside(x2,y2)&&!inside((x1+x2)/2,(y1+y2)/2));assert.ok(Math.min(x1,x2,y1,y2)>=0&&Math.max(x1,x2)<=215.9&&Math.max(y1,y2)<=279.4);}
});
