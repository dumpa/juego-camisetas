// dumpa-codec.js — Portable codec for Juego de las Camisetas (v4.0 "la tela es el dato")
// Works in modern browsers and Node 22+. No external dependencies.
//
// ─── QUÉ CAMBIA EN v4 ───────────────────────────────────────────
// • Framing 0x08: deflate-raw + Reed-Solomon(nsym=24) + header triplicado
//   con voto por mayoría. Molde y snapshot comparten framing (flag bit0).
// • Vocabulario v3: formas {rapida,recurrente,unica,facil,dificil},
//   tonos bitmask 8 bits (+estrategica). El encoder NUNCA descarta en
//   silencio: devuelve warnings.
// • Máscara por silueta: el interior de la camiseta es región de datos
//   ("la tela es el dato"). 6 variantes (3 formas × con/sin arco),
//   el decoder las prueba y Reed-Solomon valida cuál es.
// • Reglas de máscara validadas por simulación (0% daño en ciclo
//   WhatsApp q80 / 720px+q75 / 720px+q60):
//     1. EDGE=13 px de buffer al contorno; RGB-split contenido (±2, w5).
//     2. Compuerta de proximidad por bbox del POLÍGONO (las mangas
//        sobresalen del ruedo).
//     3. El panel de estampado excluye con buffer EDGE.
//     4. Bandas alineadas a límites de grilla (y = k·CELL).
// • Los formatos 0x04 (molde) y 0x05 (snapshot) se leen PARA SIEMPRE
//   con la máscara legacy. El encoder solo emite 0x08.
// • Degradación por tiers: si el molde no cabe, recorta descripciones
//   (T3) y trunca esencia antes de rendirse. Flag bit1 = truncado.
//
// ─── REGLA CRÍTICA (sin cambios) ────────────────────────────────
// Mode 'molde'    → para COMPARTIR entre usuarios. Solo diseño.
// Mode 'snapshot' → para SYNC PERSONAL entre tus devices.
// ────────────────────────────────────────────────────────────────
//
// USAGE EN EL APP:
//   import { encodeCamiseta, decodeImageToCamiseta } from './codec/index.js';
//
//   // Export (default mode = 'molde'). encodeCamiseta devuelve warnings;
//   // encodeCamisetaToPng se mantiene por compatibilidad (solo Blob).
//   const { blob, warnings } = await encodeCamiseta(camiseta);
//   if (warnings.length) console.warn('Codec:', warnings);
//
//   // Import (auto-detecta 0x04/0x05/0x08 y la máscara correcta)
//   const { mode, camiseta, warnings } = await decodeImageToCamiseta(file);
//
// BREAKING: generateCamisetaSVG ahora es async (el framing 0x08 comprime).

// ============================================================
// CONSTANTS
// ============================================================
const CELL = 14, PAD = CELL / 2;
const COLS = Math.floor(1000 / CELL), ROWS = COLS;
const RADII = [0, 1.6, 2.7, 4.0];

// Thresholds (calibrados para CELL=14, centro 7×7 vs esquinas ±6) — sin cambios
const T01 = 15, T12 = 65, T23 = 160;

const NSYM = 24;                 // símbolos RS de paridad por bloque (corrige 12)
const RS_DATA = 255 - NSYM;      // 231 bytes de datos por bloque
const VOCAB_VERSION = 3;
const HEADER_LEN = 8;            // [44 4D 08 flags vocabVer nsym lenLo lenHi]
const HEADER_COPIES = 3;         // header triplicado + voto por mayoría

const EDGE = 13;                 // regla 1: buffer al contorno (una celda)

const TONO_COLORS  = { fisica:'#DA1895', emocional:'#0DEDF7', creativa:'#F4FF01', profunda:'#8900FD' };
// La tela: versión pastel (L*≥88) del tono dominante. El neon migra al trazo.
const TONO_PASTEL  = { fisica:'#FBD3EA', emocional:'#D3FAFD', creativa:'#FBFFC9', profunda:'#E6D3FE' };
const DEFAULT_BODY_PASTEL = '#EDE8DE';
const BODY_FILL_OPACITY = 1.0;   // sólida (validada); 0.55 translúcida también validó a 0% —
                                 // decisión estética, ambas son seguras.
const MOTIVO_COLORS = ['#FF9E01','#37FF14','#00F0FF','#7505ED','#F3144D','#F4FF01'];
const TONO_ORDER = ['fisica','emocional','creativa','profunda','estrategica'];

// Regla 4: bandas horizontales con bordes en múltiplos de CELL.
// (Las bandas diagonales cortaban esquinas de muestreo: fuente del 0.3% histórico.)
const BANDS_V4 = [
  { y: 26*CELL, h: CELL, c: '#c6f4f9' },
  { y: 31*CELL, h: CELL, c: '#ffc6d9' },
  { y: 36*CELL, h: CELL, c: '#c6f4f9' },
  { y: 43*CELL, h: CELL, c: '#ffc6d9' },
  { y: 51*CELL, h: CELL, c: '#fff3a6' },
];

const T_EPOCH = Date.UTC(2024, 0, 1) / 1000;

// ============================================================
// VOCABULARIO v3 — cerrado, versionado, sin descartes silenciosos
// ============================================================
const FORMA_ENC = { rapida:0, recurrente:1, unica:2, facil:3, dificil:4 };
const FORMA_DEC = ['rapida','recurrente','unica','facil','dificil'];
const TONO_ENC  = { fisica:1, emocional:2, creativa:4, profunda:8, estrategica:16 };
const TONO_DEC  = [['fisica',1],['emocional',2],['creativa',4],['profunda',8],['estrategica',16]];

function encodeForma(forma, warnings, ctx) {
  const v = FORMA_ENC[forma];
  if (v === undefined) {
    warnings.push(`forma desconocida "${forma}" en ${ctx} — se guardó como "recurrente"`);
    return 1;
  }
  return v;
}
function encodeTonos(tonos, warnings, ctx) {
  let t = 0;
  for (const tn of (tonos || [])) {
    const bit = TONO_ENC[tn];
    if (bit === undefined) warnings.push(`tono desconocido "${tn}" en ${ctx} — no se pudo guardar`);
    else t |= bit;
  }
  return t;
}
function decodeForma(byte, warnings, ctx) {
  const f = FORMA_DEC[byte];
  if (f === undefined) {
    warnings.push(`forma con código ${byte} en ${ctx} — vocabulario más nuevo que este app; se leyó como "recurrente"`);
    return 'recurrente';
  }
  return f;
}
function decodeTonos(byte) {
  const tonos = [];
  for (const [name, bit] of TONO_DEC) if (byte & bit) tonos.push(name);
  return tonos;
}

// ============================================================
// GF(256) + REED-SOLOMON — puerto fiel del esquema clásico (poly 0x11d)
// ============================================================
const GF_EXP = new Uint8Array(512), GF_LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x; GF_LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
const gfDiv = (a, b) => { if (b === 0) throw new Error('GF div/0'); if (a === 0) return 0; return GF_EXP[(GF_LOG[a] + 255 - GF_LOG[b]) % 255]; };
const gfInv = (a) => GF_EXP[255 - GF_LOG[a]];
const gfPow = (a, n) => GF_EXP[(((GF_LOG[a] * n) % 255) + 255) % 255];

function gfPolyScale(p, x) { return p.map(c => gfMul(c, x)); }
function gfPolyAdd(p, q) {
  const r = new Array(Math.max(p.length, q.length)).fill(0);
  for (let i = 0; i < p.length; i++) r[i + r.length - p.length] = p[i];
  for (let i = 0; i < q.length; i++) r[i + r.length - q.length] ^= q[i];
  return r;
}
function gfPolyMul(p, q) {
  const r = new Array(p.length + q.length - 1).fill(0);
  for (let j = 0; j < q.length; j++)
    for (let i = 0; i < p.length; i++)
      r[i + j] ^= gfMul(p[i], q[j]);
  return r;
}
function gfPolyEval(p, x) {
  let y = p[0];
  for (let i = 1; i < p.length; i++) y = gfMul(y, x) ^ p[i];
  return y;
}

let _rsGenCache = {};
function rsGenerator(nsym) {
  if (_rsGenCache[nsym]) return _rsGenCache[nsym];
  let g = [1];
  for (let i = 0; i < nsym; i++) g = gfPolyMul(g, [1, GF_EXP[i]]);
  return (_rsGenCache[nsym] = g);
}

// Codifica un bloque (data.length ≤ 255-nsym) → data + nsym de paridad
function rsEncodeBlock(data, nsym) {
  const gen = rsGenerator(nsym);
  const res = new Uint8Array(data.length + nsym);
  res.set(data, 0);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], coef);
    }
  }
  const out = new Uint8Array(data.length + nsym);
  out.set(data, 0);
  out.set(res.slice(data.length), data.length);
  return out;
}

function rsCalcSyndromes(msg, nsym) {
  const synd = new Array(nsym + 1).fill(0); // synd[0]=0 pad (convención)
  for (let i = 0; i < nsym; i++) synd[i + 1] = gfPolyEval(Array.from(msg), GF_EXP[i]);
  return synd;
}
function rsFindErrorLocator(synd, nsym) {
  let errLoc = [1], oldLoc = [1];
  const syndShift = synd.length - nsym; // = 1 por el pad
  for (let i = 0; i < nsym; i++) {
    const K = i + syndShift;
    let delta = synd[K];
    for (let j = 1; j < errLoc.length; j++)
      delta ^= gfMul(errLoc[errLoc.length - 1 - j], synd[K - j]);
    oldLoc = [...oldLoc, 0];
    if (delta !== 0) {
      if (oldLoc.length > errLoc.length) {
        const newLoc = gfPolyScale(oldLoc, delta);
        oldLoc = gfPolyScale(errLoc, gfInv(delta));
        errLoc = newLoc;
      }
      errLoc = gfPolyAdd(errLoc, gfPolyScale(oldLoc, delta));
    }
  }
  while (errLoc.length && errLoc[0] === 0) errLoc.shift();
  const errs = errLoc.length - 1;
  if (errs * 2 > nsym) return null;
  return errLoc;
}
function rsFindErrors(errLocRev, nmess) {
  const errs = errLocRev.length - 1;
  const pos = [];
  for (let i = 0; i < nmess; i++) {
    if (gfPolyEval(errLocRev, gfPow(2, i)) === 0) pos.push(nmess - 1 - i);
  }
  return pos.length === errs ? pos : null;
}
function rsFindErrataLocator(coefPos) {
  let eLoc = [1];
  for (const i of coefPos) eLoc = gfPolyMul(eLoc, gfPolyAdd([1], [gfPow(2, i), 0]));
  return eLoc;
}
function rsFindErrorEvaluator(syndRev, errLoc, nsym) {
  // remainder de (syndRev · errLoc) / x^(nsym+1): los últimos nsym+1 coeficientes
  const prod = gfPolyMul(syndRev, errLoc);
  return prod.slice(Math.max(0, prod.length - (nsym + 1)));
}
function rsCorrectErrata(msgIn, synd, errPos) {
  const msg = Array.from(msgIn);
  const coefPos = errPos.map(p => msg.length - 1 - p);
  const errLoc = rsFindErrataLocator(coefPos);
  const syndRev = [...synd].reverse();
  const errEval = rsFindErrorEvaluator(syndRev, errLoc, errLoc.length - 1);
  const X = coefPos.map(cp => gfPow(2, cp));
  const E = new Array(msg.length).fill(0);
  for (let i = 0; i < X.length; i++) {
    const Xi = X[i], XiInv = gfInv(Xi);
    let locPrime = 1;
    for (let j = 0; j < X.length; j++)
      if (j !== i) locPrime = gfMul(locPrime, 1 ^ gfMul(XiInv, X[j]));
    if (locPrime === 0) return null;
    const y = gfMul(Xi, gfPolyEval(errEval, XiInv));
    E[errPos[i]] = gfDiv(y, locPrime);
  }
  for (let i = 0; i < msg.length; i++) msg[i] ^= E[i];
  return Uint8Array.from(msg);
}
// Decodifica un bloque; devuelve la parte de datos o null si es irrecuperable
function rsDecodeBlock(block, nsym) {
  const synd = rsCalcSyndromes(block, nsym);
  if (Math.max(...synd) === 0) return block.slice(0, block.length - nsym);
  const errLoc = rsFindErrorLocator(synd.slice(1), nsym);
  if (!errLoc) return null;
  const errPos = rsFindErrors([...errLoc].reverse(), block.length);
  if (!errPos) return null;
  const fixed = rsCorrectErrata(block, synd, errPos);
  if (!fixed) return null;
  const check = rsCalcSyndromes(fixed, nsym);
  if (Math.max(...check) !== 0) return null;
  return fixed.slice(0, fixed.length - nsym);
}

function rsEncodeBlocks(data, nsym) {
  const chunks = [];
  for (let i = 0; i < data.length; i += RS_DATA)
    chunks.push(rsEncodeBlock(data.slice(i, i + RS_DATA), nsym));
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
function rsDecodeBlocks(bytes, dataLen, nsym) {
  const out = new Uint8Array(dataLen);
  let inOfs = 0, outOfs = 0;
  while (outOfs < dataLen) {
    const dlen = Math.min(RS_DATA, dataLen - outOfs);
    const block = bytes.slice(inOfs, inOfs + dlen + nsym);
    if (block.length < dlen + nsym) return null;
    const data = rsDecodeBlock(block, nsym);
    if (!data) return null;
    out.set(data, outOfs);
    outOfs += dlen; inOfs += dlen + nsym;
  }
  return out;
}
const rsTotalLen = (dataLen, nsym) => dataLen + Math.ceil(dataLen / RS_DATA) * nsym;

// ============================================================
// T-SHIRT GEOMETRY — path para dibujar + polígono para la máscara
// ============================================================
function tshirtGeom(cx, cy, scale, fd) {
  const w = 240*scale, h = 320*scale;
  let nT='round', nD=22*scale, nH=38*scale, sE=36*scale, sL=70*scale, sDip=22*scale, hF=18*scale;
  if (fd==='unica'){ nT='v'; nD=56*scale; nH=34*scale; sE=28*scale; sL=48*scale; hF=8*scale; }
  else if (fd==='rapida'){ nT='square'; nD=32*scale; nH=48*scale; sE=48*scale; sL=52*scale; sDip=18*scale; hF=32*scale; }
  else if (fd==='recurrente'){ nT='round'; nD=28*scale; nH=42*scale; sE=36*scale; sL=72*scale; hF=12*scale; }
  const shL=cx-w/2, shR=cx+w/2, hemL=shL-hF, hemR=shR+hF, hemY=cy+h, armpitY=cy+sL+8;
  // polígono (cuello redondo aproximado con 16 segmentos) — para point-in-polygon
  const poly = [];
  if (nT==='round') { for (let k=0;k<=16;k++){ const t=Math.PI-(k/16)*Math.PI; poly.push([cx+nH*Math.cos(t), cy+nD*Math.sin(t)]); } }
  else if (nT==='v') poly.push([cx-nH,cy],[cx,cy+nD],[cx+nH,cy]);
  else poly.push([cx-nH,cy],[cx-nH,cy+nD],[cx+nH,cy+nD],[cx+nH,cy]);
  poly.push([shR,cy+6*scale],[shR+sE,cy+sL],[shR+sE-6*scale,cy+sL+sDip],[shR-4*scale,armpitY],
            [hemR,hemY],[hemL,hemY],[shL+4*scale,armpitY],[shL-sE+6*scale,cy+sL+sDip],[shL-sE,cy+sL],[shL,cy+6*scale]);
  // regla 2: bbox del POLÍGONO (incluye mangas), no del ruedo
  const xs = poly.map(p=>p[0]), ys = poly.map(p=>p[1]);
  const polyBBox = { left:Math.min(...xs), right:Math.max(...xs), top:Math.min(...ys), bottom:Math.max(...ys) };
  let neck;
  if (nT==='round') neck=`M ${cx-nH} ${cy} A ${nH} ${nD} 0 0 0 ${cx+nH} ${cy}`;
  else if (nT==='v') neck=`M ${cx-nH} ${cy} L ${cx} ${cy+nD} L ${cx+nH} ${cy}`;
  else neck=`M ${cx-nH} ${cy} L ${cx-nH} ${cy+nD} L ${cx+nH} ${cy+nD} L ${cx+nH} ${cy}`;
  const path=`${neck} L ${shR} ${cy+6*scale} L ${shR+sE} ${cy+sL} L ${shR+sE-6*scale} ${cy+sL+sDip} L ${shR-4*scale} ${armpitY} L ${hemR} ${hemY} L ${hemL} ${hemY} L ${shL+4*scale} ${armpitY} L ${shL-sE+6*scale} ${cy+sL+sDip} L ${shL-sE} ${cy+sL} L ${shL} ${cy+6*scale} Z`;
  return { path, poly, polyBBox, bbox:{ left:hemL, right:hemR, top:cy, bottom:hemY, w:hemR-hemL, h } };
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function distToPoly(x, y, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[j], [x2, y2] = poly[i];
    const dx = x2 - x1, dy = y2 - y1, L2 = dx*dx + dy*dy;
    let t = L2 ? ((x - x1) * dx + (y - y1) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    d = Math.min(d, Math.hypot(x - (x1 + t*dx), y - (y1 + t*dy)));
  }
  return d;
}

// Posiciones fijas de las dos camisetas y sus paneles de estampado
const SHIRT_F = { cx: 265, cy: 360 }, SHIRT_B = { cx: 735, cy: 360 };
function panelFor(cx, cy, side) {
  return side === 'front'
    ? { x1: cx - 85, x2: cx + 85, y1: cy + 95,  y2: cy + 245 }
    : { x1: cx - 78, x2: cx + 78, y1: cy + 85,  y2: cy + 235 };
}
// regla 3: el panel excluye con buffer EDGE (las esquinas de muestreo a ±6 no deben tocarlo)
const inPanelBuffered = (x, y, p) => x > p.x1 - EDGE && x < p.x2 + EDGE && y > p.y1 - EDGE && y < p.y2 + EDGE;

// ============================================================
// MÁSCARAS
// ============================================================
// Legacy (0x04/0x05): la isDataRegion original, intacta — las camisetas ya
// emitidas se leen para siempre.
function isDataRegionLegacy(x, y) {
  if (x < 18 || x > 982 || y < 18 || y > 982) return false;
  if (y > 75 && y < 215) return false;
  if (y > 55 && y < 75 && x > 250 && x < 750) return false;
  if (y > 215 && y < 232) return false;
  if (y > 232 && y < 275 && x > 140 && x < 860) return false;
  if (y > 290 && y < 320 && ((x > 215 && x < 310) || (x > 690 && x < 780))) return false;
  if (y > 295 && y < 745) {
    if (x > 85 && x < 445) return false;
    if (x > 555 && x < 915) return false;
  }
  if (y > 905 && y < 970) return false;
  return true;
}

// v4: silueta + tela + panel. Devuelve 'off' | {inside:boolean}
function cellClassV4(x, y, formaDom, hasArco, geomF, geomB) {
  if (x < 18 || x > 982 || y < 18 || y > 982) return null;
  if (y > 75 && y < 215) return null;                                                    // título
  if (y > 55 && y < 75 && x > 250 && x < 750) return null;                               // acentos
  if (y > 215 && y < 232) return null;                                                    // banda verde
  if (hasArco && y > 232 && y < 275 && x > 140 && x < 860) return null;                  // sticker arco
  if (y > 290 && y < 320 && ((x > 215 && x < 310) || (x > 690 && x < 780))) return null; // labels
  if (y > 905 && y < 970) return null;                                                    // footer
  for (const [S, side, sh] of [[geomF, 'front', SHIRT_F], [geomB, 'back', SHIRT_B]]) {
    const bb = S.polyBBox;                       // regla 2
    if (x > bb.left - EDGE && x < bb.right + EDGE && y > bb.top - EDGE && y < bb.bottom + EDGE) {
      if (distToPoly(x, y, S.poly) < EDGE) return null;   // regla 1
      const inside = pointInPoly(x, y, S.poly);
      if (inside) {
        if (inPanelBuffered(x, y, panelFor(sh.cx, sh.cy, side))) return null; // regla 3
        return { inside: true };                 // LA TELA ES EL DATO
      }
      return { inside: false };                  // esquinas del bbox fuera de silueta
    }
  }
  return { inside: false };
}

const _maskCache = {};
function buildMaskV4(formaDom, hasArco) {
  const key = `${formaDom}|${hasArco ? 1 : 0}`;
  if (_maskCache[key]) return _maskCache[key];
  const geomF = tshirtGeom(SHIRT_F.cx, SHIRT_F.cy, 0.95, formaDom);
  const geomB = tshirtGeom(SHIRT_B.cx, SHIRT_B.cy, 0.95, formaDom);
  const list = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * CELL + PAD, y = row * CELL + PAD;
      const ci = cellClassV4(x, y, formaDom, hasArco, geomF, geomB);
      if (ci) list.push({ col, row, x, y, inside: ci.inside });
    }
  }
  return (_maskCache[key] = { list, geomF, geomB, formaDom, hasArco });
}
function buildCellListLegacy() {
  const list = [];
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) {
      const x = col * CELL + PAD, y = row * CELL + PAD;
      if (isDataRegionLegacy(x, y)) list.push({ col, row, x, y });
    }
  return list;
}
const MASK_FORMAS = ['recurrente', 'rapida', 'unica'];

// ============================================================
// PAYLOAD SERIALIZATION HELPERS (sin cambios de mecánica)
// ============================================================
function writeStr(bytes, s) {
  const enc = new TextEncoder().encode(s || '');
  if (enc.length > 255) throw new Error(`String too long (max 255 bytes): ${s}`);
  bytes.push(enc.length);
  for (const b of enc) bytes.push(b);
}
function readStr(bytes, ofs) {
  const len = bytes[ofs];
  const s = new TextDecoder().decode(bytes.slice(ofs + 1, ofs + 1 + len));
  return [s, ofs + 1 + len];
}
function writeU32(bytes, n) { bytes.push(n & 0xff, (n>>>8) & 0xff, (n>>>16) & 0xff, (n>>>24) & 0xff); }
function readU32(bytes, ofs) { return [(bytes[ofs] | (bytes[ofs+1]<<8) | (bytes[ofs+2]<<16) | (bytes[ofs+3]<<24)) >>> 0, ofs+4]; }
const tsToU32 = iso => iso ? Math.floor(new Date(iso).getTime()/1000 - T_EPOCH) : 0;
const u32ToTs = u32 => u32 ? new Date((u32 + T_EPOCH) * 1000).toISOString().replace(/\.\d+Z$/, 'Z') : null;

// ============================================================
// MOLDE INNER v4 — vocabulario v3, tiers para degradación
// ============================================================
function encodeMoldeInnerV4(cam, warnings, trunc) {
  // trunc: { dropDescripciones:bool, esenciaMax:number|0 }
  const b = [];
  writeStr(b, cam.id || '');
  writeStr(b, cam.nombre);
  writeStr(b, cam.emoji || '');
  let esencia = cam.esencia || '';
  if (trunc.esenciaMax && esencia.length > trunc.esenciaMax) esencia = esencia.slice(0, trunc.esenciaMax - 1) + '…';
  writeStr(b, esencia);
  writeStr(b, cam.arco?.de || '');
  writeStr(b, cam.arco?.a || '');
  b.push(cam.origen === 'comprada' ? 1 : 0);
  writeStr(b, cam.creador_id || '');
  writeStr(b, cam.origen_camiseta_id || '');
  writeStr(b, (cam.dedicatoria || '').trim());
  b.push(cam.misiones.length);
  for (const m of cam.misiones) {
    writeStr(b, m.nombre);
    b.push(encodeForma(m.forma, warnings, `misión "${(m.nombre||'').slice(0,30)}"`));
    b.push(encodeTonos(m.tonos, warnings, `misión "${(m.nombre||'').slice(0,30)}"`));
    b.push(m.puntos_base || 1);
  }
  b.push(cam.milestones.length);
  for (const ms of cam.milestones) {
    writeStr(b, ms.nombre);
    writeStr(b, ms.regalo || '');
    writeStr(b, trunc.dropDescripciones ? '' : (ms.descripcion || ''));
  }
  return new Uint8Array(b);
}
function decodeMoldeInnerV4(bytes, warnings) {
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
  [s,i]=readStr(bytes,i); const dedicatoria=s;
  const arco=(arcoDe||arcoA)?{de:arcoDe,a:arcoA}:null;
  const nm=bytes[i++];
  const misiones=[];
  for (let k=0;k<nm;k++){
    [s,i]=readStr(bytes,i); const mn=s;
    const forma=decodeForma(bytes[i++],warnings,`misión "${mn.slice(0,30)}"`);
    const tonos=decodeTonos(bytes[i++]);
    const p=bytes[i++];
    misiones.push({nombre:mn,forma,tonos,puntos_base:p});
  }
  const nms=bytes[i++];
  const milestones=[];
  for (let k=0;k<nms;k++){
    [s,i]=readStr(bytes,i); const msn=s;
    [s,i]=readStr(bytes,i); const reg=s;
    [s,i]=readStr(bytes,i); const desc=s;
    milestones.push({nombre:msn,regalo:reg,descripcion:desc});
  }
  return {id,nombre,emoji,esencia,arco,origen,creador_id,origen_camiseta_id,dedicatoria,misiones,milestones};
}

// SNAPSHOT INNER v4 — igual al v5 pero con vocabulario v3
function encodeSnapshotInnerV4(cam, warnings) {
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
    b.push(encodeForma(m.forma, warnings, `misión "${(m.nombre||'').slice(0,30)}"`));
    b.push(encodeTonos(m.tonos, warnings, `misión "${(m.nombre||'').slice(0,30)}"`));
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
function decodeSnapshotInnerV4(bytes, warnings) {
  let i = 0, s, u;
  [s,i]=readStr(bytes,i); const id=s;
  [s,i]=readStr(bytes,i); const nombre=s;
  [s,i]=readStr(bytes,i); const emoji=s;
  [s,i]=readStr(bytes,i); const esencia=s;
  [s,i]=readStr(bytes,i); const arcoDe=s;
  [s,i]=readStr(bytes,i); const arcoA=s;
  const origen=bytes[i++]===1?'comprada':'propia';
  [s,i]=readStr(bytes,i); const creador_id=s;
  [u,i]=readU32(bytes,i); const created_at=u32ToTs(u);
  const arco=(arcoDe||arcoA)?{de:arcoDe,a:arcoA}:null;
  const nm=bytes[i++];
  const misiones=[];
  for (let k=0;k<nm;k++){
    [s,i]=readStr(bytes,i); const mid=s;
    [s,i]=readStr(bytes,i); const mn=s;
    const forma=decodeForma(bytes[i++],warnings,`misión "${mn.slice(0,30)}"`);
    const tonos=decodeTonos(bytes[i++]);
    const p=bytes[i++];
    const est=['activa','hecha','archivada'][bytes[i++]];
    let ca,cp;[ca,i]=readU32(bytes,i);[cp,i]=readU32(bytes,i);
    const nc=bytes[i++];
    const completions=[];
    for (let j=0;j<nc;j++){let cv;[cv,i]=readU32(bytes,i);completions.push(u32ToTs(cv));}
    misiones.push({id:mid,nombre:mn,forma,tonos,puntos_base:p,estado:est,created_at:u32ToTs(ca),completed_at:u32ToTs(cp),completions});
  }
  const nms=bytes[i++];
  const milestones=[];
  for (let k=0;k<nms;k++){
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
// LEGACY INNER DECODERS (0x04/0x05) — intactos, vocabulario viejo
// ============================================================
function decodeMoldeInnerLegacy(bytes) {
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
  const arco=(arcoDe||arcoA)?{de:arcoDe,a:arcoA}:null;
  const nm=bytes[i++];
  const misiones=[];
  for (let k=0;k<nm;k++){
    [s,i]=readStr(bytes,i); const mn=s;
    const forma=['rapida','recurrente','unica'][bytes[i++]];
    const tb=bytes[i++];
    const tonos=[];
    if(tb&1)tonos.push('fisica'); if(tb&2)tonos.push('emocional');
    if(tb&4)tonos.push('creativa'); if(tb&8)tonos.push('profunda');
    const p=bytes[i++];
    misiones.push({nombre:mn,forma,tonos,puntos_base:p});
  }
  const nms=bytes[i++];
  const milestones=[];
  for (let k=0;k<nms;k++){
    [s,i]=readStr(bytes,i); const msn=s;
    [s,i]=readStr(bytes,i); const reg=s;
    [s,i]=readStr(bytes,i); const desc=s;
    milestones.push({nombre:msn,regalo:reg,descripcion:desc});
  }
  return {id,nombre,emoji,esencia,arco,origen,creador_id,origen_camiseta_id,misiones,milestones};
}
function decodeSnapshotInnerLegacy(bytes) {
  let i=0,s,u;
  [s,i]=readStr(bytes,i); const id=s;
  [s,i]=readStr(bytes,i); const nombre=s;
  [s,i]=readStr(bytes,i); const emoji=s;
  [s,i]=readStr(bytes,i); const esencia=s;
  [s,i]=readStr(bytes,i); const arcoDe=s;
  [s,i]=readStr(bytes,i); const arcoA=s;
  const origen=bytes[i++]===1?'comprada':'propia';
  [s,i]=readStr(bytes,i); const creador_id=s;
  [u,i]=readU32(bytes,i); const created_at=u32ToTs(u);
  const arco=(arcoDe||arcoA)?{de:arcoDe,a:arcoA}:null;
  const nm=bytes[i++];
  const misiones=[];
  for (let k=0;k<nm;k++){
    [s,i]=readStr(bytes,i); const mid=s;
    [s,i]=readStr(bytes,i); const mn=s;
    const forma=['rapida','recurrente','unica'][bytes[i++]];
    const tb=bytes[i++];
    const tonos=[];
    if(tb&1)tonos.push('fisica'); if(tb&2)tonos.push('emocional');
    if(tb&4)tonos.push('creativa'); if(tb&8)tonos.push('profunda');
    const p=bytes[i++];
    const est=['activa','hecha','archivada'][bytes[i++]];
    let ca,cp;[ca,i]=readU32(bytes,i);[cp,i]=readU32(bytes,i);
    const nc=bytes[i++];
    const completions=[];
    for (let j=0;j<nc;j++){let cv;[cv,i]=readU32(bytes,i);completions.push(u32ToTs(cv));}
    misiones.push({id:mid,nombre:mn,forma,tonos,puntos_base:p,estado:est,created_at:u32ToTs(ca),completed_at:u32ToTs(cp),completions});
  }
  const nms=bytes[i++];
  const milestones=[];
  for (let k=0;k<nms;k++){
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
// COMPRESSION (nativa — browser + Node 22+)
// ============================================================
async function deflateRaw(bytes) {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(bytes); writer.close();
  const reader = cs.readable.getReader();
  const chunks = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; for (const b of value) chunks.push(b); }
  return new Uint8Array(chunks);
}
async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(bytes); writer.close();
  const reader = ds.readable.getReader();
  const chunks = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; for (const b of value) chunks.push(b); }
  return new Uint8Array(chunks);
}

// ============================================================
// FRAMING 0x08
// Layout: [header×3][bloques RS(deflate(inner))]
// header (8 B): [0x44 0x4D 0x08][flags][vocabVer][nsym][compLen u16-LE]
// flags: bit0 = snapshot, bit1 = truncado con gracia, bit2 = color (reservado)
// El header va triplicado y el decoder vota por mayoría byte a byte —
// protege los metadatos sin gastar un bloque RS en 8 bytes.
// ============================================================
async function encodeFrame08(inner, { snapshot = false, truncated = false } = {}) {
  const compressed = await deflateRaw(inner);
  if (compressed.length > 0xffff) throw new Error('Payload comprimido excede u16');
  const flags = (snapshot ? 1 : 0) | (truncated ? 2 : 0);
  const header = new Uint8Array([0x44, 0x4D, 0x08, flags, VOCAB_VERSION, NSYM, compressed.length & 0xff, (compressed.length >>> 8) & 0xff]);
  const body = rsEncodeBlocks(compressed, NSYM);
  const frame = new Uint8Array(HEADER_LEN * HEADER_COPIES + body.length);
  for (let c = 0; c < HEADER_COPIES; c++) frame.set(header, c * HEADER_LEN);
  frame.set(body, HEADER_LEN * HEADER_COPIES);
  return frame;
}
function majorityHeader(bytes) {
  const h = new Uint8Array(HEADER_LEN);
  for (let i = 0; i < HEADER_LEN; i++) {
    const a = bytes[i], b = bytes[i + HEADER_LEN], c = bytes[i + 2 * HEADER_LEN];
    h[i] = (a === b || a === c) ? a : b; // mayoría; si los tres difieren, b (empate imposible de resolver)
  }
  return h;
}
async function decodeFrame08(bytes) {
  const h = majorityHeader(bytes);
  if (h[0] !== 0x44 || h[1] !== 0x4D || h[2] !== 0x08) return null;
  const flags = h[3], vocabVer = h[4], nsym = h[5];
  const compLen = h[6] | (h[7] << 8);
  if (nsym < 2 || nsym > 64 || compLen === 0) return null;
  const bodyLen = rsTotalLen(compLen, nsym);
  const body = bytes.slice(HEADER_LEN * HEADER_COPIES, HEADER_LEN * HEADER_COPIES + bodyLen);
  if (body.length < bodyLen) return null;
  const compressed = rsDecodeBlocks(body, compLen, nsym);
  if (!compressed) return null;
  let inner;
  try { inner = await inflateRaw(compressed); } catch (_) { return null; }
  const warnings = [];
  if (vocabVer > VOCAB_VERSION) warnings.push(`La camiseta usa vocabulario v${vocabVer} (este app conoce hasta v${VOCAB_VERSION}) — puede haber campos que no se lean; considerá actualizar el app.`);
  const snapshot = !!(flags & 1), truncated = !!(flags & 2);
  if (truncated) warnings.push('Molde reducido: el original era demasiado grande y viajó recortado (sin descripciones largas). Pedí el original para el detalle completo.');
  const camiseta = snapshot ? decodeSnapshotInnerV4(inner, warnings) : decodeMoldeInnerV4(inner, warnings);
  camiseta._completitud = truncated ? 'reducido' : 'completo';
  return { mode: snapshot ? 'snapshot' : 'molde', camiseta, warnings };
}

// ============================================================
// TIERS — degradación con gracia para moldes que no caben
// ============================================================
async function packMoldeWithTiers(cam, capacityBytes, warnings) {
  const attempts = [
    { dropDescripciones: false, esenciaMax: 0 },
    { dropDescripciones: true,  esenciaMax: 0 },
    { dropDescripciones: true,  esenciaMax: 200 },
    { dropDescripciones: true,  esenciaMax: 140 },
    { dropDescripciones: true,  esenciaMax: 90 },
  ];
  for (let a = 0; a < attempts.length; a++) {
    const inner = encodeMoldeInnerV4(cam, a === 0 ? warnings : [], attempts[a]);
    const frame = await encodeFrame08(inner, { snapshot: false, truncated: a > 0 });
    if (frame.length <= capacityBytes) {
      if (a > 0) warnings.push(`El molde no cabía completo: viajó recortado (nivel ${a} de 4 — ${attempts[a].dropDescripciones ? 'sin descripciones de milestones' : ''}${attempts[a].esenciaMax ? `, esencia a ${attempts[a].esenciaMax} chars` : ''}).`);
      return frame;
    }
  }
  return null;
}

// ============================================================
// BYTES ↔ CELLS (2 bits por celda, LSB-first — sin cambios)
// ============================================================
function bytesToCells(bytes) {
  const cells = [];
  for (const b of bytes) cells.push(b & 3, (b >> 2) & 3, (b >> 4) & 3, (b >> 6) & 3);
  return cells;
}
function cellsToBytes(cells) {
  const bytes = [];
  for (let i = 0; i + 3 < cells.length; i += 4)
    bytes.push((cells[i]&3) | ((cells[i+1]&3)<<2) | ((cells[i+2]&3)<<4) | ((cells[i+3]&3)<<6));
  return new Uint8Array(bytes);
}

// ============================================================
// SEMILLA EXPRESIVA — deriva del frame (identidad visual = identidad de datos)
// ============================================================
function fnv1a(bytes) {
  let h = 0x811c9dc5;
  for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function seedFromFrame(frame) {
  let s = fnv1a(frame) || 1;
  return function () { // xorshift32
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
function frameHashHex(frame) {
  return (fnv1a(frame).toString(16).toUpperCase() + '00000000').slice(0, 8);
}

// ============================================================
// VISUAL HELPERS
// ============================================================
function countTonos(m){const c={fisica:0,emocional:0,creativa:0,profunda:0,estrategica:0};for(const x of m)for(const t of(x.tonos||[]))if(c[t]!==undefined)c[t]++;return c;}
function dominantTono(c){let mx=0,b=null;for(const t of ['fisica','emocional','creativa','profunda'])if(c[t]>mx){mx=c[t];b=t;}return b;}
function uniqueTonos(c){return TONO_ORDER.filter(t=>c[t]>0);}
function dominantForma(m){const c={recurrente:0,unica:0,rapida:0,facil:0,dificil:0};for(const x of m)if(c[x.forma]!==undefined)c[x.forma]++;
  // la geometría de camiseta tiene 3 variantes; facil→rapida, dificil→unica para la silueta
  const geomVotes={recurrente:c.recurrente,rapida:c.rapida+c.facil,unica:c.unica+c.dificil};
  let mx=0,b='recurrente';for(const f of ['recurrente','unica','rapida'])if(geomVotes[f]>mx){mx=geomVotes[f];b=f;}return b;}

function shapeForMission(m,x,y,size,rand){
  const fill=MOTIVO_COLORS[Math.floor(rand()*MOTIVO_COLORS.length)];
  const rot=Math.floor((rand()-0.5)*40);
  const forma=m.forma;
  if(forma==='rapida'||forma==='facil')return `<g transform="rotate(${rot} ${x} ${y})"><circle cx="${x}" cy="${y}" r="${size}" fill="${fill}" stroke="#0a0a0a" stroke-width="4"/></g>`;
  if(forma==='unica'||forma==='dificil'){const s=size*1.2,inner=s*0.32,pts=[];for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2-Math.PI/2,r=(i%2===0)?s:inner;pts.push(`${x+Math.cos(a)*r},${y+Math.sin(a)*r}`);}return `<g transform="rotate(${rot} ${x} ${y})"><polygon points="${pts.join(' ')}" fill="${fill}" stroke="#0a0a0a" stroke-width="4"/></g>`;}
  const s=size*1.6;return `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x-s/2}" y="${y-s/2}" width="${s}" height="${s}" fill="${fill}" stroke="#0a0a0a" stroke-width="4"/></g>`;
}
function placeShapesInPanel(misiones,panel,rand){
  if(misiones.length===0)return '';
  const cols=3,rows=Math.max(1,Math.ceil(Math.min(misiones.length,9)/3));
  const cw=(panel.x2-panel.x1)/cols,ch=(panel.y2-panel.y1)/rows;
  const sorted=[...misiones].sort((a,b)=>(b.puntos_base||1)-(a.puntos_base||1));
  let o='';
  for(let i=0;i<Math.min(sorted.length,9);i++){
    const m=sorted[i],col=i%cols,row=Math.floor(i/cols);
    const x=panel.x1+(col+0.5)*cw+(rand()-0.5)*cw*0.4;
    const y=panel.y1+(row+0.5)*ch+(rand()-0.5)*ch*0.4;
    o+=shapeForMission(m,x,y,12+Math.min(m.puntos_base||1,5)*5,rand);
  }
  return o;
}
function starBig(cx,cy,size){
  const outer=size,inner=size*0.3,pts=[];
  for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2-Math.PI/2,r=(i%2===0)?outer:inner;pts.push(`${cx+Math.cos(a)*r},${cy+Math.sin(a)*r}`);}
  return `<g><polygon points="${pts.join(' ')}" fill="#F3144D" stroke="#0a0a0a" stroke-width="4"/><circle cx="${cx}" cy="${cy}" r="${inner*0.7}" fill="#F4FF01" stroke="#0a0a0a" stroke-width="2"/></g>`;
}
function placeMilestonesInPanel(milestones,panel,rand){
  let o='';
  const N=milestones.length;
  for(let i=0;i<N;i++){
    const t=N===1?0.5:i/(N-1);
    o+=starBig(panel.x1+(panel.x2-panel.x1)*(0.3+(i%2)*0.4), panel.y1+(panel.y2-panel.y1)*(0.2+t*0.6), 28);
  }
  return o;
}

// ============================================================
// SVG GENERATION v4 — la tela tejida
// ============================================================
function generateSVGv4(cam, frame, mask) {
  const rand = seedFromFrame(frame);
  const counts = countTonos(cam.misiones || []);
  const tonoDom = dominantTono(counts);
  const bodyPastel = tonoDom ? TONO_PASTEL[tonoDom] : DEFAULT_BODY_PASTEL;
  const tonos = uniqueTonos(counts);
  const { list: cellList, geomF, geomB, hasArco } = mask;
  const panelF = panelFor(SHIRT_F.cx, SHIRT_F.cy, 'front');
  const panelB = panelFor(SHIRT_B.cx, SHIRT_B.cy, 'back');

  // celdas: frame + relleno sembrado (el peso de la camiseta se ve)
  const payloadCells = bytesToCells(frame);
  const cells = new Array(cellList.length);
  for (let i = 0; i < cellList.length; i++) {
    if (i < payloadCells.length) cells[i] = payloadCells[i];
    else { const r = rand(); cells[i] = r < 0.45 ? 0 : r < 0.75 ? 1 : r < 0.93 ? 2 : 3; }
  }

  // halftone en dos pasadas: fuera (bajo la camiseta) y dentro (sobre la tela)
  let hOut = '', hIn = '';
  for (let i = 0; i < cellList.length; i++) {
    const c = cellList[i], r = RADII[cells[i]];
    if (r <= 0) continue;
    const dot = `<circle cx="${c.x}" cy="${c.y}" r="${r}" fill="#0a0a0a"/>`;
    if (c.inside) hIn += dot; else hOut += dot;
  }
  // puntitos decorativos en zonas excluidas (continuidad de textura)
  let decorative = '';
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
    const x = col*CELL+PAD, y = row*CELL+PAD;
    const ci = cellClassV4(x, y, mask.formaDom, hasArco, geomF, geomB);
    if (!ci && !(y>75&&y<215) && !(y>905&&y<970) && !(y>215&&y<232))
      decorative += `<circle cx="${x}" cy="${y}" r="1.4" fill="#0a0a0a" opacity="0.22"/>`;
  }

  let bandsSvg = '';
  for (const b of BANDS_V4) bandsSvg += `<rect x="0" y="${b.y}" width="1000" height="${b.h}" fill="${b.c}" opacity="0.85"/>`;
  const greenBand = `<polygon points="0,195 1000,185 1000,221 0,231" fill="#41FF19" opacity="0.8"/>`;

  const N = cam.nombre.toUpperCase();
  const ts = N.length<=8?110:N.length<=12?88:N.length<=16?70:58;
  const title = `<g font-family="Anton, Impact, sans-serif" font-size="${ts}" text-anchor="middle" letter-spacing="2" font-weight="900">
    <text x="494" y="165" fill="#00d4ff">${N}</text>
    <text x="506" y="165" fill="#ff1493">${N}</text>
    <text x="500" y="165" fill="#0a0a0a">${N}</text>
  </g>`;

  let arco = '';
  if (hasArco) {
    const at = `// ${cam.arco.de.toUpperCase()} → ${cam.arco.a.toUpperCase()}`;
    const aw = Math.min(700, 140 + at.length*9), ax = (1000-aw)/2;
    arco = `<g transform="rotate(-2.5 500 246)"><rect x="${ax}" y="230" width="${aw}" height="32" fill="#ffd60a" stroke="#0a0a0a" stroke-width="2"/><text x="500" y="252" font-family="Space Mono, monospace" font-size="14" font-weight="700" text-anchor="middle" fill="#0a0a0a" letter-spacing="1.5">${at}</text></g>`;
  }

  const labels = `<g>
    <rect x="235" y="295" width="56" height="20" fill="#f0e5d0" stroke="#0a0a0a" stroke-width="1.5"/>
    <text x="263" y="309" font-family="Space Mono, monospace" font-size="11" font-weight="700" text-anchor="middle" fill="#0a0a0a">FRONT</text>
    <rect x="705" y="295" width="56" height="20" fill="#f0e5d0" stroke="#0a0a0a" stroke-width="1.5"/>
    <text x="733" y="309" font-family="Space Mono, monospace" font-size="11" font-weight="700" text-anchor="middle" fill="#0a0a0a">BACK</text>
  </g>`;

  // contorno: RGB-split CONTENIDO (regla 1: offset ±2, width 5) + cuerpo pastel
  const shirt = S => `<g>
    <path d="${S.path}" fill="none" stroke="#00F0FF" stroke-width="5" stroke-linejoin="round" transform="translate(-2,0)" opacity="0.9"/>
    <path d="${S.path}" fill="none" stroke="#FF1493" stroke-width="5" stroke-linejoin="round" transform="translate(2,1)" opacity="0.9"/>
    <path d="${S.path}" fill="${bodyPastel}" fill-opacity="${BODY_FILL_OPACITY}" stroke="#0a0a0a" stroke-width="5" stroke-linejoin="round"/>
  </g>`;

  const origen = cam.origen==='comprada'?'@DUMPA':'@PROPIA';
  const hash = '#' + frameHashHex(frame);  // checksum visible y verificable por re-render
  const ow = 14+origen.length*11, hw = 14+hash.length*10;
  let footer = `<g transform="rotate(-3 ${100+ow/2} 934)"><rect x="100" y="920" width="${ow}" height="28" fill="#00d4ff" stroke="#0a0a0a" stroke-width="2"/><text x="${100+ow/2}" y="939" font-family="Space Mono, monospace" font-size="13" font-weight="700" text-anchor="middle" fill="#0a0a0a" letter-spacing="1">${origen}</text></g>
  <g transform="rotate(2 ${420+hw/2} 934)"><rect x="420" y="920" width="${hw}" height="28" fill="#ff1493" stroke="#0a0a0a" stroke-width="2"/><text x="${420+hw/2}" y="939" font-family="Space Mono, monospace" font-size="13" font-weight="700" text-anchor="middle" fill="#0a0a0a" letter-spacing="1">${hash}</text></g>
  <text x="720" y="924" font-family="Space Mono, monospace" font-size="11" fill="#0a0a0a" letter-spacing="3">T O N O S</text>`;
  tonos.forEach((t,i)=>{
    const sx=720+i*32, sy=932, rot=(i%2===0?-6:6);
    const col = TONO_COLORS[t] || '#0a0a0a';
    footer += `<g transform="rotate(${rot} ${sx+12} ${sy+12})"><rect x="${sx}" y="${sy}" width="24" height="24" fill="${col}" stroke="#0a0a0a" stroke-width="2.5"/></g>`;
  });

  return `<svg viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">
    <rect width="1000" height="1000" fill="#f0e5d0"/>
    ${bandsSvg}
    ${greenBand}
    ${hOut}
    ${decorative}
    ${shirt(geomF)}${shirt(geomB)}
    ${hIn}
    ${placeShapesInPanel(cam.misiones||[], panelF, rand)}
    ${placeMilestonesInPanel(cam.milestones||[], panelB, rand)}
    <rect x="6" y="6" width="988" height="988" fill="none" stroke="#0a0a0a" stroke-width="3"/>
    ${title}${arco}${labels}
    ${footer}
  </svg>`;
}

// ============================================================
// SVG → PNG BLOB (browser-only)
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
// CELL SAMPLING — clasificación pura (compartida browser/Node)
// getPixel(x,y) → [r,g,b]
// ============================================================
function classifyCells(getPixel, cellList) {
  const out = [];
  for (const c of cellList) {
    let centerDark = 0;
    for (let dy=-3; dy<=3; dy++) for (let dx=-3; dx<=3; dx++) {
      const [r,g,b] = getPixel(c.x+dx, c.y+dy);
      centerDark += 255 - (r+g+b)/3;
    }
    centerDark /= 49;
    let cornerDark = 0;
    for (const [ox,oy] of [[-6,-6],[6,-6],[-6,6],[6,6]])
      for (let j=0;j<2;j++) for (let k=0;k<2;k++) {
        const [r,g,b] = getPixel(c.x+ox-1+k, c.y+oy-1+j);
        cornerDark += 255 - (r+g+b)/3;
      }
    cornerDark /= 16;
    const diff = centerDark - cornerDark;
    out.push(diff < T01 ? 0 : diff < T12 ? 1 : diff < T23 ? 2 : 3);
  }
  return out;
}

// ============================================================
// DECODE CORE — recibe getPixel, prueba máscaras (legacy → v4)
// ============================================================
async function decodeFromPixels(getPixel) {
  // 1) Legacy: máscara rectangular, formatos 0x04/0x05
  {
    const cellList = buildCellListLegacy();
    const bytes = cellsToBytes(classifyCells(getPixel, cellList));
    if (bytes[0] === 0x44 && bytes[1] === 0x4D) {
      const v = bytes[2];
      if (v === 0x04) return { mode:'molde', camiseta: decodeMoldeInnerLegacy(bytes.slice(3)), warnings: [] };
      if (v === 0x05) {
        const compLen = bytes[3] | (bytes[4] << 8);
        const decompressed = await inflateRaw(bytes.slice(5, 5 + compLen));
        return { mode:'snapshot', camiseta: decodeSnapshotInnerLegacy(decompressed), warnings: [] };
      }
      // magic legacy pero versión desconocida en máscara legacy → puede ser v4; seguimos probando
    }
  }
  // 2) v4: 6 variantes (3 formas × arco). RS valida cuál es la correcta.
  for (const formaDom of MASK_FORMAS) {
    for (const hasArco of [false, true]) {
      const mask = buildMaskV4(formaDom, hasArco);
      const bytes = cellsToBytes(classifyCells(getPixel, mask.list));
      const result = await decodeFrame08(bytes);
      if (result) return result;
    }
  }
  throw new Error('No es una camiseta — no se encontró un payload válido en la imagen. Si la camiseta es más nueva que este app, quizá necesites actualizar.');
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Codifica una camiseta a PNG. Devuelve blob + warnings + stats.
 * @param {Object} camiseta
 * @param {Object} [opts] - { mode: 'molde'|'snapshot' }
 * @returns {Promise<{blob: Blob, warnings: string[], stats: Object}>}
 */
export async function encodeCamiseta(camiseta, opts = {}) {
  const mode = opts.mode || 'molde';
  const warnings = [];
  const formaDom = dominantForma(camiseta.misiones || []);
  const hasArco = !!(camiseta.arco?.de && camiseta.arco?.a);
  const mask = buildMaskV4(formaDom, hasArco);
  const capacityBytes = Math.floor(mask.list.length / 4);

  let frame;
  if (mode === 'snapshot') {
    const inner = encodeSnapshotInnerV4(camiseta, warnings);
    frame = await encodeFrame08(inner, { snapshot: true });
    if (frame.length > capacityBytes)
      throw new Error(`Snapshot demasiado grande: ${frame.length}B > capacidad ${capacityBytes}B.`);
  } else {
    frame = await packMoldeWithTiers(camiseta, capacityBytes, warnings);
    if (!frame)
      throw new Error(`Molde demasiado grande incluso recortado (capacidad ${capacityBytes}B). Usá el fallback JSON.`);
  }

  const svg = generateSVGv4(camiseta, frame, mask);
  const blob = await svgToPngBlob(svg);
  return { blob, warnings, stats: { frameBytes: frame.length, capacityBytes, cells: mask.list.length, mask: `${formaDom}/${hasArco?'arco':'sin-arco'}` } };
}

/**
 * COMPAT: firma original — solo el Blob. Preferí encodeCamiseta (devuelve warnings).
 */
export async function encodeCamisetaToPng(camiseta, opts = {}) {
  const { blob } = await encodeCamiseta(camiseta, opts);
  return blob;
}

/**
 * Decodifica una camiseta desde una imagen. Auto-detecta 0x04/0x05/0x08
 * y la máscara correcta (Reed-Solomon valida).
 * @returns {Promise<{mode:'molde'|'snapshot', camiseta:Object, warnings:string[]}>}
 */
export async function decodeImageToCamiseta(source) {
  let bitmap;
  if (source instanceof ImageBitmap) bitmap = source;
  else bitmap = await createImageBitmap(source);

  const canvas = document.createElement('canvas');
  canvas.width = 1000; canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  const minDim = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - minDim) / 2, sy = (bitmap.height - minDim) / 2;
  ctx.drawImage(bitmap, sx, sy, minDim, minDim, 0, 0, 1000, 1000);
  const data = ctx.getImageData(0, 0, 1000, 1000).data;
  const getPixel = (x, y) => {
    const i = (y * 1000 + x) * 4;
    return [data[i], data[i+1], data[i+2]];
  };
  return await decodeFromPixels(getPixel);
}

/**
 * SVG string de la camiseta v4 (para preview en el app).
 * BREAKING: ahora es async (el framing comprime con CompressionStream).
 */
export async function generateCamisetaSVG(camiseta, opts = {}) {
  const mode = opts.mode || 'molde';
  const warnings = [];
  const formaDom = dominantForma(camiseta.misiones || []);
  const hasArco = !!(camiseta.arco?.de && camiseta.arco?.a);
  const mask = buildMaskV4(formaDom, hasArco);
  const capacityBytes = Math.floor(mask.list.length / 4);
  let frame;
  if (mode === 'snapshot') {
    frame = await encodeFrame08(encodeSnapshotInnerV4(camiseta, warnings), { snapshot: true });
  } else {
    frame = await packMoldeWithTiers(camiseta, capacityBytes, warnings);
  }
  if (!frame || frame.length > capacityBytes) throw new Error('Payload demasiado grande para el SVG.');
  return generateSVGv4(camiseta, frame, mask);
}

// ============================================================
// JSON MOLDE (texto) — fallback, vocabulario v3 aplicado también aquí
// ============================================================
const MOLDE_JSON_VERSION = 2;
const FORMAS_VALIDAS = ['rapida','recurrente','unica','facil','dificil'];
const TONOS_VALIDOS  = ['fisica','emocional','creativa','profunda','estrategica'];

export function encodeCamisetaToJSON(cam) {
  const molde = {
    _t: 'camiseta-molde',
    _v: MOLDE_JSON_VERSION,
    id: cam.id || '',
    nombre: cam.nombre || '',
    emoji: cam.emoji || '',
    esencia: cam.esencia || '',
    arco: (cam.arco?.de || cam.arco?.a) ? { de: cam.arco.de || '', a: cam.arco.a || '' } : null,
    origen: cam.origen === 'comprada' ? 'comprada' : 'propia',
    creador_id: cam.creador_id || '',
    origen_camiseta_id: cam.origen_camiseta_id || '',
    dedicatoria: (cam.dedicatoria || '').trim() || '',
    misiones: (cam.misiones || []).map(m => ({
      nombre: m.nombre || '',
      forma: m.forma || 'recurrente',
      tonos: m.tonos || [],
      puntos_base: m.puntos_base || 1,
    })),
    milestones: (cam.milestones || []).map(ms => ({
      nombre: ms.nombre || '',
      regalo: ms.regalo || '',
      descripcion: ms.descripcion || '',
    })),
  };
  return JSON.stringify(molde, null, 2);
}

export function decodeJSONToCamiseta(text) {
  let raw;
  const input = typeof text === 'string' ? text.trim() : text;
  try { raw = JSON.parse(input); }
  catch (_) {
    if (typeof input === 'string') {
      const a = input.indexOf('{'), b = input.lastIndexOf('}');
      if (a !== -1 && b > a) { try { raw = JSON.parse(input.slice(a, b + 1)); } catch (_) {} }
    }
    if (raw === undefined) throw new Error('El texto no es un molde válido (no es JSON).');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('El texto no es un molde de camiseta.');
  if (raw._t && raw._t !== 'camiseta-molde') throw new Error('Este JSON no es una camiseta para compartir.');
  if (!raw.nombre || typeof raw.nombre !== 'string') throw new Error('Molde inválido: falta el nombre de la camiseta.');
  const warnings = [];
  const arco = (raw.arco && (raw.arco.de || raw.arco.a)) ? { de: raw.arco.de || '', a: raw.arco.a || '' } : null;
  const camiseta = {
    id: raw.id || '',
    nombre: raw.nombre,
    emoji: raw.emoji || '',
    esencia: raw.esencia || '',
    arco,
    origen: raw.origen === 'comprada' ? 'comprada' : 'propia',
    creador_id: raw.creador_id || '',
    origen_camiseta_id: raw.origen_camiseta_id || '',
    dedicatoria: (raw.dedicatoria || '').trim() || '',
    misiones: Array.isArray(raw.misiones) ? raw.misiones.map(m => {
      if (m.forma && !FORMAS_VALIDAS.includes(m.forma)) warnings.push(`forma desconocida "${m.forma}" — se leyó como "recurrente"`);
      const tonos = Array.isArray(m.tonos) ? m.tonos.filter(t => {
        const ok = TONOS_VALIDOS.includes(t);
        if (!ok) warnings.push(`tono desconocido "${t}" — descartado`);
        return ok;
      }) : [];
      return {
        nombre: m.nombre || '',
        forma: FORMAS_VALIDAS.includes(m.forma) ? m.forma : 'recurrente',
        tonos,
        puntos_base: Number.isFinite(m.puntos_base) ? m.puntos_base : 1,
      };
    }) : [],
    milestones: Array.isArray(raw.milestones) ? raw.milestones.map(ms => ({
      nombre: ms.nombre || '',
      regalo: ms.regalo || '',
      descripcion: ms.descripcion || '',
    })) : [],
  };
  return { mode: 'molde', camiseta, warnings };
}

// ============================================================
// INTERNALS (testing en Node sin DOM)
// ============================================================
export const __internals = {
  // framing y payload
  encodeFrame08, decodeFrame08, packMoldeWithTiers,
  encodeMoldeInnerV4, decodeMoldeInnerV4,
  encodeSnapshotInnerV4, decodeSnapshotInnerV4,
  decodeMoldeInnerLegacy, decodeSnapshotInnerLegacy,
  // RS
  rsEncodeBlock, rsDecodeBlock, rsEncodeBlocks, rsDecodeBlocks,
  // máscaras y grilla
  buildMaskV4, buildCellListLegacy, cellClassV4, isDataRegionLegacy,
  bytesToCells, cellsToBytes, classifyCells, decodeFromPixels,
  // render
  generateSVGv4, tshirtGeom, dominantForma, seedFromFrame, frameHashHex,
  // constantes
  CELL, RADII, NSYM, EDGE, VOCAB_VERSION,
};

if (typeof globalThis !== 'undefined') {
  globalThis.DumpaCodec = {
    encodeCamiseta,
    encodeCamisetaToPng,
    decodeImageToCamiseta,
    generateCamisetaSVG,
    encodeCamisetaToJSON,
    decodeJSONToCamiseta,
  };
}
