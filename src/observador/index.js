// ── El observador del observador ─────────────────────────────────────────
//
// La única sesión que puede desconfiar de las otras dos. No mira el trabajo:
// mira los instrumentos con que el jefe mide el trabajo.
//
// Cómo funciona, y por qué así:
//   · Una comprobación es una función pura (state, ctx) -> hallazgo | null.
//   · Se calculan TODAS y se presenta UNA, la que más tenga que decir esta
//     vez, convertida en pregunta. Es la doctrina del eco aplicada a los
//     números: un panel de doce gráficas convierte la introspección en
//     navegar datos, que es la versión analítica del juego de organizar.
//   · Cada hallazgo trae `fuerza` (0..1): cuánto tiene que decir. Gana la más
//     fuerte, y la del mes pasado pierde puntos para que no se repita.
//   · Si ninguna tiene material suficiente, no se inventa nada: devuelve
//     null y la sesión se va derecho a las preguntas difíciles. Una hoja en
//     blanco es mejor que un dato fabricado.
//
// Lo que estas funciones NO pueden mirar, y no es negociable:
//   · Rachas, días activos sobre días totales, curvas de actividad en el
//     tiempo, zonas muertas. Todo eso habla de la asistencia del jugador, y
//     el app no cuenta ausencias.
//   · El patrón por día de la semana. Es material para escoger la ropa, no
//     para el observador.
//   · El conteo de sesiones por tipo, salvo que se leyera como balance entre
//     el jefe y el hacedor. Nunca como cumplimiento.
//
// Lo que sí, y de dónde sale cada cosa:
//   · tono de las misiones completadas ......... camisetas[].misiones[].tonos
//   · duración de una identidad ................ created_at + camiseta_donada
//   · gastada vs. abandonada ................... snapshot del evento de donar
//   · creación vs. juego ....................... created_at + movimientos
//   · deriva del promedio de puntos ............ movimientos[].monto

import { HALLAZGOS, PREGUNTAS_DIFICILES, PREGUNTAS_COSTURERO } from './textos.js';
import { semanaDe } from '../ecos/index.js';

const DIA = 86400000;
const TONOS = ['fisica', 'emocional', 'creativa', 'profunda', 'estrategica'];
const round1 = (n) => Math.round(n * 10) / 10;

// Cuánto material hace falta antes de opinar. Con cuatro misiones completadas
// cualquier proporción es ruido con cara de hallazgo.
const MIN_MISIONES = 12;
const MIN_DONADAS = 3;
const VENTANA = 30;        // días de la ventana reciente, para la deriva
const MIN_POR_VENTANA = 5;

// ── Material crudo ───────────────────────────────────────────────────────

// Todas las misiones completadas que el estado todavía recuerda: las de las
// camisetas vivas y las que viajaron en el snapshot de una donación. Sin las
// segundas, el observador olvidaría justo las identidades que ya murieron,
// que son la mitad de lo que tiene para decir.
function misionesCompletadas(state) {
  const out = [];
  for (const c of (state?.camisetas || [])) {
    for (const m of (c.misiones || [])) {
      const veces = (m.completions || []).length + (m.completed_at ? 1 : 0);
      for (let i = 0; i < veces; i++) out.push({ tonos: m.tonos || [], forma: m.forma });
    }
  }
  for (const e of (state?.eventos || [])) {
    if (e.tipo !== 'camiseta_donada') continue;
    for (const m of (e.snapshot?.misiones || [])) {
      const veces = (m.completions || []).length + (m.completed_at ? 1 : 0);
      for (let i = 0; i < veces; i++) out.push({ tonos: m.tonos || [], forma: m.forma });
    }
  }
  return out;
}

// Las identidades que ya se fueron, con lo que duraron. Solo cuentan las que
// llevan created_at en el evento: las donadas antes de que el evento lo
// guardara no se pueden fechar, y estimarlas sería inventar.
function identidadesIdas(state) {
  const out = [];
  for (const e of (state?.eventos || [])) {
    if (e.tipo !== 'camiseta_donada') continue;
    const nacio = new Date(e.snapshot?.created_at || '').getTime();
    const murio = new Date(e.ts || '').getTime();
    if (isNaN(nacio) || isNaN(murio) || murio < nacio) continue;
    out.push({
      nombre: e.nombre,
      dias: Math.round((murio - nacio) / DIA),
      misiones: (e.snapshot?.misiones || []).length,
    });
  }
  return out;
}

const mediana = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

// ── Las comprobaciones ───────────────────────────────────────────────────

// El nivel del juego que el jefe está escribiendo. Una misión sin tono es un
// pendiente; muchas seguidas quieren decir que el juego se volvió una lista.
function verTonos(state) {
  const ms = misionesCompletadas(state);
  if (ms.length < MIN_MISIONES) return null;
  const sinTono = ms.filter(m => !m.tonos.length).length;
  const proporcion = sinTono / ms.length;

  if (proporcion >= 0.6) {
    return {
      clave: 'tonoDeLasMisiones',
      fuerza: Math.min(1, proporcion),
      material: { sinTono, total: ms.length },
    };
  }
  // Con tono, pero siempre el mismo: el juego se estrechó sin que nadie lo
  // decidiera.
  const cuenta = {};
  for (const t of TONOS) cuenta[t] = 0;
  for (const m of ms) for (const t of m.tonos) if (cuenta[t] !== undefined) cuenta[t]++;
  const conTono = ms.length - sinTono;
  if (conTono < MIN_MISIONES) return null;
  const [tono, cuantas] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  if (cuantas / conTono >= 0.7) {
    return {
      clave: 'tonoDominante',
      fuerza: 0.6 * (cuantas / conTono),
      material: { tono, cuantas, total: conTono },
    };
  }
  return null;
}

// Una camiseta que lleva mucho más viva de lo que ninguna le ha durado. La
// referencia es la del propio usuario, no un número de manual: sin
// identidades idas que puedan fecharse, esta comprobación se calla.
function verIdentidadLarga(state, ahora) {
  const idas = identidadesIdas(state);
  if (idas.length < MIN_DONADAS) return null;
  const tipico = mediana(idas.map(i => i.dias));
  if (!tipico) return null;

  let peor = null;
  for (const c of (state?.camisetas || [])) {
    const nacio = new Date(c.created_at || '').getTime();
    if (isNaN(nacio)) continue;
    const dias = Math.round((ahora.getTime() - nacio) / DIA);
    if (dias > tipico * 2 && (!peor || dias > peor.dias)) peor = { nombre: c.nombre, dias };
  }
  if (!peor) return null;
  return {
    clave: 'identidadLarga',
    fuerza: Math.min(1, peor.dias / (tipico * 4)),
    material: { nombre: peor.nombre, dias: peor.dias, tipico },
  };
}

// Las dos muertes de una camiseta. Una archivada con muchas misiones se usó
// bien; una con tres se abandonó. Distinguirlas es trabajo de observador.
function verComoMueren(state) {
  const idas = identidadesIdas(state).slice(-5);
  if (idas.length < MIN_DONADAS) return null;
  const misiones = idas.reduce((a, i) => a + i.misiones, 0);
  const promedio = misiones / idas.length;
  if (promedio > 3) return null;
  return {
    clave: 'gastadaVsAbandonada',
    fuerza: 0.7 * (1 - promedio / 4),
    material: { misiones, cuantas: idas.length },
  };
}

// Armar camisetas es la parte divertida. Jugarlas es la otra.
function verCreacionVsJuego(state, ahora) {
  const desde = ahora.getTime() - 90 * DIA;
  const jugadas = new Set((state?.movimientos || []).map(m => m.cam_id));
  const recientes = (state?.camisetas || []).filter(c => {
    const t = new Date(c.created_at || '').getTime();
    return !isNaN(t) && t >= desde;
  });
  if (recientes.length < 3) return null;
  const sinJugar = recientes.filter(c => !jugadas.has(c.id)).length;
  if (sinJugar / recientes.length < 0.5) return null;
  return {
    clave: 'creacionVsJuego',
    fuerza: 0.8 * (sinJugar / recientes.length),
    material: { creadas: recientes.length, sinJugar },
  };
}

// El jefe que se infla los puntos. Es la comprobación más incómoda y la que
// más justifica que esta sesión exista.
function verDerivaDePuntos(state, ahora) {
  const movs = (state?.movimientos || [])
    .filter(m => m.tipo === 'mision_completada' && typeof m.monto === 'number');
  const t0 = ahora.getTime();
  const reciente = movs.filter(m => t0 - new Date(m.ts).getTime() <= VENTANA * DIA);
  const previo = movs.filter(m => {
    const d = t0 - new Date(m.ts).getTime();
    return d > VENTANA * DIA && d <= 2 * VENTANA * DIA;
  });
  if (reciente.length < MIN_POR_VENTANA || previo.length < MIN_POR_VENTANA) return null;

  const prom = (l) => l.reduce((a, m) => a + m.monto, 0) / l.length;
  const antes = prom(previo), ahoraProm = prom(reciente);
  if (antes <= 0) return null;
  const cambio = (ahoraProm - antes) / antes;
  if (Math.abs(cambio) < 0.35) return null;
  return {
    clave: 'derivaDePuntos',
    fuerza: Math.min(1, Math.abs(cambio)),
    material: { antes: round1(antes), ahora: round1(ahoraProm), subio: cambio > 0 },
  };
}

const COMPROBACIONES = [verTonos, verIdentidadLarga, verComoMueren, verCreacionVsJuego, verDerivaDePuntos];

// ── La selección ─────────────────────────────────────────────────────────

// Una sola, la que más tenga que decir. La del mes pasado pierde fuerza para
// que la sesión no se vuelva la misma conversación cada treinta días — pero
// no queda descalificada: si sigue siendo con diferencia lo más gordo que
// pasa, vuelve, y que vuelva también es información.
export function mirar(state, { ahora = new Date(), ultimaClave = null } = {}) {
  const hallazgos = [];
  for (const comprobar of COMPROBACIONES) {
    let h = null;
    try { h = comprobar(state, ahora); } catch { h = null; }
    if (h) hallazgos.push(h);
  }
  if (!hallazgos.length) return null;

  const puntaje = (h) => h.fuerza * (h.clave === ultimaClave ? 0.5 : 1);
  hallazgos.sort((a, b) => puntaje(b) - puntaje(a));
  const elegido = hallazgos[0];
  const texto = HALLAZGOS[elegido.clave];
  const resolver = (x) => (typeof x === 'function' ? x(elegido.material) : x);
  return {
    clave: elegido.clave,
    pregunta: resolver(texto.pregunta),
    cuerpo: resolver(texto.cuerpo),
    material: elegido.material,
  };
}

// La pregunta del costurero. Estable dentro de la misma semana: si abres el
// ritual el martes y lo terminas el jueves, es la misma pregunta. Cambia al
// pasar a la semana siguiente.
export function preguntaDelCosturero(ahora = new Date()) {
  // La misma noción de semana que usan los ecos, anclada al lunes. Con
  // bloques de siete días desde enero la semana cortaba un miércoles, y
  // abrir el costurero el martes y terminarlo el jueves cambiaba la pregunta.
  const clave = semanaDe(ahora);
  let h = 0;
  for (let i = 0; i < clave.length; i++) h = (h * 31 + clave.charCodeAt(i)) | 0;
  return PREGUNTAS_COSTURERO[Math.abs(h) % PREGUNTAS_COSTURERO.length];
}

export { PREGUNTAS_DIFICILES, PREGUNTAS_COSTURERO };
