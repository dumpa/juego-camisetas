// dumpa-codec.js — Portable codec for Juego de las Camisetas (v0.9 v5)
// Works in modern browsers and Node 22+. No external dependencies.
//
// ─── REGLA CRÍTICA ──────────────────────────────────────────────
// Mode 'molde' (DM v4)    → para COMPARTIR entre usuarios. Solo diseño.
// Mode 'snapshot' (DM v5) → para SYNC PERSONAL entre tus devices.
//                            Incluye estado completo + completions + timestamps.
// ────────────────────────────────────────────────────────────────
//
// USAGE EN EL APP:
//   import { encodeCamisetaToPng, decodeImageToCamiseta } from './codec/index.js';
//
//   // Export (default mode = 'molde')
//   const blob = await encodeCamisetaToPng(camiseta);
//   await navigator.share({ files: [new File([blob], `${camiseta.nombre}.png`, { type: 'image/png' })] });
//
//   // Import
//   const file = e.target.files[0];  // from <input type="file">
//   const { mode, camiseta } = await decodeImageToCamiseta(file);
//   // mode === 'molde' → crear nueva camiseta limpia con origen_camiseta_id apuntando al id recibido
//   // mode === 'snapshot' → restaurar estado completo (solo si es backup propio)

// ============================================================
// CONSTANTS
// ============================================================
const CELL = 14, PAD = CELL/2;
const COLS = Math.floor(1000/CELL), ROWS = COLS;
const RADII = [0, 1.6, 2.7, 4.0];

// Thresholds for cell classification (calibrated for CELL=14, sample 7x7 center vs ±6 corners)
const T01 = 15, T12 = 65, T23 = 160;

const TONO_COLORS = {fisica:'#DA1895',emocional:'#0DEDF7',creativa:'#F4FF01',profunda:'#8900FD'};
// Paleta del motivo (glitch/punk), independiente de los tonos del cuerpo.
const MOTIVO_COLORS = ['#FF9E01','#37FF14','#00F0FF','#7505ED','#F3144D','#F4FF01'];
const TONO_ORDER = ['fisica','emocional','creativa','profunda'];
const DEFAULT_BODY = '#bdb5a8';

const T_EPOCH = Date.UTC(2024, 0, 1) / 1000;

// ============================================================
// DATA REGION (where codec dots live)
// ============================================================
function isDataRegion(x, y) {
  if (x < 18 || x > 982 || y < 18 || y > 982) return false;
  if (y > 75 && y < 215) return false;                                                    // título
  if (y > 55 && y < 75 && x > 250 && x < 750) return false;                               // accent ascenders (Á, Í)
  if (y > 215 && y < 232) return false;                                                    // green band (full width)
  if (y > 232 && y < 275 && x > 140 && x < 860) return false;                             // arco sticker
  if (y > 290 && y < 320 && ((x > 215 && x < 310) || (x > 690 && x < 780))) return false; // labels FRONT/BACK
  if (y > 295 && y < 745) {                                                               // tshirts
    if (x > 85 && x < 445) return false;
    if (x > 555 && x < 915) return false;
  }
  if (y > 905 && y < 970) return false;                                                   // footer
  return true;
}

function buildCellList() {
  const list = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * CELL + PAD, y = row * CELL + PAD;
      if (isDataRegion(x, y)) list.push({ col, row, x, y });
    }
  }
  return list;
}

// ============================================================
// PAYLOAD SERIALIZATION HELPERS
// ============================================================
function writeStr(bytes, s) {
  const enc = new TextEncoder().encode(s || '');
  if (enc.length > 255) throw new Error(`String too long (max 255 bytes): ${s}`);
  bytes.push(enc.length);
  for (const b of enc) bytes.push(b);
}
function readStr(bytes, ofs) {
  const len = bytes[ofs];
  const s = new TextDecoder().decode(bytes.slice(ofs+1, ofs+1+len));
  return [s, ofs+1+len];
}
function writeU32(bytes, n) { bytes.push(n & 0xff, (n>>>8) & 0xff, (n>>>16) & 0xff, (n>>>24) & 0xff); }
function readU32(bytes, ofs) { return [(bytes[ofs] | (bytes[ofs+1]<<8) | (bytes[ofs+2]<<16) | (bytes[ofs+3]<<24)) >>> 0, ofs+4]; }

const tsToU32 = iso => iso ? Math.floor(new Date(iso).getTime()/1000 - T_EPOCH) : 0;
const u32ToTs = u32 => u32 ? new Date((u32 + T_EPOCH) * 1000).toISOString().replace(/\.\d+Z$/, 'Z') : null;

// ============================================================
// MOLDE FORMAT (DM v4) — para compartir entre usuarios
// SOLO el diseño. Cumple "camisetas se transmiten en cero".
// ============================================================
function encodeMoldeInner(cam) {
  const b = [];
  writeStr(b, cam.id || '');
  writeStr(b, cam.nombre);
  writeStr(b, cam.emoji || '');
  writeStr(b, cam.esencia || '');
  writeStr(b, cam.arco?.de || '');
  writeStr(b, cam.arco?.a || '');
  b.push(cam.origen === 'comprada' ? 1 : 0);
  writeStr(b, cam.creador_id || '');
  writeStr(b, cam.origen_camiseta_id || '');
  b.push(cam.misiones.length);
  for (const m of cam.misiones) {
    writeStr(b, m.nombre);
    b.push({rapida:0,recurrente:1,unica:2}[m.forma] ?? 1);
    let t = 0;
    for (const tn of (m.tonos||[])) t |= {fisica:1,emocional:2,creativa:4,profunda:8}[tn] || 0;
    b.push(t);
    b.push(m.puntos_base || 1);
  }
  b.push(cam.milestones.length);
  for (const ms of cam.milestones) {
    writeStr(b, ms.nombre);
    writeStr(b, ms.regalo || '');
    writeStr(b, ms.descripcion || '');
  }
  return new Uint8Array(b);
}

function decodeMoldeInner(bytes) {
  let i = 0, s;
  [s,i]=readStr(bytes,i); const id=s;
  [s,i]=readStr(bytes,i); const nombre=s;
  [s,i]=readStr(bytes,i); const emoji=s;
  [s,i]=readStr(bytes,i); const esencia=s;
  [s,i]=readStr(bytes,i); const arcoDe=s;
  [s,i]=readStr(bytes,i); const arcoA=s;
  const origen = bytes[i++]===1?'comprada':'propia';
  [s,i]=readStr(bytes,i); const creador_id=s;
  [s,i]=readStr(bytes,i); const origen_camiseta_id=s;
  const arco = (arcoDe||arcoA) ? {de:arcoDe,a:arcoA} : null;
  const nm = bytes[i++];
  const misiones = [];
  for (let k=0;k<nm;k++) {
    [s,i]=readStr(bytes,i); const mn=s;
    const forma=['rapida','recurrente','unica'][bytes[i++]];
    const tb=bytes[i++];
    const tonos=[];
    if (tb&1) tonos.push('fisica');
    if (tb&2) tonos.push('emocional');
    if (tb&4) tonos.push('creativa');
    if (tb&8) tonos.push('profunda');
    const p=bytes[i++];
    misiones.push({nombre:mn,forma,tonos,puntos_base:p});
  }
  const nms = bytes[i++];
  const milestones = [];
  for (let k=0;k<nms;k++) {
    [s,i]=readStr(bytes,i); const msn=s;
    [s,i]=readStr(bytes,i); const reg=s;
    [s,i]=readStr(bytes,i); const desc=s;
    milestones.push({nombre:msn,regalo:reg,descripcion:desc});
  }
  return {id,nombre,emoji,esencia,arco,origen,creador_id,origen_camiseta_id,misiones,milestones};
}

// ============================================================
// SNAPSHOT FORMAT (DM v5) — para backup/sync PROPIO
// Incluye estado completo, ids, timestamps, completions. Comprimido con deflate.
// NO usar para compartir con otros usuarios.
// ============================================================
function encodeSnapshotInner(cam) {
  const b = [];
  writeStr(b, cam.id || '');
  writeStr(b, cam.nombre);
  writeStr(b, cam.emoji || '');
  writeStr(b, cam.esencia || '');
  writeStr(b, cam.arco?.de || '');
  writeStr(b, cam.arco?.a || '');
  b.push(cam.origen === 'comprada' ? 1 : 0);
  writeStr(b, cam.creador_id || '');
  writeU32(b, tsToU32(cam.created_at));
  b.push(cam.misiones.length);
  for (const m of cam.misiones) {
    writeStr(b, m.id || '');
    writeStr(b, m.nombre);
    b.push({rapida:0,recurrente:1,unica:2}[m.forma] ?? 1);
    let t = 0;
    for (const tn of (m.tonos||[])) t |= {fisica:1,emocional:2,creativa:4,profunda:8}[tn] || 0;
    b.push(t);
    b.push(m.puntos_base || 1);
    b.push({activa:0,hecha:1,archivada:2}[m.estado] ?? 0);
    writeU32(b, tsToU32(m.created_at));
    writeU32(b, tsToU32(m.completed_at));
    b.push((m.completions || []).length);
    for (const c of (m.completions || [])) writeU32(b, tsToU32(c));
  }
  b.push(cam.milestones.length);
  for (const ms of cam.milestones) {
    writeStr(b, ms.id || '');
    writeStr(b, ms.nombre);
    writeStr(b, ms.regalo || '');
    writeStr(b, ms.descripcion || '');
    b.push({pendiente:0,alcanzado:1}[ms.estado] ?? 0);
  }
  return new Uint8Array(b);
}

function decodeSnapshotInner(bytes) {
  let i = 0, s;
  [s,i]=readStr(bytes,i); const id=s;
  [s,i]=readStr(bytes,i); const nombre=s;
  [s,i]=readStr(bytes,i); const emoji=s;
  [s,i]=readStr(bytes,i); const esencia=s;
  [s,i]=readStr(bytes,i); const arcoDe=s;
  [s,i]=readStr(bytes,i); const arcoA=s;
  const origen = bytes[i++]===1?'comprada':'propia';
  [s,i]=readStr(bytes,i); const creador_id=s;
  let u; [u,i]=readU32(bytes,i); const created_at=u32ToTs(u);
  const arco = (arcoDe||arcoA) ? {de:arcoDe,a:arcoA} : null;
  const nm = bytes[i++];
  const misiones = [];
  for (let k=0;k<nm;k++) {
    [s,i]=readStr(bytes,i); const mid=s;
    [s,i]=readStr(bytes,i); const mn=s;
    const forma=['rapida','recurrente','unica'][bytes[i++]];
    const tb=bytes[i++];
    const tonos=[];
    if (tb&1) tonos.push('fisica');
    if (tb&2) tonos.push('emocional');
    if (tb&4) tonos.push('creativa');
    if (tb&8) tonos.push('profunda');
    const p=bytes[i++];
    const est=['activa','hecha','archivada'][bytes[i++]];
    let ca; [ca,i]=readU32(bytes,i);
    let cp; [cp,i]=readU32(bytes,i);
    const nc = bytes[i++];
    const completions = [];
    for (let j=0;j<nc;j++) { let cv; [cv,i]=readU32(bytes,i); completions.push(u32ToTs(cv)); }
    misiones.push({id:mid,nombre:mn,forma,tonos,puntos_base:p,estado:est,created_at:u32ToTs(ca),completed_at:u32ToTs(cp),completions});
  }
  const nms = bytes[i++];
  const milestones = [];
  for (let k=0;k<nms;k++) {
    [s,i]=readStr(bytes,i); const msid=s;
    [s,i]=readStr(bytes,i); const msn=s;
    [s,i]=readStr(bytes,i); const reg=s;
    [s,i]=readStr(bytes,i); const desc=s;
    const est=['pendiente','alcanzado'][bytes[i++]];
    milestones.push({id:msid,nombre:msn,regalo:reg,descripcion:desc,estado:est});
  }
  return {id,nombre,emoji,esencia,arco,origen,creador_id,created_at,misiones,milestones};
}

// ============================================================
// COMPRESSION (native CompressionStream — universal browser + Node 22+)
// ============================================================
async function deflateRaw(bytes) {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const reader = cs.readable.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const b of value) chunks.push(b);
  }
  return new Uint8Array(chunks);
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const reader = ds.readable.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const b of value) chunks.push(b);
  }
  return new Uint8Array(chunks);
}

// ============================================================
// HIGH-LEVEL PAYLOAD ENCODE/DECODE WITH FRAMING
// ============================================================
// Framing: [0x44 0x4D][version:u8] + (for v5 only: [comp_len:u16-LE]) + bytes...
function encodeMoldePayload(cam) {
  const inner = encodeMoldeInner(cam);
  const out = new Uint8Array(3 + inner.length);
  out[0] = 0x44; out[1] = 0x4D; out[2] = 0x04;
  out.set(inner, 3);
  return out;
}

async function encodeSnapshotPayload(cam) {
  const inner = encodeSnapshotInner(cam);
  const compressed = await deflateRaw(inner);
  const out = new Uint8Array(5 + compressed.length);
  out[0] = 0x44; out[1] = 0x4D; out[2] = 0x05;
  out[3] = compressed.length & 0xff;
  out[4] = (compressed.length >>> 8) & 0xff;
  out.set(compressed, 5);
  return out;
}

async function routeDecode(bytes) {
  if (bytes[0] !== 0x44 || bytes[1] !== 0x4D) {
    throw new Error('No es una camiseta — magic bytes inválidos');
  }
  const v = bytes[2];
  if (v === 0x04) {
    return { mode: 'molde', camiseta: decodeMoldeInner(bytes.slice(3)) };
  }
  if (v === 0x05) {
    const compLen = bytes[3] | (bytes[4] << 8);
    const compressed = bytes.slice(5, 5 + compLen);
    const decompressed = await inflateRaw(compressed);
    return { mode: 'snapshot', camiseta: decodeSnapshotInner(decompressed) };
  }
  throw new Error(`Versión de camiseta desconocida: ${v}. Quizá necesites actualizar el app.`);
}

// ============================================================
// BYTES ↔ CELLS (2 bits per cell)
// ============================================================
function bytesToCells(bytes) {
  const cells = [];
  for (const b of bytes) {
    cells.push(b & 3);
    cells.push((b >> 2) & 3);
    cells.push((b >> 4) & 3);
    cells.push((b >> 6) & 3);
  }
  return cells;
}

function cellsToBytes(cells) {
  const bytes = [];
  for (let i = 0; i + 3 < cells.length; i += 4) {
    bytes.push((cells[i]&3) | ((cells[i+1]&3)<<2) | ((cells[i+2]&3)<<4) | ((cells[i+3]&3)<<6));
  }
  return new Uint8Array(bytes);
}

// ============================================================
// V0.7 VISUAL HELPERS
// ============================================================
function countTonos(m){const c={fisica:0,emocional:0,creativa:0,profunda:0};for(const x of m)for(const t of(x.tonos||[]))if(c[t]!==undefined)c[t]++;return c;}
function dominantTono(c){let mx=0,b=null;for(const t of TONO_ORDER)if(c[t]>mx){mx=c[t];b=t;}return b;}
function uniqueTonos(c){return TONO_ORDER.filter(t=>c[t]>0);}
function dominantForma(m){const c={recurrente:0,unica:0,rapida:0};for(const x of m)if(c[x.forma]!==undefined)c[x.forma]++;let mx=0,b=null;for(const f of['recurrente','unica','rapida'])if(c[f]>mx){mx=c[f];b=f;}return b;}
function hashId(id){let h=0;for(let i=0;i<id.length;i++)h=((h<<5)-h+id.charCodeAt(i))|0;return(Math.abs(h).toString(16).toUpperCase()+'00000000').slice(0,8);}
function seedRandom(seed){let s=1;for(let i=0;i<seed.length;i++)s=(s*31+seed.charCodeAt(i))%2147483647;return function(){s=(s*16807)%2147483647;return s/2147483647;};}

function tshirtPath(cx,cy,scale,fd){
  const w=240*scale,h=320*scale;
  let nT='round',nD=22*scale,nH=38*scale,sE=36*scale,sL=70*scale,sDip=22*scale,hF=18*scale;
  if(fd==='unica'){nT='v';nD=56*scale;nH=34*scale;sE=28*scale;sL=48*scale;hF=8*scale;}
  else if(fd==='rapida'){nT='square';nD=32*scale;nH=48*scale;sE=48*scale;sL=52*scale;sDip=18*scale;hF=32*scale;}
  else if(fd==='recurrente'){nT='round';nD=28*scale;nH=42*scale;sE=36*scale;sL=72*scale;hF=12*scale;}
  const shL=cx-w/2,shR=cx+w/2,hemL=shL-hF,hemR=shR+hF,hemY=cy+h,armpitY=cy+sL+8;
  let neck;
  if(nT==='round') neck=`M ${cx-nH} ${cy} A ${nH} ${nD} 0 0 0 ${cx+nH} ${cy}`;
  else if(nT==='v') neck=`M ${cx-nH} ${cy} L ${cx} ${cy+nD} L ${cx+nH} ${cy}`;
  else neck=`M ${cx-nH} ${cy} L ${cx-nH} ${cy+nD} L ${cx+nH} ${cy+nD} L ${cx+nH} ${cy}`;
  const path=`${neck} L ${shR} ${cy+6*scale} L ${shR+sE} ${cy+sL} L ${shR+sE-6*scale} ${cy+sL+sDip} L ${shR-4*scale} ${armpitY} L ${hemR} ${hemY} L ${hemL} ${hemY} L ${shL+4*scale} ${armpitY} L ${shL-sE+6*scale} ${cy+sL+sDip} L ${shL-sE} ${cy+sL} L ${shL} ${cy+6*scale} Z`;
  return {path,bbox:{left:hemL,right:hemR,top:cy,bottom:hemY,w:hemR-hemL,h}};
}

function shapeForMission(m,x,y,size,rand){
  const fill=MOTIVO_COLORS[Math.floor(rand()*MOTIVO_COLORS.length)];
  const rot=Math.floor((rand()-0.5)*40);
  if(m.forma==='rapida')return `<g transform="rotate(${rot} ${x} ${y})"><circle cx="${x}" cy="${y}" r="${size}" fill="${fill}" stroke="#0a0a0a" stroke-width="4"/></g>`;
  if(m.forma==='unica'){const s=size*1.2,inner=s*0.32,pts=[];for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2-Math.PI/2,r=(i%2===0)?s:inner;pts.push(`${x+Math.cos(a)*r},${y+Math.sin(a)*r}`);}return `<g transform="rotate(${rot} ${x} ${y})"><polygon points="${pts.join(' ')}" fill="${fill}" stroke="#0a0a0a" stroke-width="4"/></g>`;}
  const s=size*1.6;return `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x-s/2}" y="${y-s/2}" width="${s}" height="${s}" fill="${fill}" stroke="#0a0a0a" stroke-width="4"/></g>`;
}

function placeShapes(misiones,bbox,rand){
  if(misiones.length===0)return '';
  const cols=3,rows=3,padX=bbox.w*0.18,padY=bbox.h*0.18;
  const iW=bbox.w-padX*2,iH=bbox.h-padY*2;
  const sorted=[...misiones].sort((a,b)=>(b.puntos_base||1)-(a.puntos_base||1));
  let o='';
  for(let i=0;i<sorted.length;i++){
    const m=sorted[i],idx=i%9,col=idx%cols,row=Math.floor(idx/cols);
    const bx=bbox.left+padX+(col+0.5)*(iW/cols),by=bbox.top+padY+(row+0.5)*(iH/rows);
    const jx=(rand()-0.5)*(iW/cols)*0.5,jy=(rand()-0.5)*(iH/rows)*0.5;
    const size=14+Math.min(m.puntos_base||1,5)*5;
    o+=shapeForMission(m,bx+jx,by+jy,size,rand);
  }
  return o;
}

function starBig(cx,cy,size){
  const outer=size,inner=size*0.3,pts=[];
  for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2-Math.PI/2,r=(i%2===0)?outer:inner;pts.push(`${cx+Math.cos(a)*r},${cy+Math.sin(a)*r}`);}
  return `<g><polygon points="${pts.join(' ')}" fill="#F3144D" stroke="#0a0a0a" stroke-width="4"/><circle cx="${cx}" cy="${cy}" r="${inner*0.7}" fill="#F4FF01" stroke="#0a0a0a" stroke-width="2"/></g>`;
}

function placeBack(milestones,misiones,bbox,rand){
  let o='';
  const N=milestones.length;
  for(let i=0;i<N;i++){
    const t=N===1?0.5:i/(N-1);
    const cx=bbox.left+bbox.w*(0.35+(i%2)*0.3);
    const cy=bbox.top+bbox.h*(0.22+t*0.55);
    o+=starBig(cx,cy,30);
  }
  const dc=Math.min(40,10+misiones.length*3);
  const pal=MOTIVO_COLORS;
  for(let i=0;i<dc;i++){
    const x=bbox.left+bbox.w*(0.1+rand()*0.8),y=bbox.top+bbox.h*(0.1+rand()*0.8);
    const r=rand(),c=pal[Math.floor(rand()*pal.length)];
    if(r<0.4){const s=4+rand()*4;o+=`<rect x="${x-s/2}" y="${y-s/2}" width="${s}" height="${s}" fill="${c}" stroke="#0a0a0a" stroke-width="1.5"/>`;}
    else if(r<0.7){const w=8+rand()*12;o+=`<rect x="${x-w/2}" y="${y-1}" width="${w}" height="2.5" fill="${c}"/>`;}
    else if(r<0.9){o+=`<circle cx="${x}" cy="${y}" r="${2+rand()*2}" fill="${c}"/>`;}
    else{const s=4;o+=`<g stroke="${c}" stroke-width="1.8"><line x1="${x-s}" y1="${y-s}" x2="${x+s}" y2="${y+s}"/><line x1="${x-s}" y1="${y+s}" x2="${x+s}" y2="${y-s}"/></g>`;}
  }
  return o;
}

// ============================================================
// SVG GENERATION (the visible image)
// ============================================================
function generateSVG(cam, payloadCells, cellList) {
  const rand=seedRandom(cam.id || cam.nombre || 'x');
  const counts=countTonos(cam.misiones||[]);
  const tonoDom=dominantTono(counts);
  const formaDom=dominantForma(cam.misiones||[]);
  const bodyColor=tonoDom?TONO_COLORS[tonoDom]:DEFAULT_BODY;
  const tonos=uniqueTonos(counts);
  const fT=tshirtPath(265,360,0.95,formaDom);
  const bT=tshirtPath(735,360,0.95,formaDom);
  const fIn={left:fT.bbox.left+30,top:fT.bbox.top+70,w:fT.bbox.w-60,h:fT.bbox.h-110};
  const bIn={left:bT.bbox.left+30,top:bT.bbox.top+70,w:bT.bbox.w-60,h:bT.bbox.h-110};

  // Codec halftone
  let halftone='';
  for(let i=0;i<cellList.length;i++){
    const c=cellList[i],v=i<payloadCells.length?payloadCells[i]:0,r=RADII[v];
    if(r>0) halftone+=`<circle cx="${c.x}" cy="${c.y}" r="${r}" fill="#0a0a0a"/>`;
  }
  // Decorative halftone in non-data areas
  let decorative='';
  for(let row=0;row<ROWS;row++){
    for(let col=0;col<COLS;col++){
      const x=col*CELL+PAD,y=row*CELL+PAD;
      if(!isDataRegion(x,y)){
        const underT=(y>295&&y<745)&&((x>85&&x<445)||(x>555&&x<915));
        if(!underT && !(y>75&&y<215)) decorative+=`<circle cx="${x}" cy="${y}" r="1.4" fill="#0a0a0a" opacity="0.28"/>`;
      }
    }
  }

  // Pastel bands (crossing freely — full width)
  const bands=[{y:365,h:14,c:'#00F0FF'},{y:430,h:18,c:'#DA1895'},{y:510,h:12,c:'#F4FF01'},{y:600,h:16,c:'#00F0FF'},{y:720,h:12,c:'#DA1895'}];
  let bandsSvg='';
  for(const b of bands){
    bandsSvg+=`<polygon points="0,${b.y} 1000,${b.y-10} 1000,${b.y+b.h-10} 0,${b.y+b.h}" fill="${b.c}" opacity="0.7"/>`;
  }
  const greenBand=`<polygon points="0,195 1000,185 1000,221 0,231" fill="#41FF19" opacity="0.8"/>`;

  // Title with RGB split
  const N=cam.nombre.toUpperCase();
  const ts=N.length<=8?110:N.length<=12?88:N.length<=16?70:58;
  const title=`<g font-family="Anton, Impact, sans-serif" font-size="${ts}" text-anchor="middle" letter-spacing="2" font-weight="900">
    <text x="494" y="165" fill="#00d4ff">${N}</text>
    <text x="506" y="165" fill="#ff1493">${N}</text>
    <text x="500" y="165" fill="#0a0a0a">${N}</text>
  </g>`;

  // Arco sticker
  let arco='';
  if(cam.arco?.de && cam.arco?.a){
    const at=`// ${cam.arco.de.toUpperCase()} → ${cam.arco.a.toUpperCase()}`;
    const aw=Math.min(700,140+at.length*9),ax=(1000-aw)/2;
    arco=`<g transform="rotate(-2.5 500 246)"><rect x="${ax}" y="230" width="${aw}" height="32" fill="#ffd60a" stroke="#0a0a0a" stroke-width="2"/><text x="500" y="252" font-family="Space Mono, monospace" font-size="14" font-weight="700" text-anchor="middle" fill="#0a0a0a" letter-spacing="1.5">${at}</text></g>`;
  }

  const labels=`<g>
    <rect x="235" y="295" width="56" height="20" fill="#f0e5d0" stroke="#0a0a0a" stroke-width="1.5"/>
    <text x="263" y="309" font-family="Space Mono, monospace" font-size="11" font-weight="700" text-anchor="middle" fill="#0a0a0a">FRONT</text>
    <rect x="705" y="295" width="56" height="20" fill="#f0e5d0" stroke="#0a0a0a" stroke-width="1.5"/>
    <text x="733" y="309" font-family="Space Mono, monospace" font-size="11" font-weight="700" text-anchor="middle" fill="#0a0a0a">BACK</text>
  </g>`;

  // Footer with origen, hash, tonos
  const origen=cam.origen==='comprada'?'@DUMPA':'@PROPIA';
  const hash='#'+hashId(cam.id || cam.nombre || 'x');
  const ow=14+origen.length*11,hw=14+hash.length*10;
  let footer=`<g transform="rotate(-3 ${100+ow/2} 934)"><rect x="100" y="920" width="${ow}" height="28" fill="#00d4ff" stroke="#0a0a0a" stroke-width="2"/><text x="${100+ow/2}" y="939" font-family="Space Mono, monospace" font-size="13" font-weight="700" text-anchor="middle" fill="#0a0a0a" letter-spacing="1">${origen}</text></g>
  <g transform="rotate(2 ${420+hw/2} 934)"><rect x="420" y="920" width="${hw}" height="28" fill="#ff1493" stroke="#0a0a0a" stroke-width="2"/><text x="${420+hw/2}" y="939" font-family="Space Mono, monospace" font-size="13" font-weight="700" text-anchor="middle" fill="#0a0a0a" letter-spacing="1">${hash}</text></g>
  <text x="720" y="924" font-family="Space Mono, monospace" font-size="11" fill="#0a0a0a" letter-spacing="3">T O N O S</text>`;
  tonos.forEach((t,i)=>{
    const sx=720+i*32,sy=932,rot=(i%2===0?-6:6);
    footer+=`<g transform="rotate(${rot} ${sx+12} ${sy+12})"><rect x="${sx}" y="${sy}" width="24" height="24" fill="${TONO_COLORS[t]}" stroke="#0a0a0a" stroke-width="2.5"/></g>`;
  });

  const fc=`cf-${cam.id || 'x'}`,bc=`cb-${cam.id || 'x'}`;
  return `<svg viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">
    <defs><clipPath id="${fc}"><path d="${fT.path}"/></clipPath><clipPath id="${bc}"><path d="${bT.path}"/></clipPath></defs>
    <rect width="1000" height="1000" fill="#f0e5d0"/>
    ${bandsSvg}
    ${greenBand}
    ${halftone}
    ${decorative}
    <rect x="6" y="6" width="988" height="988" fill="none" stroke="#0a0a0a" stroke-width="3"/>
    ${title}${arco}${labels}
    <g><path d="${fT.path}" fill="${bodyColor}" stroke="#0a0a0a" stroke-width="5" stroke-linejoin="round"/><g clip-path="url(#${fc})">${placeShapes(cam.misiones||[],fIn,rand)}</g></g>
    <g><path d="${bT.path}" fill="${bodyColor}" stroke="#0a0a0a" stroke-width="5" stroke-linejoin="round"/><g clip-path="url(#${bc})">${placeBack(cam.milestones||[],cam.misiones||[],bIn,rand)}</g></g>
    ${footer}
  </svg>`;
}

// ============================================================
// SVG → PNG BLOB (browser-only — uses <img> + canvas)
// ============================================================
async function svgToPngBlob(svgString) {
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Could not load SVG image'));
      im.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1000; canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 1000, 1000);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas.toBlob failed')), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ============================================================
// CELL SAMPLING (decoder side — local normalization, no global threshold)
// ============================================================
function sampleCells(ctx, cellList) {
  const out = [];
  for (const c of cellList) {
    // Center: 7×7 area at cell center
    const cs = ctx.getImageData(c.x-3, c.y-3, 7, 7).data;
    let centerDark = 0;
    for (let i=0; i<cs.length; i+=4){ centerDark += (255 - (cs[i]+cs[i+1]+cs[i+2])/3); }
    centerDark /= 49;
    // Corners: 4 corners 2×2 at ±6 → 16 samples for local bg estimation
    let cornerDark = 0;
    for (const [dx,dy] of [[-6,-6],[6,-6],[-6,6],[6,6]]) {
      const cn = ctx.getImageData(c.x+dx-1, c.y+dy-1, 2, 2).data;
      for (let i=0; i<cn.length; i+=4){ cornerDark += (255 - (cn[i]+cn[i+1]+cn[i+2])/3); }
    }
    cornerDark /= 16;
    const diff = centerDark - cornerDark;
    out.push(diff < T01 ? 0 : diff < T12 ? 1 : diff < T23 ? 2 : 3);
  }
  return out;
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Encode a camiseta to a PNG Blob ready to share or download.
 *
 * @param {Object} camiseta - the camiseta object with misiones[] and milestones[]
 * @param {Object} [opts]
 * @param {('molde'|'snapshot')} [opts.mode='molde'] - molde for sharing, snapshot for backup
 * @returns {Promise<Blob>} PNG image blob (1000×1000 px)
 */
export async function encodeCamisetaToPng(camiseta, opts = {}) {
  const mode = opts.mode || 'molde';
  const payload = mode === 'snapshot'
    ? await encodeSnapshotPayload(camiseta)
    : encodeMoldePayload(camiseta);

  const cellList = buildCellList();
  const cells = bytesToCells(payload);
  if (cells.length > cellList.length) {
    const maxBytes = Math.floor(cellList.length / 4);
    throw new Error(`Payload demasiado grande: ${payload.length}B > capacidad ${maxBytes}B. Reducí contenido o usá modo 'snapshot' (comprime).`);
  }

  const svg = generateSVG(camiseta, cells, cellList);
  return await svgToPngBlob(svg);
}

/**
 * Decode a camiseta from an image (File, Blob, ImageBitmap, or HTMLImageElement).
 * Auto-detects mode (molde or snapshot) via magic bytes.
 *
 * @param {File|Blob|ImageBitmap|HTMLImageElement} source
 * @returns {Promise<{mode: 'molde'|'snapshot', camiseta: Object}>}
 * @throws {Error} si la imagen no contiene una camiseta válida o la versión es desconocida
 */
export async function decodeImageToCamiseta(source) {
  let bitmap;
  if (source instanceof ImageBitmap) {
    bitmap = source;
  } else if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
    bitmap = await createImageBitmap(source);
  } else {
    bitmap = await createImageBitmap(source);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1000; canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  // Center-crop and scale to 1000×1000
  const minDim = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - minDim) / 2;
  const sy = (bitmap.height - minDim) / 2;
  ctx.drawImage(bitmap, sx, sy, minDim, minDim, 0, 0, 1000, 1000);

  const cellList = buildCellList();
  const cells = sampleCells(ctx, cellList);
  const bytes = cellsToBytes(cells);
  return await routeDecode(bytes);
}

/**
 * For app integration: convenience helper that produces the SVG string only,
 * useful if you want to render in React via dangerouslySetInnerHTML for preview
 * without going through canvas.
 */
export function generateCamisetaSVG(camiseta, opts = {}) {
  const mode = opts.mode || 'molde';
  const payload = mode === 'snapshot'
    ? null  // snapshot needs async, would have to be awaited externally
    : encodeMoldePayload(camiseta);
  if (!payload) throw new Error('Use encodeCamisetaToPng for snapshot mode (async required).');
  const cellList = buildCellList();
  const cells = bytesToCells(payload);
  return generateSVG(camiseta, cells, cellList);
}

// Also expose internals useful for testing in Node (no DOM dependency)
export const __internals = {
  encodeMoldePayload,
  encodeSnapshotPayload,
  routeDecode,
  buildCellList,
  bytesToCells,
  cellsToBytes,
  generateSVG,
};

// For non-module use (CommonJS in Node, etc.), also expose globally:
if (typeof globalThis !== 'undefined') {
  globalThis.DumpaCodec = {
    encodeCamisetaToPng,
    decodeImageToCamiseta,
    generateCamisetaSVG,
  };
}
