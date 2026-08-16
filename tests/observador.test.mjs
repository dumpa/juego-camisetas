// Qué mira el observador, y sobre todo qué no.
//
// Esta es la prueba más importante del ritual mensual: sus comprobaciones son
// el único sitio del app donde alguien va a sentir la tentación de calcular
// una racha "porque sería útil". La lista de lo prohibido está en
// docs/rituales.md §5 y aquí se verifica que ninguna la cruce.
//
//   node --test tests/observador.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { mirar, preguntaDelCosturero, PREGUNTAS_DIFICILES, PREGUNTAS_COSTURERO } from '../src/observador/index.js';

const DIA = 86400000;
const HOY = new Date('2026-08-15T12:00:00.000Z');
const hace = (d) => new Date(HOY.getTime() - d * DIA).toISOString();

const mision = ({ tonos = [], forma = 'dificil', hecha = true, veces = 1 } = {}) => ({
  id: 'm' + Math.random(), nombre: 'x', forma, tonos,
  estado: hecha ? 'hecha' : 'activa',
  completed_at: hecha ? hace(5) : null,
  completions: Array(Math.max(0, veces - 1)).fill(hace(6)),
});

const camiseta = (id, misiones, created = hace(100)) =>
  ({ id, nombre: id, emoji: '🎽', created_at: created, misiones, milestones: [] });

const donada = (nombre, diasVivida, cuantasMisiones, cuandoMurio = 30) => ({
  tipo: 'camiseta_donada', ts: hace(cuandoMurio), nombre,
  snapshot: {
    created_at: hace(cuandoMurio + diasVivida),
    misiones: Array.from({ length: cuantasMisiones }, () => ({ nombre: 'm', completions: [], completed_at: null })),
  },
});

const estado = (extra = {}) => ({ camisetas: [], eventos: [], movimientos: [], sesiones: [], ...extra });
const ver = (s, ultimaClave = null) => mirar(s, { ahora: HOY, ultimaClave });

// ── Sin material, no se inventa ──────────────────────────────────────────

test('sin material suficiente el observador se calla', () => {
  assert.equal(ver(estado()), null);
  // Cuatro misiones completadas no son una proporción, son ruido.
  assert.equal(ver(estado({ camisetas: [camiseta('a', [mision(), mision(), mision(), mision()])] })), null);
});

// ── Las comprobaciones ───────────────────────────────────────────────────

test('detecta que el juego se volvió una lista de pendientes', () => {
  const sinTono = Array.from({ length: 15 }, () => mision({ tonos: [] }));
  const conTono = Array.from({ length: 3 }, () => mision({ tonos: ['creativa'] }));
  const h = ver(estado({ camisetas: [camiseta('a', [...sinTono, ...conTono])] }));
  assert.equal(h.clave, 'tonoDeLasMisiones');
  assert.match(h.cuerpo, /15 de cada 18/);
});

test('detecta que el juego se estrechó a un solo tono', () => {
  const dominante = Array.from({ length: 14 }, () => mision({ tonos: ['fisica'] }));
  const otras = Array.from({ length: 2 }, () => mision({ tonos: ['creativa'] }));
  const h = ver(estado({ camisetas: [camiseta('a', [...dominante, ...otras])] }));
  assert.equal(h.clave, 'tonoDominante');
  assert.match(h.pregunta, /fisica/);
});

test('cuenta las misiones de las camisetas que ya se fueron', () => {
  // Sin esto el observador olvidaría justo las identidades muertas, que son
  // la mitad de lo que tiene para decir.
  const eventos = [{
    tipo: 'camiseta_donada', ts: hace(10), nombre: 'Ida',
    snapshot: { created_at: hace(70), misiones: Array.from({ length: 14 }, () => ({ tonos: [], completed_at: hace(20), completions: [] })) },
  }];
  const h = ver(estado({ eventos }));
  assert.equal(h.clave, 'tonoDeLasMisiones');
  assert.match(h.cuerpo, /14 de cada 14/);
});

test('pregunta por una identidad que dura mucho más que las propias', () => {
  const eventos = [donada('a', 60, 8), donada('b', 50, 7), donada('c', 66, 9)];
  const s = estado({ eventos, camisetas: [camiseta('Vieja', [], hace(400))] });
  const h = ver(s);
  assert.equal(h.clave, 'identidadLarga');
  assert.match(h.pregunta, /Vieja/);
  assert.match(h.cuerpo, /60 días/, 'la referencia es la mediana propia, no un número de manual');
});

test('sin identidades idas fechables, no hay referencia y se calla', () => {
  // Una donación vieja no trae created_at: estimarla sería inventar.
  const eventos = [{ tipo: 'camiseta_donada', ts: hace(30), nombre: 'Vieja', snapshot: { misiones: [] } }];
  const s = estado({ eventos, camisetas: [camiseta('Otra', [], hace(500))] });
  assert.equal(ver(s), null);
});

test('distingue una camiseta gastada de una abandonada', () => {
  const eventos = [donada('a', 40, 1), donada('b', 30, 2), donada('c', 20, 1)];
  const h = ver(estado({ eventos }));
  assert.equal(h.clave, 'gastadaVsAbandonada');
});

test('detecta que se arman camisetas más rápido de lo que se juegan', () => {
  const camisetas = ['a', 'b', 'c', 'd'].map(id => camiseta(id, [], hace(20)));
  const movimientos = [{ tipo: 'mision_completada', cam_id: 'a', ts: hace(5), monto: 3 }];
  const h = ver(estado({ camisetas, movimientos }));
  assert.equal(h.clave, 'creacionVsJuego');
  assert.match(h.cuerpo, /3 no se han jugado/);
});

test('detecta la deriva del promedio de puntos, para arriba y para abajo', () => {
  const mov = (dias, monto) => ({ tipo: 'mision_completada', cam_id: 'a', ts: hace(dias), monto });
  const inflado = estado({ movimientos: [
    ...Array.from({ length: 6 }, () => mov(45, 2)),
    ...Array.from({ length: 6 }, () => mov(10, 6)),
  ] });
  const h = ver(inflado);
  assert.equal(h.clave, 'derivaDePuntos');
  assert.equal(h.material.subio, true);
  assert.match(h.cuerpo, /de 2 a 6 puntos/);

  const desinflado = estado({ movimientos: [
    ...Array.from({ length: 6 }, () => mov(45, 6)),
    ...Array.from({ length: 6 }, () => mov(10, 2)),
  ] });
  assert.equal(ver(desinflado).material.subio, false);
});

// ── Las reglas ───────────────────────────────────────────────────────────

test('se presenta UNA sola comprobación, nunca un tablero', () => {
  // Un estado que dispara varias a la vez sigue devolviendo una.
  const s = estado({
    camisetas: [camiseta('a', Array.from({ length: 15 }, () => mision({ tonos: [] })), hace(400)),
                camiseta('b', [], hace(20)), camiseta('c', [], hace(20)), camiseta('d', [], hace(20))],
    eventos: [donada('x', 40, 1), donada('y', 30, 2), donada('z', 20, 1)],
  });
  const h = ver(s);
  assert.ok(h);
  assert.deepEqual(Object.keys(h).sort(), ['clave', 'cuerpo', 'material', 'pregunta']);
  assert.equal(typeof h.pregunta, 'string');
});

test('la comprobación del mes pasado pierde fuerza, pero no queda vetada', () => {
  const s = estado({
    camisetas: [camiseta('a', Array.from({ length: 15 }, () => mision({ tonos: [] })))],
    eventos: [donada('x', 40, 1), donada('y', 30, 2), donada('z', 20, 1)],
  });
  const primera = ver(s).clave;
  const segunda = ver(s, primera).clave;
  assert.notEqual(segunda, primera, 'no repite la misma conversación cada treinta días');
  // Si es lo único que hay, vuelve: que vuelva también es información.
  const solo = estado({ camisetas: [camiseta('a', Array.from({ length: 15 }, () => mision({ tonos: [] })))] });
  assert.equal(ver(solo, 'tonoDeLasMisiones').clave, 'tonoDeLasMisiones');
});

test('todo termina en pregunta y nada felicita ni regaña', () => {
  const casos = [
    estado({ camisetas: [camiseta('a', Array.from({ length: 15 }, () => mision({ tonos: [] })))] }),
    estado({ camisetas: [camiseta('a', Array.from({ length: 15 }, () => mision({ tonos: ['fisica'] })))] }),
    estado({ eventos: [donada('x', 40, 1), donada('y', 30, 2), donada('z', 20, 1)] }),
    estado({ camisetas: ['a','b','c','d'].map(id => camiseta(id, [], hace(20))), movimientos: [] }),
  ];
  const prohibidas = /racha|llevas \d|d[ií]as sin|d[ií]as activos|cumplimiento|desempeño|felicit|excelente|mal hecho/i;
  for (const s of casos) {
    const h = ver(s);
    if (!h) continue;
    assert.match(h.pregunta, /\?$/, `no es pregunta: "${h.pregunta}"`);
    assert.doesNotMatch(`${h.pregunta} ${h.cuerpo}`, prohibidas, h.clave);
  }
});

test('las difíciles salen todas, y todas son preguntas abiertas', () => {
  // El observador es la sesión que se agenda para sentarse un rato: mostrar
  // una sola y esconder el resto convertía media hora en tres minutos. Lo que
  // las hace soportables es que se pueden pasar, no que sean pocas.
  assert.ok(PREGUNTAS_DIFICILES.length >= 10, 'la sesión tiene que dar para rato');
  for (const p of PREGUNTAS_DIFICILES) {
    assert.match(p.titulo, /\?$/, `no es pregunta: "${p.titulo}"`);
    assert.ok(p.ayuda && p.ayuda.length > 5, `"${p.titulo}" no tiene ayuda`);
  }
  // Ninguna repetida: la lista se muestra entera y una repetición se nota.
  const titulos = PREGUNTAS_DIFICILES.map(p => p.titulo);
  assert.equal(new Set(titulos).size, titulos.length);
});

test('la pregunta del costurero es estable dentro de la semana', () => {
  const martes = preguntaDelCosturero(new Date('2026-08-18T09:00:00'));
  const jueves = preguntaDelCosturero(new Date('2026-08-20T22:00:00'));
  assert.deepEqual(martes, jueves, 'abrir el ritual dos días seguidos no cambia la pregunta');
  // Y a la semana siguiente es otra.
  const otra = preguntaDelCosturero(new Date('2026-08-27T09:00:00'));
  assert.notDeepEqual(martes, otra);
  for (const p of PREGUNTAS_COSTURERO) assert.match(p.titulo, /\?$/);
});

test('los dos bancos no se pisan', () => {
  // El del costurero es concreto y sobre el trabajo de la semana; el del
  // observador es sobre para qué. Si una pregunta está en los dos, una de las
  // dos sillas está haciendo el trabajo de la otra.
  const dificiles = new Set(PREGUNTAS_DIFICILES.map(p => p.titulo));
  for (const p of PREGUNTAS_COSTURERO) assert.ok(!dificiles.has(p.titulo), `repetida: ${p.titulo}`);
});

test('un estado roto no tumba la sesión', () => {
  assert.equal(mirar(undefined, { ahora: HOY }), null);
  assert.equal(mirar({}, { ahora: HOY }), null);
  assert.equal(mirar({ camisetas: [{ id: 'x' }], eventos: [{ tipo: 'camiseta_donada' }] }, { ahora: HOY }), null);
});
