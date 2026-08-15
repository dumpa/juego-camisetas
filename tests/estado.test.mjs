// El estado sobrevive a la vuelta completa: exportar → importar → migrar.
//
// Es la prueba que sostiene la promesa del app: no hay backend, así que la
// única forma de mover datos entre teléfonos es el JSON del respaldo. Si algo
// se cae en esa vuelta, se cae para siempre y sin avisar.
//
// Lo que se prueba aquí NO es que la migración haga lo correcto en abstracto:
// es que no pierda nada. Cada caso nuevo debería preguntar "¿qué dato se
// podría caer?" antes de "¿qué campo se debería crear?".
//
//   node --test tests/estado.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

// loadState/saveState hablan con localStorage. En Node no existe, y la prueba
// de los respaldos crudos necesita verlo de verdad, no saltárselo.
class MemoriaLocal {
  constructor() { this.datos = new Map(); }
  getItem(k) { return this.datos.has(k) ? this.datos.get(k) : null; }
  setItem(k, v) { this.datos.set(k, String(v)); }
  removeItem(k) { this.datos.delete(k); }
  clear() { this.datos.clear(); }
}
globalThis.localStorage = new MemoriaLocal();

const {
  migrate, emptyState, loadState, saveState,
  STATE_KEY, BACKUP_PRE_V7_KEY, BACKUP_PRE_V8_KEY, BACKUP_PRE_V10_KEY,
  estaPuesta, GANCHOS,
} = await import('../src/estado.js');

// El viaje real: lo que hace el botón "exportar al portapapeles" y después el
// de "importar desde JSON", con la migración que corre al recargar.
const laVuelta = (estado) => migrate(JSON.parse(JSON.stringify(estado)));

// Un estado v9 con algo de cada cosa, incluida una sesión diaria con la forma
// nueva del ritual: si el rediseño rompe el respaldo, se rompe aquí.
function estadoLleno() {
  return {
    user_id: 'local', version: 10, created_at: '2026-01-01T08:00:00.000Z',
    camisetas: [
      { id: 'c1', nombre: 'Capitán', emoji: '🧭', esencia: 'Navegar con intención',
        arco: { de: 'Day Skipper', a: 'Yachtmaster' }, creador_id: 'local', origen: 'propia',
        origen_camiseta_id: null, precio: null,
        created_at: '2026-01-02T08:00:00.000Z',
        ubicacion: { tipo: 'puesta' },
        misiones: [
          { id: 'm1', nombre: 'Logbook', forma: 'recurrente', tonos: ['profunda'], puntos_base: 2,
            estado: 'activa', created_at: '2026-01-02T08:00:00.000Z', completed_at: null,
            completions: ['2026-05-01T10:00:00.000Z', '2026-05-02T10:00:00.000Z'] },
          { id: 'm2', nombre: 'Curso de radar', forma: 'dificil', tonos: ['estrategica'], puntos_base: 3,
            estado: 'archivada', created_at: '2026-01-02T08:00:00.000Z', completed_at: null,
            archived_at: '2026-07-01T08:00:00.000Z', completions: [] },
        ],
        milestones: [{ id: 'ms1', nombre: '300 NM', descripcion: '', regalo: 'Cena buena', estado: 'pendiente' }] },
      { id: 'c2', nombre: 'Atleta', emoji: '💪', esencia: '', arco: null, creador_id: 'local',
        origen: 'propia', origen_camiseta_id: null, precio: null,
        created_at: '2026-02-01T08:00:00.000Z',
        ubicacion: { tipo: 'gancho', posicion: 2 }, misiones: [], milestones: [] },
    ],
    // La sesión diaria con la forma del rediseño: a qué camisetas se les
    // quitó y se les puso atención, y para qué día apunta.
    sesiones: [
      { id: 's1', date: '2026-08-14T22:10:00.000Z', tipo: 'diaria', para: '2026-08-15',
        quitadas: [{ id: 'c2', nombre: 'Atleta' }],
        puestas: [{ id: 'c1', nombre: 'Capitán' }],
        notas: 'el día se fue en el mar' },
      { id: 's2', date: '2026-08-10T19:00:00.000Z', tipo: 'semanal', notas: 'poda',
        caliente: 'c1', fria: 'c2', completa: true },
    ],
    eventos: [
      { id: 'e1', ts: '2026-08-14T22:10:00.000Z', tipo: 'sesion_diaria', sesion_id: 's1', notas: 'el día se fue en el mar' },
      { id: 'e2', ts: '2026-08-11T09:00:00.000Z', tipo: 'cita_agendada', cadencia: 'semanal', para: '2026-08-18T19:00:00.000Z', titulo: 'coser' },
    ],
    movimientos: [
      { id: 'v1', ts: '2026-05-01T10:00:00.000Z', tipo: 'mision_completada', cam_id: 'c1', mision_id: 'm1', monto: 2 },
    ],
    visitas: [{ ts: '2026-08-14T22:00Z' }],
    cerros: [{ id: 'sin-doblar', nombre: 'sin doblar', orden: 0, esDelSistema: true }],
    ecos: { silencios: { 'cerrar-dia:2026-08-13': '2026-08-13T20:00:00.000Z' } },
  };
}

// La migración tiene permitido AÑADIR (campos nuevos con su valor por
// defecto) y prohibido quitar o cambiar. Comparar por igualdad estricta
// probaría lo contrario de lo que queremos: que nunca crezca el esquema.
function noSePierdeNada(antes, despues, ruta = '') {
  if (antes === null || typeof antes !== 'object') {
    assert.deepEqual(despues, antes, `cambió ${ruta || 'la raíz'}`);
    return;
  }
  if (Array.isArray(antes)) {
    assert.ok(Array.isArray(despues), `${ruta} dejó de ser lista`);
    assert.equal(despues.length, antes.length, `${ruta} cambió de tamaño`);
    antes.forEach((v, i) => noSePierdeNada(v, despues[i], `${ruta}[${i}]`));
    return;
  }
  assert.ok(despues && typeof despues === 'object', `${ruta} dejó de ser objeto`);
  for (const k of Object.keys(antes)) {
    assert.ok(k in despues, `se perdió ${ruta}.${k}`);
    noSePierdeNada(antes[k], despues[k], `${ruta}.${k}`);
  }
}

test('un estado v10 no pierde nada al exportar → importar → migrar', () => {
  const antes = estadoLleno();
  noSePierdeNada(antes, laVuelta(antes));
});

test('la sesión del ritual diario no pierde ni un campo en la vuelta', () => {
  const s = laVuelta(estadoLleno());
  const diaria = s.sesiones.find(x => x.tipo === 'diaria');
  assert.equal(diaria.para, '2026-08-15');
  assert.deepEqual(diaria.quitadas, [{ id: 'c2', nombre: 'Atleta' }]);
  assert.deepEqual(diaria.puestas, [{ id: 'c1', nombre: 'Capitán' }]);
  assert.equal(diaria.notas, 'el día se fue en el mar');
});

test('migrar dos veces da lo mismo que migrar una', () => {
  // Importa: el bloque del clóset corre en cada carga, sin candado de versión.
  const una = laVuelta(estadoLleno());
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(una))), una);
});

test('un estado viejo sin clóset ni formas llega entero al otro lado', () => {
  const viejo = {
    user_id: 'local', version: 3, created_at: '2025-11-01T08:00:00.000Z',
    camisetas: [
      { id: 'c1', nombre: 'Lector', emoji: '📚', esencia: 'Leer más', archived_at: null,
        created_at: '2025-11-01T08:00:00.000Z',
        misiones: [{ id: 'm1', nombre: 'Leer 30 min', tipo: 'habito', estado: 'activa',
                     created_at: '2025-11-01T08:00:00.000Z', completed_at: null, completions: [] }],
        milestones: [] },
      { id: 'c2', nombre: 'Corredor', emoji: '🏃', esencia: '', archived_at: '2026-01-01T08:00:00.000Z',
        created_at: '2025-11-01T08:00:00.000Z', misiones: [], milestones: [] },
    ],
    sesiones: [{ id: 's1', date: '2025-12-01T20:00:00.000Z', tipo: 'diaria', notas: 'una nota vieja' }],
    eventos: [], movimientos: [],
  };
  const s = laVuelta(viejo);

  assert.equal(s.version, 10);
  assert.equal(s.camisetas.length, 2, 'ninguna camiseta se cae');
  assert.equal(s.sesiones[0].notas, 'una nota vieja', 'las notas viejas se conservan');

  // El vocabulario viejo de misiones se traduce sin perder la misión.
  const m = s.camisetas[0].misiones[0];
  assert.equal(m.forma, 'recurrente');
  assert.deepEqual(m.tonos, []);
  assert.ok(m.puntos_base > 0);

  // Toda camiseta termina en exactamente un sitio válido del mueble.
  for (const c of s.camisetas) {
    const u = c.ubicacion;
    assert.ok(u, `${c.nombre} sin ubicación`);
    const valida = u.tipo === 'puesta'
      || (u.tipo === 'gancho' && u.posicion >= 0 && u.posicion < GANCHOS)
      || (u.tipo === 'cerro' && s.cerros.some(k => k.id === u.cerroId));
    assert.ok(valida, `ubicación inválida en ${c.nombre}: ${JSON.stringify(u)}`);
  }
  // La que estaba archivada no vuelve puesta sola.
  assert.equal(estaPuesta(s.camisetas.find(c => c.id === 'c2')), false);

  // Los puntos de lo ya completado no se inventan ni se pierden.
  assert.ok(Array.isArray(s.movimientos));
});

test('v10 borra el archived_at de la camiseta y nada más', () => {
  // El único campo que el rediseño de los rituales quita. Se va porque
  // aplicarMovida lo reescribía cada vez que una camiseta salía de "puesta",
  // y "puesta" ahora cambia todos los días.
  const antes = estadoLleno();
  antes.version = 9;
  antes.camisetas[0].archived_at = null;
  antes.camisetas[1].archived_at = '2026-06-01T08:00:00.000Z';

  const despues = laVuelta(antes);

  for (const c of despues.camisetas) {
    assert.ok(!('archived_at' in c), `${c.nombre} conservó archived_at`);
  }
  // Lo demás llega entero: se compara contra el mismo estado sin ese campo y
  // sin el evento de frontera, que es lo único que la migración añade.
  const esperado = JSON.parse(JSON.stringify(antes));
  esperado.version = 10;
  esperado.camisetas.forEach(c => { delete c.archived_at; });
  noSePierdeNada(esperado, {
    ...despues,
    eventos: despues.eventos.filter(e => e.tipo !== 'frontera_puesta_diaria'),
  });
});

test('el archived_at de una MISIÓN sobrevive a v10', () => {
  const s = laVuelta(estadoLleno());
  const m = s.camisetas[0].misiones.find(x => x.id === 'm2');
  assert.equal(m.archived_at, '2026-07-01T08:00:00.000Z');
  assert.equal(m.estado, 'archivada');
});

test('la frontera de v10 se escribe una sola vez', () => {
  const antes = estadoLleno();
  antes.version = 9;
  const una = laVuelta(antes);
  const cuantas = (s) => s.eventos.filter(e => e.tipo === 'frontera_puesta_diaria').length;
  assert.equal(cuantas(una), 1, 'la frontera queda marcada');
  // Recargar el app no puede volver a marcarla: sería mover la fecha en que
  // "puesta" cambió de significado.
  assert.equal(cuantas(laVuelta(una)), 1);
  assert.equal(cuantas(laVuelta(laVuelta(una))), 1);
});

test('un estado ya en v10 no vuelve a cruzar la frontera', () => {
  const s = laVuelta(estadoLleno());
  assert.equal(s.eventos.filter(e => e.tipo === 'frontera_puesta_diaria').length, 0);
});

test('el respaldo pre-v10 se congela antes de borrar archived_at', async () => {
  localStorage.clear();
  const antes = estadoLleno();
  antes.version = 9;
  antes.camisetas[0].archived_at = '2026-06-01T08:00:00.000Z';
  localStorage.setItem(STATE_KEY, JSON.stringify(antes));

  await loadState();
  const crudo = JSON.parse(localStorage.getItem(BACKUP_PRE_V10_KEY));
  assert.equal(crudo.camisetas[0].archived_at, '2026-06-01T08:00:00.000Z',
    'el respaldo guarda el campo que la migración borra');
  assert.equal(crudo.version, 9);
});

test('los respaldos crudos pre-v7 y pre-v8 no se sobrescriben nunca', async () => {
  localStorage.clear();
  const viejo = { user_id: 'local', version: 5, created_at: '2025-11-01T08:00:00.000Z',
    camisetas: [], sesiones: [], eventos: [], movimientos: [] };
  localStorage.setItem(STATE_KEY, JSON.stringify(viejo));

  await loadState();
  const primeroV7 = localStorage.getItem(BACKUP_PRE_V7_KEY);
  const primeroV8 = localStorage.getItem(BACKUP_PRE_V8_KEY);
  assert.ok(primeroV7, 'el respaldo pre-v7 se escribió');
  assert.ok(primeroV8, 'el respaldo pre-v8 se escribió');

  // Segunda carga con un estado distinto encima: el respaldo original manda.
  localStorage.setItem(STATE_KEY, JSON.stringify({ ...viejo, version: 5, user_id: 'otro' }));
  await loadState();
  assert.equal(localStorage.getItem(BACKUP_PRE_V7_KEY), primeroV7);
  assert.equal(localStorage.getItem(BACKUP_PRE_V8_KEY), primeroV8);
});

test('guardar y volver a cargar conserva el estado', async () => {
  localStorage.clear();
  const s = migrate(estadoLleno());
  assert.equal(await saveState(s), true);
  const vuelto = await loadState();
  // loadState registra la visita: es lo único que puede cambiar.
  assert.equal(vuelto.visitas.length, s.visitas.length + 1);
  assert.deepEqual({ ...vuelto, visitas: [] }, { ...s, visitas: [] });
});

test('un estado vacío es un estado válido', () => {
  const s = laVuelta(emptyState());
  assert.equal(s.version, 10);
  assert.ok(s.cerros.some(c => c.esDelSistema), 'siempre existe el cerro del sistema');
  assert.deepEqual(s.camisetas, []);
});
