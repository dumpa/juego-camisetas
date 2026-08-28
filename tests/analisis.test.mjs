// Pruebas del mini-análisis. Lo que se protege aquí no son los números
// bonitos: son las tres formas en que este cálculo se rompe callado.
//
//   · Contar completadas desde las misiones en vez de desde `movimientos`
//     (una recurrente con diez taps contaría una, y un deshacer no restaría).
//   · Olvidar las camisetas donadas (la mitad de la historia desaparece del
//     ranking justo cuando es más larga).
//   · Cortar los días en UTC (lo marcado de noche se corre al día siguiente,
//     y con eso se mueven la racha, los días activos y la gráfica semanal).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizar, rachaMasLarga, lunesDe, diaLocal } from '../src/analisis.js';

// Un ts a una hora fija LOCAL, para que las pruebas no dependan de la zona
// horaria de quien las corre.
const ts = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0).toISOString();

const mov = (camId, misId, y, m, d, h = 12, monto = 2) => ({
  id: `mv-${camId}-${misId}-${d}-${h}`, ts: ts(y, m, d, h),
  tipo: 'mision_completada', cam_id: camId, mision_id: misId, monto,
});

const estadoBase = (over = {}) => ({
  user_id: 'local', version: 11, created_at: ts(2026, 5, 20),
  camisetas: [], sesiones: [], eventos: [], movimientos: [], visitas: [],
  cerros: [], ecos: { silencios: {} }, ...over,
});

test('cuenta las completadas desde movimientos, no desde las misiones', () => {
  // Una recurrente marcada tres veces: la misión guarda tres completions y
  // hay tres movimientos. Ambos coinciden aquí; lo que importa es que el
  // total salga de los movimientos.
  const s = estadoBase({
    camisetas: [{
      id: 'c1', nombre: 'Movimiento', created_at: ts(2026, 5, 20),
      misiones: [{ id: 'm1', nombre: 'caminar', forma: 'recurrente', tonos: ['fisica'], puntos_base: 2, completions: [] }],
      milestones: [],
    }],
    movimientos: [
      mov('c1', 'm1', 2026, 5, 20),
      mov('c1', 'm1', 2026, 5, 21),
      mov('c1', 'm1', 2026, 5, 21, 20),
    ],
  });
  const r = analizar(s, new Date(2026, 4, 22));
  assert.equal(r.completadas, 3);
  assert.equal(r.puntosGanados, 6);
  assert.equal(r.diasActivos, 2, 'dos taps el mismo día son un solo día activo');
});

test('un movimiento borrado por deshacer deja de contar', () => {
  const s = estadoBase({
    camisetas: [{ id: 'c1', nombre: 'A', created_at: ts(2026, 5, 20), misiones: [{ id: 'm1', tonos: [] }], milestones: [] }],
    movimientos: [mov('c1', 'm1', 2026, 5, 20)],
  });
  assert.equal(analizar(s, new Date(2026, 4, 21)).completadas, 1);
  s.movimientos = [];
  assert.equal(analizar(s, new Date(2026, 4, 21)).completadas, 0);
});

test('las compras del catálogo no inflan las completadas ni los puntos ganados', () => {
  const s = estadoBase({
    camisetas: [{ id: 'c1', nombre: 'A', created_at: ts(2026, 5, 20), misiones: [{ id: 'm1', tonos: [] }], milestones: [] }],
    movimientos: [
      mov('c1', 'm1', 2026, 5, 20, 12, 3),
      { id: 'mv2', ts: ts(2026, 5, 21), tipo: 'compra_camiseta', cam_id: 'c2', monto: -10 },
    ],
  });
  const r = analizar(s, new Date(2026, 4, 22));
  assert.equal(r.completadas, 1);
  assert.equal(r.puntosGanados, 3);
  assert.equal(r.puntosBalance, -7, 'el balance sí resta la compra');
});

test('una camiseta donada sigue en el ranking, con su nombre y sus tonos', () => {
  // Este es el caso que se pierde si el análisis solo mira s.camisetas: la
  // camiseta ya no está en el array y todo lo suyo vive en el evento.
  const s = estadoBase({
    camisetas: [],
    eventos: [{
      id: 'e1', ts: ts(2026, 7, 25), tipo: 'camiseta_donada', cam_id: 'c9', nombre: 'Curiosidad',
      snapshot: {
        created_at: ts(2026, 5, 20),
        misiones: [{ id: 'm9', nombre: 'leer', forma: 'dificil', tonos: ['profunda'], puntos_base: 3 }],
        milestones: [],
      },
    }],
    movimientos: [mov('c9', 'm9', 2026, 6, 1, 12, 3), mov('c9', 'm9', 2026, 6, 2, 12, 3)],
  });
  const r = analizar(s, new Date(2026, 7, 1));
  assert.deepEqual(r.topCams.map(c => [c.nombre, c.n, c.viva]), [['Curiosidad', 2, false]]);
  assert.deepEqual(r.tonos.map(t => [t.id, t.n]), [['profunda', 2]]);
  assert.equal(r.sinTono, 0);
  assert.equal(r.camisetas.creadas, 1);
  assert.equal(r.camisetas.donadas, 1);
  // 20 mayo → 25 julio
  assert.deepEqual(r.duracion, [{ nombre: 'Curiosidad', dias: 66 }]);
});

test('una misión con dos tonos suma en los dos, y sin tonos cuenta aparte', () => {
  const s = estadoBase({
    camisetas: [{
      id: 'c1', nombre: 'A', created_at: ts(2026, 5, 20),
      misiones: [
        { id: 'm1', tonos: ['profunda', 'creativa'] },
        { id: 'm2', tonos: [] },
      ],
      milestones: [],
    }],
    movimientos: [mov('c1', 'm1', 2026, 5, 20), mov('c1', 'm2', 2026, 5, 20)],
  });
  const r = analizar(s, new Date(2026, 4, 21));
  assert.equal(r.completadas, 2);
  assert.equal(r.sinTono, 1);
  assert.deepEqual(r.tonos.map(t => t.id).sort(), ['creativa', 'profunda']);
  assert.equal(r.tonos.reduce((a, t) => a + t.n, 0), 2);
});

test('los días se cortan en hora local: lo marcado de noche no se corre', () => {
  // 23:30 local. En UTC-5 eso es el día siguiente en ISO; si el corte fuera
  // por toISOString(), estos dos serían días distintos y la racha sería de 1.
  const s = estadoBase({
    camisetas: [{ id: 'c1', nombre: 'A', created_at: ts(2026, 5, 20), misiones: [{ id: 'm1', tonos: [] }], milestones: [] }],
    movimientos: [mov('c1', 'm1', 2026, 5, 20, 23), mov('c1', 'm1', 2026, 5, 20, 8)],
  });
  const r = analizar(s, new Date(2026, 4, 21));
  assert.equal(r.diasActivos, 1);
  assert.equal(r.racha.dias, 1);
});

test('la racha más larga son días seguidos, y un hueco la corta', () => {
  assert.equal(rachaMasLarga([]), null);
  assert.equal(rachaMasLarga(['2026-05-20']).dias, 1);
  const r = rachaMasLarga(['2026-05-20', '2026-05-21', '2026-05-22', '2026-05-24', '2026-05-25']);
  assert.equal(r.dias, 3);
  assert.equal(r.desde, '2026-05-20');
  // Repetir un día no alarga la racha.
  assert.equal(rachaMasLarga(['2026-05-20', '2026-05-20', '2026-05-21']).dias, 2);
  // Cruzar el fin de mes.
  assert.equal(rachaMasLarga(['2026-05-30', '2026-05-31', '2026-06-01']).dias, 3);
});

test('la semana empieza en lunes y no se salta las semanas de cero', () => {
  assert.equal(lunesDe('2026-05-20'), '2026-05-18');  // miércoles → lunes
  assert.equal(lunesDe('2026-05-18'), '2026-05-18');  // lunes → él mismo
  assert.equal(lunesDe('2026-05-24'), '2026-05-18');  // domingo → lunes previo

  const s = estadoBase({
    camisetas: [{ id: 'c1', nombre: 'A', created_at: ts(2026, 5, 20), misiones: [{ id: 'm1', tonos: [] }], milestones: [] }],
    movimientos: [mov('c1', 'm1', 2026, 5, 20), mov('c1', 'm1', 2026, 6, 10)],
  });
  const r = analizar(s, new Date(2026, 5, 10));
  assert.deepEqual(r.semanal.map(w => w.lunes),
    ['2026-05-18', '2026-05-25', '2026-06-01', '2026-06-08']);
  assert.deepEqual(r.semanal.map(w => w.n), [1, 0, 0, 1],
    'las semanas sin nada marcado siguen ahí, en cero');
});

test('el día de la semana se acumula en orden lunes→domingo', () => {
  const s = estadoBase({
    camisetas: [{ id: 'c1', nombre: 'A', created_at: ts(2026, 5, 18), misiones: [{ id: 'm1', tonos: [] }], milestones: [] }],
    movimientos: [
      mov('c1', 'm1', 2026, 5, 18),      // lunes
      mov('c1', 'm1', 2026, 5, 19),      // martes
      mov('c1', 'm1', 2026, 5, 19, 20),  // martes otra vez
      mov('c1', 'm1', 2026, 5, 24),      // domingo
    ],
  });
  const r = analizar(s, new Date(2026, 4, 25));
  assert.deepEqual(r.porDiaSemana.map(d => d.label), ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']);
  assert.deepEqual(r.porDiaSemana.map(d => d.n), [1, 2, 0, 0, 0, 0, 1]);
});

test('el período arranca en el primer rastro de juego, no en created_at del estado', () => {
  // Un respaldo restaurado en un teléfono nuevo trae un created_at reciente.
  // Si el período saliera de ahí, una historia de meses se vería de días.
  const s = estadoBase({
    created_at: ts(2026, 8, 1),
    camisetas: [{ id: 'c1', nombre: 'A', created_at: ts(2026, 5, 20), misiones: [{ id: 'm1', tonos: [] }], milestones: [] }],
    movimientos: [mov('c1', 'm1', 2026, 5, 20)],
  });
  const r = analizar(s, new Date(2026, 7, 13));
  assert.equal(r.periodo.desde, '2026-05-20');
  assert.equal(r.periodo.dias, 86);
  assert.equal(r.porcentajeActivos, Math.round((1 / 86) * 100));
});

test('un estado vacío no explota y no inventa insights', () => {
  const r = analizar(estadoBase(), new Date(2026, 4, 20));
  assert.equal(r.completadas, 0);
  assert.equal(r.racha, null);
  assert.equal(r.periodo.dias, 1);
  assert.deepEqual(r.topCams, []);
  assert.deepEqual(r.duracion, []);
  assert.deepEqual(r.insights, []);
  assert.equal(r.tiles.length, 6);
  assert.equal(r.tiles[4].value, '0', 'sin nada marcado la racha es 0, no "null"');
});

test('las sesiones se cuentan por tipo', () => {
  const s = estadoBase({
    sesiones: [
      { id: 's1', tipo: 'diaria', date: ts(2026, 5, 20) },
      { id: 's2', tipo: 'diaria', date: ts(2026, 5, 21) },
      { id: 's3', tipo: 'semanal', date: ts(2026, 5, 24) },
      { id: 's4', tipo: 'mensual', date: ts(2026, 5, 31) },
    ],
  });
  const r = analizar(s, new Date(2026, 5, 1));
  assert.deepEqual(r.sesiones, { total: 4, diaria: 2, semanal: 1, mensual: 1 });
});

test('diaLocal aguanta basura sin tumbar el análisis', () => {
  assert.equal(diaLocal('no es una fecha'), null);
  const s = estadoBase({
    camisetas: [{ id: 'c1', nombre: 'A', created_at: ts(2026, 5, 20), misiones: [{ id: 'm1', tonos: [] }], milestones: [] }],
    movimientos: [
      { id: 'x', ts: 'roto', tipo: 'mision_completada', cam_id: 'c1', mision_id: 'm1', monto: 2 },
      mov('c1', 'm1', 2026, 5, 20),
    ],
  });
  const r = analizar(s, new Date(2026, 4, 21));
  assert.equal(r.diasActivos, 1);
});
