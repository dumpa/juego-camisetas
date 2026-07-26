// ── El motor de ecos ─────────────────────────────────────────────────────
//
// Un eco es el jefe hablándole al hacedor: la persona que armó el plan dejó
// algo dicho y el app lo entrega cuando el hacedor vuelve. No es una
// notificación (no persigue), no es un aviso del sistema (no informa de sí
// mismo) y no es una racha (no premia ni castiga).
//
// Cómo funciona:
//   · Una fuente es una función pura (state, ctx) -> eco | null.
//   · Se recorren en orden. La primera que devuelva algo gana.
//   · Se muestra UN eco a la vez. Dos voces al mismo tiempo son ruido, y el
//     ruido es lo primero que se aprende a ignorar.
//   · Descartar un eco lo silencia por un tiempo propio de su cadencia
//     (regla 7: la pregunta caduca; el silencio dura lo que dura la ocasión,
//     no cinco minutos).
//
// Para añadir un eco en la próxima sesión: se escribe una fuente, se mete al
// arreglo FUENTES y se le ponen los textos en textos.js. Nada más de esto se
// toca. Al final del archivo quedan anotadas las fuentes que faltan.

import { TEXTOS, variante } from './textos.js';

const DIA = 86400000;
const dias = (ms) => ms / DIA;

// ── Consultas sobre la historia ──────────────────────────────────────────
// Públicas a propósito: la UI también las necesita (el Diario muestra la
// próxima cita de cada cadencia).

// El último check-in de cada cadencia. Sale de s.sesiones, que es la fuente
// de verdad de "esto se hizo": los eventos sesion_* son su reflejo.
export function ultimaSesion(state, tipo) {
  const lista = state?.sesiones || [];
  for (let i = lista.length - 1; i >= 0; i--) {
    if (lista[i].tipo === tipo) return lista[i];
  }
  return null;
}

export function ultimasSesiones(state) {
  return {
    diaria: ultimaSesion(state, 'diaria'),
    semanal: ultimaSesion(state, 'semanal'),
    mensual: ultimaSesion(state, 'mensual'),
  };
}

// La cita vigente de una cadencia: la última agendada que todavía no ha
// pasado. Si ya pasó no queda nada — el app no sabe si se cumplió y no va a
// inventárselo (regla 6).
export function citaVigente(state, cadencia, ahora = new Date()) {
  const evs = state?.eventos || [];
  let mejor = null;
  for (let i = evs.length - 1; i >= 0; i--) {
    const e = evs[i];
    if (e.tipo !== 'cita_agendada' || e.cadencia !== cadencia) continue;
    const para = new Date(e.para);
    if (isNaN(para.getTime())) continue;
    if (para.getTime() > ahora.getTime()) { mejor = { ...e, paraFecha: para }; }
    break; // solo importa la última: agendar de nuevo reemplaza el compromiso
  }
  return mejor;
}

// ── Silencio ─────────────────────────────────────────────────────────────

function estaSilenciado(state, clave, silencioDias, ahora) {
  const ts = state?.ecos?.silencios?.[clave];
  if (!ts) return false;
  const desde = new Date(ts).getTime();
  if (isNaN(desde)) return false;
  return dias(ahora.getTime() - desde) < silencioDias;
}

// Mutador: se llama dentro de update(). Descartar es una respuesta válida.
export function silenciarEco(s, eco) {
  if (!s.ecos) s.ecos = { silencios: {} };
  if (!s.ecos.silencios) s.ecos.silencios = {};
  s.ecos.silencios[eco.clave] = new Date().toISOString();
}

// ── Fuentes ──────────────────────────────────────────────────────────────

// El app tiene que llevar rato vivo antes de opinar. A un usuario de tres
// días no se le reclama un cierre de semana que nunca tuvo cuándo pasar.
function tieneRodaje(state, ahora, minDias) {
  if (!state?.camisetas?.some(c => c.ubicacion?.tipo === 'puesta')) return false;
  const nacimiento = new Date(state.created_at || 0).getTime();
  if (isNaN(nacimiento)) return true;
  return dias(ahora.getTime() - nacimiento) >= minDias;
}

// Semilla de la ocasión: la frase es la misma toda la semana (o todo el mes)
// y cambia al pasar a la siguiente. Estable, no aleatoria.
function semanaDe(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = (t.getUTCDay() + 6) % 7;          // lunes = 0
  t.setUTCDate(t.getUTCDate() - dow + 3);        // jueves de esa semana
  const ene4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const semana = 1 + Math.round((t - ene4) / (7 * DIA));
  return `${t.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}
const mesDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Fuente: agendar el check-in.
//
// Aparece cuando la cadencia está vencida y no hay cita puesta. Nunca dice
// cuánto lleva vencida: la fecha decide si el eco sale, y una vez que salió
// la fecha no se menciona. Esa es toda la diferencia entre un jefe y un
// capataz.
function fuenteAgendar(cadencia, vencimientoDias, silencioDias, rodajeDias) {
  return (state, ctx) => {
    const { ahora } = ctx;
    if (!tieneRodaje(state, ahora, rodajeDias)) return null;
    if (citaVigente(state, cadencia, ahora)) return null;   // ya hay compromiso

    const ult = ultimaSesion(state, cadencia);
    if (ult) {
      const desde = new Date(ult.date).getTime();
      if (!isNaN(desde) && dias(ahora.getTime() - desde) < vencimientoDias) return null;
    }

    const semilla = cadencia === 'mensual' ? mesDe(ahora) : semanaDe(ahora);
    const t = variante(TEXTOS.agendar[cadencia], semilla);
    if (!t) return null;

    return {
      clave: `agendar:${cadencia}`,
      fuente: 'agendar',
      titulo: t.titulo,
      cuerpo: t.cuerpo,
      tono: cadencia === 'mensual' ? 'var(--violeta-luz)' : 'var(--ocean)',
      accion: { etiqueta: TEXTOS.agendar.accion, tipo: 'cita', cadencia },
      descartar: TEXTOS.agendar.descartar,
      silencioDias,
    };
  };
}

// A partir de esta hora tiene sentido hablar de cerrar el día. Antes, el día
// todavía se está haciendo.
const HORA_CIERRE_DIA = 18;

const fechaDe = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ¿Se cerró el día de hoy?
function cerroElDia(state, ahora) {
  const ult = ultimaSesion(state, 'diaria');
  if (!ult) return false;
  const d = new Date(ult.date);
  return !isNaN(d.getTime()) && d.toDateString() === ahora.toDateString();
}

// Fuente: cerrar el día.
//
// No mira si hay misiones marcadas, a propósito. El cierre no termina en la
// lista: termina en "¿qué movió el día?", y esa respuesta no depende de haber
// cumplido nada. Un día sin una sola marca puede ser el que más tenga que
// decir. Pedir rendimiento para merecer la reflexión sería gamificación
// disfrazada de criterio (regla 4).
//
// Su acción no es una cita: abre el check-in ahí mismo. Es el único eco que
// pide algo que se hace en el momento, y por eso es el único que no pasa por
// el calendario.
function fuenteCerrarDia(state, ctx) {
  const { ahora } = ctx;
  if (ahora.getHours() < HORA_CIERRE_DIA) return null;
  if (!tieneRodaje(state, ahora, 0)) return null;
  if (cerroElDia(state, ahora)) return null;

  const fecha = fechaDe(ahora);
  const t = variante(TEXTOS.cerrarDia.frases, fecha);
  if (!t) return null;

  return {
    // La clave lleva la fecha: descartarlo lo apaga hoy y mañana es otro eco,
    // con otra clave. Así no hace falta un silencio de horas.
    clave: `cerrar-dia:${fecha}`,
    fuente: 'cerrar-dia',
    titulo: t.titulo,
    cuerpo: t.cuerpo,
    tono: 'var(--gold)',
    accion: { etiqueta: TEXTOS.cerrarDia.accion, tipo: 'sesion', cadencia: 'diaria' },
    descartar: TEXTOS.cerrarDia.descartar,
    silencioDias: 1,
  };
}

// El orden es la prioridad, y va de lo raro a lo frecuente. Los ecos de
// agendar aparecen pocas veces al mes; el del día, casi todas las tardes. Si
// el frecuente fuera primero, el raro no saldría nunca —cada vez que le
// tocara turno habría un cierre de día tapándolo—.
//
// Entre semana y mes: la semana primero. La cadencia corta sostiene, la
// larga corrige, y de nada sirve corregir lo que no se sostiene.
export const FUENTES = [
  fuenteAgendar('semanal', 7, 7, 7),
  fuenteAgendar('mensual', 28, 21, 21),
  fuenteCerrarDia,

  // Pendientes para la próxima sesión (pieza 3 del plan v1). Cada una es una
  // función más en este arreglo; lo difícil de todas es el criterio de
  // selección, no el mecanismo:
  //   · misión nombrada hace semanas y nunca tocada
  //   · una respuesta que diste en un check-in viejo, devuelta sin comentario
  //   · una nota suelta que escribiste y no volviste a leer
  //   · un milestone que quedó a un paso
];

// Devuelve el eco a mostrar, o null. Barato: recorre las colas de las
// listas, no las listas enteras.
export function elegirEco(state, ahora = new Date()) {
  if (!state) return null;
  const ctx = { ahora };
  for (const fuente of FUENTES) {
    let eco = null;
    try { eco = fuente(state, ctx); } catch { eco = null; }
    if (!eco) continue;
    if (estaSilenciado(state, eco.clave, eco.silencioDias, ahora)) continue;
    return eco;
  }
  return null;
}
