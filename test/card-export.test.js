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
