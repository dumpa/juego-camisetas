// Round-trip test: encode → bytes → cells → bytes → decode → check equality.
// This exercises the non-DOM path of the codec (works in Node 22+).

import { __internals } from '../src/codec/index.js';
const { encodeMoldePayload, encodeSnapshotPayload, routeDecode, buildCellList, bytesToCells, cellsToBytes } = __internals;

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

const cellList = buildCellList();
console.log(`Cell capacity: ${cellList.length} cells = ${Math.floor(cellList.length/4)} bytes\n`);

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

  // MOLDE round-trip
  const moldeBytes = encodeMoldePayload(cam);
  console.log(`  MOLDE: ${moldeBytes.length}B`);
  // cells round-trip (covers the cells path even though it's identity in JS)
  const moldeCells = bytesToCells(moldeBytes);
  const moldeBytesRT = cellsToBytes([...moldeCells, ...Array((4 - moldeCells.length % 4) % 4).fill(0)]).slice(0, moldeBytes.length);
  const cellsMatch = moldeBytesRT.every((v, i) => v === moldeBytes[i]);
  const { mode: moldeMode, camiseta: moldeDecoded } = await routeDecode(moldeBytesRT);
  const moldeOk = moldeMode === 'molde' && deepEq(moldeView(cam), moldeDecoded);
  console.log(`  MOLDE round-trip: ${moldeOk ? '✅' : '❌'} (cells ${cellsMatch ? 'OK' : 'BAD'}, fits ${moldeCells.length}/${cellList.length} cells)`);
  if (moldeOk) pass++; else fail++;

  // SNAPSHOT round-trip
  const snapBytes = await encodeSnapshotPayload(cam);
  console.log(`  SNAPSHOT: ${snapBytes.length}B (deflated)`);
  const snapCells = bytesToCells(snapBytes);
  const snapBytesRT = cellsToBytes([...snapCells, ...Array((4 - snapCells.length % 4) % 4).fill(0)]).slice(0, snapBytes.length);
  const snapCellsMatch = snapBytesRT.every((v, i) => v === snapBytes[i]);
  const { mode: snapMode, camiseta: snapDecoded } = await routeDecode(snapBytesRT);
  // For SNAPSHOT we expect ~exact equality (minus origen_camiseta_id which snapshot doesn't include)
  const expected = { ...cam };
  delete expected.origen_camiseta_id; // snapshot doesn't carry this; molde does
  const snapOk = snapMode === 'snapshot' && deepEq(expected, snapDecoded);
  console.log(`  SNAPSHOT round-trip: ${snapOk ? '✅' : '❌'} (cells ${snapCellsMatch ? 'OK' : 'BAD'}, fits ${snapCells.length}/${cellList.length} cells)`);
  if (snapOk) pass++; else fail++;
  console.log('');
}

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
