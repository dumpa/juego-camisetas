// Cuándo habla el app y cuándo se calla.
//
// Es la prueba de las reglas que más fácil se rompen sin darse cuenta: el eco
// habla una vez por decisión, nunca cuenta ausencias y se calla solo cuando
// el ritual ya se hizo. Un cambio que haga hablar al app "un poquito más"
// pasa desapercibido en la pantalla y se ve aquí.
//
//   node --test tests/ecos.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { elegirEco, paraQueDia, yaEscogio, silenciarEco, calcularSeñales } from '../src/ecos/index.js';

// Un estado con rodaje y con las cadencias largas al día, para que los ecos
// de agendar no tapen al del ritual diario (van antes, a propósito).
function estado(sesiones = []) {
  return {
    created_at: '2026-01-01T00:00:00.000Z',
    camisetas: [{ id: 'c1', nombre: 'Capitán', ubicacion: { tipo: 'puesta' } }],
    eventos: [], movimientos: [], visitas: [], ecos: { silencios: {} },
    sesiones: [
      { tipo: 'semanal', date: '2026-08-14T10:00:00.000Z' },
      { tipo: 'mensual', date: '2026-08-14T10:00:00.000Z' },
      ...sesiones,
    ],
  };
}
const enLaManana = new Date('2026-08-15T09:00:00');
const enLaNoche  = new Date('2026-08-15T21:00:00');

test('en la mañana se escoge la ropa de hoy; en la noche, la de mañana', () => {
  assert.deepEqual(paraQueDia(enLaManana), { dia: '2026-08-15', cuando: 'hoy' });
  assert.deepEqual(paraQueDia(enLaNoche),  { dia: '2026-08-16', cuando: 'manana' });
});

test('el eco del ritual aparece en los dos momentos, con textos distintos', () => {
  const manana = elegirEco(estado(), enLaManana);
  const noche  = elegirEco(estado(), enLaNoche);
  assert.equal(manana.fuente, 'escoger-ropa');
  assert.equal(noche.fuente, 'escoger-ropa');
  assert.notEqual(manana.titulo, noche.titulo, 'la mañana y la noche no dicen lo mismo');
  assert.equal(manana.accion.etiqueta, 'escoger la ropa de hoy');
  assert.equal(noche.accion.etiqueta, 'escoger la ropa de mañana');
  // La puerta al ritual se abre ahí mismo: no pasa por el calendario.
  assert.equal(noche.accion.tipo, 'sesion');
});

test('una vez escogida la ropa de un día, no se vuelve a pedir', () => {
  const s = estado([{ tipo: 'diaria', date: '2026-08-15T21:30:00.000Z', para: '2026-08-16' }]);
  assert.equal(yaEscogio(s, '2026-08-16'), true);
  // Ni esa misma noche…
  assert.equal(elegirEco(s, new Date('2026-08-15T22:00:00')), null);
  // …ni a la mañana siguiente, que apunta al mismo día.
  assert.equal(elegirEco(s, new Date('2026-08-16T08:00:00')), null);
  // Pero la noche del 16 ya es otra decisión: la del 17.
  assert.equal(elegirEco(s, new Date('2026-08-16T21:00:00')).clave, 'escoger-ropa:2026-08-17');
});

test('una sesión vieja sin "para" se lee por su fecha', () => {
  // Las sesiones de antes del rediseño no traen día objetivo. Sin este
  // respaldo, el día que alguien actualiza el app el eco hablaría de más.
  const s = estado([{ tipo: 'diaria', date: '2026-08-15T10:00:00' }]);
  assert.equal(elegirEco(s, enLaManana), null);
});

test('descartar apaga esa decisión y nada más', () => {
  const s = estado();
  const eco = elegirEco(s, enLaNoche);
  silenciarEco(s, eco);
  assert.equal(elegirEco(s, enLaNoche), null, 'queda callado para el día que se descartó');
  // El día siguiente es otra clave: el silencio no se hereda.
  assert.ok(elegirEco(s, new Date('2026-08-16T21:00:00')));
});

test('el eco no exige que haya nada cumplido', () => {
  // Un día sin una sola misión marcada puede ser el que más tenga que decir.
  const s = estado();
  s.camisetas[0].misiones = [];
  s.movimientos = [];
  assert.ok(elegirEco(s, enLaNoche), 'habla igual sin nada marcado');
});

test('un app recién instalado no opina', () => {
  const s = estado();
  s.camisetas = [];   // sin nada puesto no hay nada que devolver
  assert.equal(elegirEco(s, enLaNoche), null);
});

test('ningún texto del eco cuenta días ni nombra lo prohibido', () => {
  // La regla dura que más veces va a parecer razonable romper.
  const prohibidas = /racha|llevas \d|d[ií]as sin|cumplimiento|desempeño|mentor|testigo|vigilar/i;
  const momentos = [enLaManana, enLaNoche, new Date('2026-08-16T21:00:00'), new Date('2026-09-01T09:00:00')];
  for (const cuando of momentos) {
    for (const s of [estado(), estado([{ tipo: 'diaria', date: '2026-08-01T10:00:00.000Z', para: '2026-08-01' }])]) {
      const eco = elegirEco(s, cuando);
      if (!eco) continue;
      const texto = `${eco.titulo} ${eco.cuerpo} ${eco.descartar} ${JSON.stringify(eco.accion.etiqueta)}`;
      assert.doesNotMatch(texto, prohibidas, `eco ${eco.clave}: "${texto}"`);
    }
  }
});

// ── Las señales del costurero ────────────────────────────────────────────

const HOY = new Date('2026-08-15T12:00:00.000Z');
const hace = (dias) => new Date(HOY.getTime() - dias * 86400000).toISOString();

const mision = (estado = 'activa', forma = 'dificil') =>
  ({ id: 'm' + Math.random(), nombre: 'x', forma, estado, completions: [] });

function conCamisetas(camisetas, movimientos = []) {
  return { camisetas, movimientos, sesiones: [], eventos: [] };
}

test('"sin misiones que hacer" es la señal que el diario le pasa al costurero', () => {
  const s = conCamisetas([
    { id: 'a', nombre: 'Vacía', created_at: hace(60), misiones: [] },
    { id: 'b', nombre: 'Solo archivadas', created_at: hace(60), misiones: [mision('archivada')] },
    { id: 'c', nombre: 'Solo hechas', created_at: hace(60), misiones: [mision('hecha')] },
    { id: 'd', nombre: 'Con trabajo', created_at: hace(60), misiones: [mision('activa')] },
    // Una recurrente hecha sigue siendo trabajo: vuelve mañana.
    { id: 'e', nombre: 'Recurrente hecha', created_at: hace(60), misiones: [mision('hecha', 'recurrente')] },
  ]);
  const señales = calcularSeñales(s, HOY);
  assert.equal(señales.a.sinMisiones, true);
  assert.equal(señales.b.sinMisiones, true);
  assert.equal(señales.c.sinMisiones, true);
  assert.equal(señales.d.sinMisiones, false);
  assert.equal(señales.e.sinMisiones, false, 'una recurrente nunca deja de ser trabajo');
});

test('"hace rato no se juega" mira la camiseta, no la asistencia', () => {
  const s = conCamisetas(
    [
      { id: 'viva', nombre: 'Viva', created_at: hace(90), misiones: [mision()] },
      { id: 'dormida', nombre: 'Dormida', created_at: hace(90), misiones: [mision()] },
      { id: 'nueva', nombre: 'Nueva', created_at: hace(2), misiones: [mision()] },
      { id: 'vieja-sin-jugar', nombre: 'Vieja sin jugar', created_at: hace(90), misiones: [mision()] },
    ],
    [
      { cam_id: 'viva', ts: hace(3), tipo: 'mision_completada', monto: 1 },
      { cam_id: 'dormida', ts: hace(40), tipo: 'mision_completada', monto: 1 },
    ],
  );
  const señales = calcularSeñales(s, HOY);
  assert.equal(señales.viva.dormida, false);
  assert.equal(señales.dormida.dormida, true);
  // Una camiseta recién creada no está dormida: no ha tenido cuándo jugarse,
  // y decirle lo contrario sería un reproche por existir.
  assert.equal(señales.nueva.dormida, false);
  assert.equal(señales['vieja-sin-jugar'].dormida, true);
});

test('las señales no llevan número: son etiqueta o nada', () => {
  // Un contador de días aquí sería una racha con otro nombre. La forma del
  // dato es la que protege la regla: booleanos, no cuentas.
  const s = conCamisetas([{ id: 'a', nombre: 'A', created_at: hace(90), misiones: [] }]);
  const señal = calcularSeñales(s, HOY).a;
  assert.deepEqual(Object.keys(señal).sort(), ['dormida', 'sinMisiones']);
  for (const v of Object.values(señal)) assert.equal(typeof v, 'boolean');
});

test('un estado vacío no revienta las señales', () => {
  assert.deepEqual(calcularSeñales({}, HOY), {});
  assert.deepEqual(calcularSeñales(undefined, HOY), {});
});
