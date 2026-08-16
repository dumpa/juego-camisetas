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
import { enJuego } from '../estado.js';

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

// Las señales que el costurero le pone a cada camiseta para que uno escoja
// cuál remendar. Viven aquí, con lo demás que el app se atreve a notar en voz
// alta, porque obedecen la misma regla y es fácil romperla sin darse cuenta:
//
//   el app puede decir que hace rato no juegas de futbolista —eso habla de
//   una identidad— y nunca que hace rato no entras.
//
// De ahí que no haya número. Ni días, ni "llevas X sin": sale la etiqueta o
// no sale. Un contador aquí sería una racha con otro nombre.
const DORMIDA_DIAS = 14;

export function calcularSeñales(state, ahora = new Date()) {
  const t0 = ahora.getTime();
  const ultimoMov = {};
  for (const mv of (state?.movimientos || [])) {
    if (!mv.cam_id) continue;
    const t = new Date(mv.ts).getTime();
    if (!isNaN(t) && t > (ultimoMov[mv.cam_id] || 0)) ultimoMov[mv.cam_id] = t;
  }
  const señales = {};
  for (const c of (state?.camisetas || [])) {
    // Una camiseta recién creada no está dormida: no ha tenido cuándo
    // jugarse, y decirle lo contrario es un reproche por existir.
    const nacimiento = new Date(c.created_at || 0).getTime();
    const referencia = ultimoMov[c.id] || (isNaN(nacimiento) ? t0 : nacimiento);
    señales[c.id] = {
      sinMisiones: !(c.misiones || []).some(enJuego),
      dormida: dias(t0 - referencia) > DORMIDA_DIAS,
    };
  }
  return señales;
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
export function semanaDe(d) {
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

// A partir de esta hora el día ya no se está haciendo: se está entregando.
// Antes de esa hora, escoger la ropa es escoger la de hoy; después, la de
// mañana. El acto es el mismo y la hora solo decide a qué día apunta.
const HORA_ENTREGA = 18;

export const fechaDe = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Para qué día se está escogiendo la ropa, según cuándo se entra. Lo usan el
// eco y el ritual: si no compartieran esta cuenta, el eco podría invitar a
// escoger la de mañana y la pantalla preguntar por la de hoy.
export function paraQueDia(ahora = new Date()) {
  const esNoche = ahora.getHours() >= HORA_ENTREGA;
  const objetivo = new Date(ahora);
  if (esNoche) objetivo.setDate(objetivo.getDate() + 1);
  return { dia: fechaDe(objetivo), cuando: esNoche ? 'manana' : 'hoy' };
}

// ¿Ya se escogió la ropa de ese día? Una vez hecho, está hecho: si se hizo en
// la mañana, en la noche no se vuelve a pedir.
//
// Las sesiones viejas no llevan 'para' —son de cuando el ritual diario era
// otra cosa—, así que para ellas se mira la fecha en que se escribieron. Sin
// eso, el primer día después de actualizar el eco hablaría de más.
export function yaEscogio(state, dia) {
  const lista = state?.sesiones || [];
  for (let i = lista.length - 1; i >= 0; i--) {
    const s = lista[i];
    if (s.tipo !== 'diaria') continue;
    if (s.para) { if (s.para === dia) return true; continue; }
    const d = new Date(s.date);
    if (!isNaN(d.getTime()) && fechaDe(d) === dia) return true;
  }
  return false;
}

// Fuente: escoger la ropa.
//
// No mira si hay misiones marcadas, a propósito. El ritual no termina en la
// lista: termina en la ropa escogida y en una línea, y eso no depende de
// haber cumplido nada. Un día sin una sola marca puede ser el que más tenga
// que decir. Pedir rendimiento para merecer la reflexión sería gamificación
// disfrazada de criterio (regla 4).
//
// Su acción no es una cita: abre el ritual ahí mismo. Es el único eco que
// pide algo que se hace en el momento, y por eso es el único que no pasa por
// el calendario — al hacedor lo convoca el trabajo, no una alarma.
//
// Se asoma en dos momentos, en la mañana y al caer la tarde, con frases
// distintas. La clave no es el día del calendario sino **el día que se está
// escogiendo**, y de ahí sale solo lo que queremos: la invitación es una por
// decisión, no una por vez que abras el app. Si anoche escogiste (o
// descartaste) la ropa de mañana, hoy en la mañana no te la vuelve a pedir.
function fuenteEscogerLaRopa(state, ctx) {
  const { ahora } = ctx;
  if (!tieneRodaje(state, ahora, 0)) return null;

  const { dia, cuando } = paraQueDia(ahora);
  if (yaEscogio(state, dia)) return null;

  const t = variante(TEXTOS.escogerLaRopa[cuando], dia);
  if (!t) return null;

  return {
    clave: `escoger-ropa:${dia}`,
    fuente: 'escoger-ropa',
    titulo: t.titulo,
    cuerpo: t.cuerpo,
    tono: 'var(--gold)',
    accion: { etiqueta: TEXTOS.escogerLaRopa.accion[cuando], tipo: 'sesion', cadencia: 'diaria' },
    descartar: TEXTOS.escogerLaRopa.descartar,
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
//
// El de escoger la ropa va de último aunque sea el que más habla: es el que
// vuelve todos los días, y si fuera primero taparía a los otros dos cada vez
// que les tocara turno.
export const FUENTES = [
  fuenteAgendar('semanal', 7, 7, 7),
  fuenteAgendar('mensual', 28, 21, 21),
  fuenteEscogerLaRopa,

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
