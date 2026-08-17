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
  estaPuesta, GANCHOS, VERSION, armarRespaldo, revisarRespaldo, reordenarEntre, colocarEn, PUESTA,
} = await import('../src/estado.js');

// El viaje real: lo que hace el botón "exportar al portapapeles" y después el
// de "importar desde JSON", con la migración que corre al recargar.
const laVuelta = (estado) => migrate(JSON.parse(JSON.stringify(estado)));

// Un estado v9 con algo de cada cosa, incluida una sesión diaria con la forma
// nueva del ritual: si el rediseño rompe el respaldo, se rompe aquí.
function estadoLleno() {
  return {
    user_id: 'local', version: VERSION, created_at: '2026-01-01T08:00:00.000Z',
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

test('un estado al día no pierde nada al exportar → importar → migrar', () => {
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

  assert.equal(s.version, VERSION);
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
  esperado.version = VERSION;
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
  assert.equal(s.version, VERSION);
  assert.ok(s.cerros.some(c => c.esDelSistema), 'siempre existe el cerro del sistema');
  assert.deepEqual(s.camisetas, []);
});

// ── El respaldo ──────────────────────────────────────────────────────────
//
// Sin backend, restaurar es el único gesto del app que borra todo de una. Lo
// que se prueba aquí es que solo pase cuando de verdad es un respaldo.

test('el respaldo sale completo y con nombre buscable', () => {
  const s = migrate(estadoLleno());
  const { json, nombre } = armarRespaldo(s, new Date('2026-08-16T10:00:00Z'));
  assert.equal(nombre, 'camisetas-2026-08-16.json');
  // Y vuelve a entrar: exportar → revisar → migrar sin perder nada.
  const r = revisarRespaldo(json);
  assert.equal(r.ok, true);
  noSePierdeNada(s, migrate(r.estado));
});

test('el respaldo no lleva la basura de la sesión', () => {
  // _saveError es una bandera de la pantalla, no un dato del juego. Si viaja,
  // el estado restaurado arranca creyendo que no pudo guardar.
  const s = { ...migrate(estadoLleno()), _saveError: true, _storageOk: false };
  const { json } = armarRespaldo(s);
  const vuelto = JSON.parse(json);
  assert.ok(!('_saveError' in vuelto));
  assert.ok(!('_storageOk' in vuelto));
});

test('lo que no es un respaldo no pasa', () => {
  const malos = [
    ['texto suelto', 'hola'],
    ['json que no es objeto', '[1,2,3]'],
    ['json vacío', 'null'],
    ['objeto sin camisetas', '{"sesiones":[]}'],
    ['camisetas que no es lista', '{"camisetas":"muchas"}'],
    ['archivo cortado', '{"camisetas":[{"id":"a"'],
  ];
  for (const [que, texto] of malos) {
    const r = revisarRespaldo(texto);
    assert.equal(r.ok, false, `pasó ${que}`);
    assert.ok(r.error.length > 10, `el error de ${que} no le dice nada a nadie`);
    assert.doesNotMatch(r.error, /JSON|parse|undefined|null/i, `el error de ${que} habla en técnico`);
  }
});

test('un respaldo de una versión más nueva se rechaza', () => {
  // migrate solo sabe subir de versión. Bajar sería inventar, y lo que
  // inventaría es el juego entero de alguien.
  const futuro = JSON.stringify({ camisetas: [], version: VERSION + 1 });
  const r = revisarRespaldo(futuro);
  assert.equal(r.ok, false);
  assert.match(r.error, /más nueva/);
  // Pero uno viejo sí entra: para eso están las migraciones.
  assert.equal(revisarRespaldo(JSON.stringify({ camisetas: [], version: 3 })).ok, true);
  assert.equal(revisarRespaldo(JSON.stringify({ camisetas: [] })).ok, true, 'sin versión = muy viejo, entra');
});

test('el resumen dice qué hay adentro antes de pisar nada', () => {
  const { json } = armarRespaldo(migrate(estadoLleno()));
  const { resumen } = revisarRespaldo(json);
  assert.equal(resumen.camisetas, 2);
  assert.equal(resumen.sesiones, 2);
  assert.equal(resumen.version, VERSION);
});

// ── Reordenar lo que se ve ───────────────────────────────────────────────

test('reordenar mueve dentro de la lista visible, no del array completo', () => {
  // El caso que fallaba: puestas intercaladas con cosas del clóset. Antes,
  // bajar a Capitán lo intercambiaba con Cocinero —invisible— y el clic no
  // hacía nada.
  const s = { camisetas: [
    { id: 'p1', nombre: 'Capitán' }, { id: 'g1', nombre: 'Cocinero' },
    { id: 'p2', nombre: 'Escritor' }, { id: 'k1', nombre: 'Lector' },
    { id: 'p3', nombre: 'Atleta' },
  ] };
  const visibles = ['p1', 'p2', 'p3'];

  assert.equal(reordenarEntre(s, 'p1', +1, visibles), true);
  assert.deepEqual(s.camisetas.map(c => c.id), ['p2', 'g1', 'p1', 'k1', 'p3'],
    'se intercambian las dos visibles y lo demás se queda quieto');
  assert.deepEqual(s.camisetas.filter(c => visibles.includes(c.id)).map(c => c.id), ['p2', 'p1', 'p3']);
});

test('en la punta de la lista visible no se mueve nada', () => {
  const s = { camisetas: [{ id: 'a' }, { id: 'x' }, { id: 'b' }] };
  const visibles = ['a', 'b'];
  assert.equal(reordenarEntre(s, 'a', -1, visibles), false, 'la primera no sube');
  assert.equal(reordenarEntre(s, 'b', +1, visibles), false, 'la última no baja');
  assert.deepEqual(s.camisetas.map(c => c.id), ['a', 'x', 'b']);
});

test('sin lista visible se reordena sobre todo el array', () => {
  const s = { camisetas: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  assert.equal(reordenarEntre(s, 'b', -1), true);
  assert.deepEqual(s.camisetas.map(c => c.id), ['b', 'a', 'c']);
});

test('reordenar un id que no existe no rompe nada', () => {
  const s = { camisetas: [{ id: 'a' }, { id: 'b' }] };
  assert.equal(reordenarEntre(s, 'fantasma', +1, ['a', 'b']), false);
  assert.equal(reordenarEntre(s, 'a', +1, ['a', 'fantasma']), false);
  assert.deepEqual(s.camisetas.map(c => c.id), ['a', 'b']);
});

test('soltar una camiseta la deja en la ranura donde cayó el dedo', () => {
  const cerros = [{ id: 'sin-doblar', nombre: 'sin doblar', orden: 0, esDelSistema: true }];
  const cam = (id, tipo) => ({ id, nombre: id, misiones: [], milestones: [],
    ubicacion: tipo === 'puesta' ? { tipo: 'puesta' } : { tipo: 'cerro', cerroId: 'sin-doblar' } });
  const s = { cerros, eventos: [], camisetas: [cam('a', 'puesta'), cam('b', 'puesta'), cam('c', 'puesta'), cam('z', 'cerro')] };

  // Soltar 'z' sobre 'b', por encima de su mitad: queda justo antes de 'b'.
  colocarEn(s, 'z', PUESTA(), { id: 'b', antes: true });
  assert.deepEqual(s.camisetas.map(c => c.id), ['a', 'z', 'b', 'c']);
  assert.equal(estaPuesta(s.camisetas.find(c => c.id === 'z')), true, 'además se la puso');

  // Y por debajo de la mitad de 'a': queda justo después.
  colocarEn(s, 'z', PUESTA(), { id: 'a', antes: false });
  assert.deepEqual(s.camisetas.map(c => c.id), ['a', 'z', 'b', 'c']);

  colocarEn(s, 'c', PUESTA(), { id: 'a', antes: true });
  assert.deepEqual(s.camisetas.map(c => c.id), ['c', 'a', 'z', 'b']);
});

test('soltar en el vacío de la zona solo mueve, sin reordenar', () => {
  const cerros = [{ id: 'sin-doblar', nombre: 'sin doblar', orden: 0, esDelSistema: true }];
  const s = { cerros, eventos: [], camisetas: [
    { id: 'a', nombre: 'a', misiones: [], milestones: [], ubicacion: { tipo: 'puesta' } },
    { id: 'z', nombre: 'z', misiones: [], milestones: [], ubicacion: { tipo: 'cerro', cerroId: 'sin-doblar' } },
  ] };
  colocarEn(s, 'z', PUESTA(), null);
  assert.deepEqual(s.camisetas.map(c => c.id), ['a', 'z']);
  assert.equal(estaPuesta(s.camisetas.find(c => c.id === 'z')), true);
});

test('soltar una camiseta sobre sí misma no la duplica ni la pierde', () => {
  const s = { cerros: [], eventos: [], camisetas: [
    { id: 'a', nombre: 'a', misiones: [], milestones: [], ubicacion: { tipo: 'puesta' } },
    { id: 'b', nombre: 'b', misiones: [], milestones: [], ubicacion: { tipo: 'puesta' } },
  ] };
  colocarEn(s, 'a', PUESTA(), { id: 'a', antes: true });
  assert.deepEqual(s.camisetas.map(c => c.id), ['a', 'b']);
});

// ── v11: el partner ──────────────────────────────────────────────────────

test('v11 le pone partner a las camisetas viejas sin tocar las que ya lo tienen', () => {
  const antes = estadoLleno();
  antes.version = 10;
  antes.camisetas[1].partner = { activo: true, nombre: 'Camila', tipo: null };
  const s = laVuelta(antes);
  assert.equal(s.version, VERSION);
  assert.equal(s.camisetas[0].partner, null, 'la que no tenía queda sin partner');
  assert.deepEqual(s.camisetas[1].partner, { activo: true, nombre: 'Camila', tipo: null });
  // Y no reescribe nada más: por eso este paso no lleva respaldo crudo.
  const esperado = JSON.parse(JSON.stringify(antes));
  esperado.version = VERSION;
  esperado.camisetas[0].partner = null;
  noSePierdeNada(esperado, s);
});

test('el nombre del partner NUNCA sale en el codec', async () => {
  // La promesa es que compartir una camiseta no le carga a nadie un rol que
  // no pidió. El codec exporta por lista blanca, así que esto ya se cumple —
  // pero es exactamente la clase de garantía que se rompe el día que alguien
  // cambie la lista blanca por un spread, y entonces se rompe en silencio.
  const { encodeCamisetaToJSON } = await import('../src/codec/index.js');
  const cam = {
    id: 'c1', nombre: 'Capitán', emoji: '🧭', esencia: 'navegar',
    arco: { de: 'a', a: 'b' }, origen: 'propia', creador_id: 'local',
    origen_camiseta_id: '', misiones: [], milestones: [],
    created_at: '2026-01-01T00:00:00.000Z',
    partner: { activo: true, nombre: 'Camila', tipo: null },
  };
  const texto = encodeCamisetaToJSON(cam);
  assert.doesNotMatch(texto, /Camila/, 'el nombre del partner viajó en el molde');
  assert.doesNotMatch(texto, /partner/i);
});

test('un molde manipulado no puede meterle un partner a quien lo recibe', async () => {
  // La otra mitad de la promesa anterior. Desde que se pregunta por el partner
  // al importar, el nombre lo pone quien recibe y nadie más: si un JSON
  // llegara con un `partner` escrito a mano, el decoder tiene que ignorarlo.
  // Si no, quien te comparte una camiseta te elige el partner.
  const { decodeJSONToCamiseta } = await import('../src/codec/index.js');
  const molde = JSON.stringify({
    _t: 'camiseta-molde', nombre: 'Capitán', emoji: '🧭', creador_id: 'otro',
    misiones: [], milestones: [],
    partner: { activo: true, nombre: 'Camila', tipo: null },
  });
  const { camiseta } = decodeJSONToCamiseta(molde);
  assert.equal(camiseta.partner, undefined, 'el molde le metió un partner a quien recibe');
  assert.doesNotMatch(JSON.stringify(camiseta), /Camila/);
});
