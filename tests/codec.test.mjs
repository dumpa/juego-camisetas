// Round-trip del codec: camiseta → frame → celdas → frame → camiseta.
// Recorre el camino sin DOM (corre en Node 22+): todo menos el SVG y el PNG.
//
// Ojo al escribirlo: espeja a mano lo que hace encodeCamiseta() en
// src/codec/index.js — máscara según la forma dominante, capacidad derivada
// de la máscara, molde por tiers y snapshot directo. Si esa función cambia
// de camino, este archivo hay que moverlo con ella.

import { __internals } from '../src/codec/index.js';
const {
  packMoldeWithTiers, encodeSnapshotInnerV4, encodeFrame08, decodeFrame08,
  buildMaskV4, dominantForma, bytesToCells, cellsToBytes,
} = __internals;

// La capacidad no es una constante del formato: depende de la máscara, que
// depende de la forma dominante de las misiones y de si hay arco.
function capacidadDe(cam) {
  const mask = buildMaskV4(dominantForma(cam.misiones || []), !!(cam.arco?.de && cam.arco?.a));
  return { mask, capacityBytes: Math.floor(mask.list.length / 4) };
}

// Las celdas van de a 2 bits; el frame se rellena hasta el múltiplo de 4 y se
// recorta de vuelta, igual que al leer una imagen real.
function porLasCeldas(frame) {
  const cells = bytesToCells(frame);
  const pad = Array((4 - cells.length % 4) % 4).fill(0);
  const vuelta = cellsToBytes([...cells, ...pad]).slice(0, frame.length);
  return { vuelta, cells, intactas: vuelta.every((v, i) => v === frame[i]) };
}

// Fixture camisetas — variety of shapes
const fixtures = [
  {
    name: 'Curiosidad (mínima)',
    cam: {
      id: 'cam_001',
      nombre: 'Curiosidad',
      emoji: '🔍',
      esencia: 'Asombro permanente',
      arco: { de: 'Lector', a: 'Investigador' },
      origen: 'comprada',
      creador_id: 'usr_dumpa',
      origen_camiseta_id: '',
      misiones: [
        { id: 'm1', nombre: 'Leer 30 min', forma: 'recurrente', tonos: ['profunda'], puntos_base: 2,
          estado: 'activa', created_at: '2026-01-15T10:00:00Z', completed_at: null, completions: [] },
        { id: 'm2', nombre: 'Visitar museo', forma: 'unica', tonos: ['creativa', 'profunda'], puntos_base: 5,
          estado: 'activa', created_at: '2026-01-15T10:00:00Z', completed_at: null, completions: [] },
      ],
      milestones: [
        { id: 'ms1', nombre: '10 libros', regalo: 'Día libre', descripcion: 'Lectura sostenida', estado: 'pendiente' },
      ],
      created_at: '2026-01-15T10:00:00Z',
    }
  },
  {
    name: 'Capitán (mediana con estado)',
    cam: {
      id: 'cam_capitan',
      nombre: 'Capitán',
      emoji: '🧭',
      esencia: 'Navegar con intención',
      arco: { de: 'Day Skipper', a: 'Yachtmaster' },
      origen: 'propia',
      creador_id: 'usr_juan',
      origen_camiseta_id: '',
      created_at: '2026-04-01T08:00:00Z',
      misiones: [
        { id: 'm1', nombre: 'Logbook', forma: 'recurrente', tonos: ['profunda'], puntos_base: 1, estado: 'activa',
          created_at: '2026-04-01T08:00:00Z', completed_at: null,
          completions: ['2026-05-01T10:00:00Z','2026-05-15T11:00:00Z','2026-05-20T09:00:00Z'] },
        { id: 'm2', nombre: 'Curso radar', forma: 'unica', tonos: ['creativa'], puntos_base: 8, estado: 'hecha',
          created_at: '2026-04-01T08:00:00Z', completed_at: '2026-05-10T15:00:00Z', completions: [] },
        { id: 'm3', nombre: 'Pasaje nocturno', forma: 'rapida', tonos: ['fisica','emocional'], puntos_base: 3, estado: 'activa',
          created_at: '2026-04-01T08:00:00Z', completed_at: null, completions: [] },
      ],
      milestones: [
        { id: 'ms1', nombre: 'Mile builder Malta-Sicilia', regalo: 'Cena buena', descripcion: '300 NM', estado: 'pendiente' },
        { id: 'ms2', nombre: 'Coastal Skipper', regalo: 'Reloj', descripcion: 'Cert RYA', estado: 'pendiente' },
      ],
    }
  },
  {
    name: 'Vacía (edge: sin milestones)',
    cam: {
      id: 'cam_vacia',
      nombre: 'Atleta',
      emoji: '💪',
      esencia: 'Cuerpo en juego',
      arco: null,
      origen: 'propia',
      creador_id: '',
      origen_camiseta_id: '',
      misiones: [],
      milestones: [],
      created_at: '2026-05-01T00:00:00Z',
    }
  },
];

let pass = 0, fail = 0;

function deepEq(a, b, path='') {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) { console.log(`  type mismatch @${path}: ${typeof a} vs ${typeof b}`); return false; }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) { console.log(`  array len mismatch @${path}: ${a.length} vs ${b.length}`); return false; }
    return a.every((v, i) => deepEq(v, b[i], `${path}[${i}]`));
  }
  if (typeof a === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!deepEq(a[k], b[k], `${path}.${k}`)) return false;
    }
    return true;
  }
  console.log(`  value mismatch @${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  return false;
}

function moldeView(cam) {
  // Only the fields MOLDE carries — sin estado, sin timestamps, sin ids de misiones/milestones
  return {
    id: cam.id || '',
    nombre: cam.nombre,
    emoji: cam.emoji || '',
    esencia: cam.esencia || '',
    arco: (cam.arco?.de || cam.arco?.a) ? { de: cam.arco.de || '', a: cam.arco.a || '' } : null,
    origen: cam.origen || 'propia',
    creador_id: cam.creador_id || '',
    origen_camiseta_id: cam.origen_camiseta_id || '',
    dedicatoria: (cam.dedicatoria || '').trim(),
    misiones: cam.misiones.map(m => ({
      nombre: m.nombre,
      forma: m.forma,
      tonos: m.tonos || [],
      puntos_base: m.puntos_base || 1,
    })),
    milestones: cam.milestones.map(ms => ({
      nombre: ms.nombre,
      regalo: ms.regalo || '',
      descripcion: ms.descripcion || '',
    })),
  };
}

for (const { name, cam } of fixtures) {
  console.log(`── ${name} ──`);

  const { mask, capacityBytes } = capacidadDe(cam);
  const warnings = [];

  // MOLDE
  const moldeFrame = await packMoldeWithTiers(cam, capacityBytes, warnings);
  console.log(`  MOLDE: ${moldeFrame.length}B de ${capacityBytes}B`);
  const molde = porLasCeldas(moldeFrame);
  const { mode: moldeMode, camiseta: moldeDecoded } = await decodeFrame08(molde.vuelta);
  delete moldeDecoded._completitud;   // lo pone el decoder, no viaja en los bytes
  const moldeOk = moldeMode === 'molde' && deepEq(moldeView(cam), moldeDecoded);
  console.log(`  MOLDE round-trip: ${moldeOk ? '✅' : '❌'} (celdas ${molde.intactas ? 'OK' : 'BAD'}, cabe ${molde.cells.length}/${mask.list.length})`);
  if (moldeOk) pass++; else fail++;

  // SNAPSHOT — sin tiers: o cabe entero o no va
  const snapFrame = await encodeFrame08(encodeSnapshotInnerV4(cam, warnings), { snapshot: true });
  console.log(`  SNAPSHOT: ${snapFrame.length}B de ${capacityBytes}B (deflated)`);
  const snap = porLasCeldas(snapFrame);
  const { mode: snapMode, camiseta: snapDecoded } = await decodeFrame08(snap.vuelta);
  delete snapDecoded._completitud;
  // El snapshot vuelve idéntico salvo origen_camiseta_id, que solo lleva el molde.
  const expected = { ...cam };
  delete expected.origen_camiseta_id;
  const snapOk = snapMode === 'snapshot' && deepEq(expected, snapDecoded);
  console.log(`  SNAPSHOT round-trip: ${snapOk ? '✅' : '❌'} (celdas ${snap.intactas ? 'OK' : 'BAD'}, cabe ${snap.cells.length}/${mask.list.length})`);
  if (snapOk) pass++; else fail++;
  if (snapFrame.length > capacityBytes) { console.log('  ⚠️  el snapshot no cabría en la imagen'); }
  console.log('');
}

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
