// Shared QR geometry: soft round dots and rounded finder "eyes".
// Units are QR modules, excluding the quiet zone. Dark modules stay dark on light paper for reliable scanning.
export function qrShapes(qr){
  if(!Number.isInteger(qr?.size)||qr.size<21||qr.size>177||!Array.isArray(qr.data)||qr.data.length!==qr.size*qr.size)throw Error('二维码数据不完整，请重试。');
  const n=qr.size,finders=[[0,0],[n-7,0],[0,n-7]];
  const inFinder=(x,y)=>finders.some(([fx,fy])=>x>=fx&&x<fx+7&&y>=fy&&y<fy+7);
  const dots=[];
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.data[y*n+x]&&!inFinder(x,y))dots.push([x,y]);
  return {size:n,dots,finders};
}
// Rounded-rectangle path as an SVG "d" string; also used to build Canvas paths via Path2D.
export function roundRect(x,y,w,h,r){
  return `M${x+r} ${y}H${x+w-r}A${r} ${r} 0 0 1 ${x+w} ${y+r}V${y+h-r}A${r} ${r} 0 0 1 ${x+w-r} ${y+h}H${x+r}A${r} ${r} 0 0 1 ${x} ${y+h-r}V${y+r}A${r} ${r} 0 0 1 ${x+r} ${y}Z`;
}
// Path data for the whole code at the given module size, offset to (ox,oy). Fill with the even-odd rule.
export function qrPath(qr,cell,ox=0,oy=0){
  const {dots,finders}=qrShapes(qr),r=cell*.42,parts=[];
  const f=v=>+v.toFixed(3);
  for(const [fx,fy] of finders){
    const x=ox+fx*cell,y=oy+fy*cell;
    parts.push(roundRect(f(x),f(y),f(7*cell),f(7*cell),f(cell*2.2)),roundRect(f(x+cell),f(y+cell),f(5*cell),f(5*cell),f(cell*1.4)));
    parts.push(roundRect(f(x+2*cell),f(y+2*cell),f(3*cell),f(3*cell),f(cell*.9)));
  }
  for(const [x,y] of dots){const cx=f(ox+(x+.5)*cell),cy=f(oy+(y+.5)*cell);parts.push(`M${f(cx-r)} ${cy}a${f(r)} ${f(r)} 0 1 0 ${f(2*r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2*r)} 0Z`);}
  return parts.join('');
}
// Panel and module colors per card theme. Night uses a light panel because inverted codes scan poorly.
export const QR_COLORS={
  cream:{bg:'#fffcf5',ink:'#463f36'},rose:{bg:'#fff8f8',ink:'#5e3a47'},sage:{bg:'#f9fcf6',ink:'#38493a'},
  night:{bg:'#f6efe2',ink:'#27324a'},ocean:{bg:'#f8ffff',ink:'#264b54'},lavender:{bg:'#fbf9ff',ink:'#4f4266'},
  sunset:{bg:'#fffaf3',ink:'#6e4433'},peach:{bg:'#fffbf8',ink:'#6d4b3e'},sky:{bg:'#fafdff',ink:'#38506f'},
  paper:{bg:'#fffefa',ink:'#36332f'}
};
